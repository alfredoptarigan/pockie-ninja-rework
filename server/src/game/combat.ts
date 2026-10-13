// Server-simulated fights against monsters (FightSystem) with their rewards and quest progress.
import { randomInt } from 'node:crypto'
import {
  avatarLevelFromAvatarId,
  createRandom,
  deriveStats,
  gainExp,
  simulateFight,
  type CombatStats,
  type Bonuses,
  type FighterInput,
  type SkillInput,
} from '@pockie/game-core'
import type { MonsterDrop } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { characters } from '../db/schema.js'
import {
  avatarSkillIds,
  avatarStats,
  dropItems,
  dropLib,
  itemNameKey,
  levels,
  npc,
  npcSkillIds,
  skill,
} from './data.js'
import { equipmentBonuses, equippedGear, type Gear } from './equipment.js'
import { KILL_LOSS, rollLibDrops, wearEquipped, type GrantedItem } from './gear.js'
import { drawPouch } from './pouch.js'
import { grantDrops, loadQuests, saveQuests, type Tx } from './progress.js'
import { questItemDrops, recordCollect, recordKill, type QuestProgress } from './quests.js'
import { buffBonuses, buffExp, buffStone, sumBonuses } from './nonfight-buffs.js'
import { vipDropMul } from './vip.js'

type CharacterRow = typeof characters.$inferSelect
/** A player's fighter keeps the derived stats (strength, weapon class) for display. */
export type PlayerFighter = FighterInput & CombatStats

/**
 * A lost field fight saves the fight's HP (0) and marks the player dead (FightSystem.Fight,
 * StateSystem); POST /revive brings them back. Explore fights pass 1: OutSearchSystem sets HP to
 * 1 when it reaches 0.
 */
export const DEFEATED_HP = 0
export const EXPLORE_MIN_HP = 1
/** CounterBombMul of NPCs that derive their avatar level from their level. */
const NO_AVATAR_LEVEL = -1

/** skill.ini rows for the given ids; empty slots (0) and ids missing from the data are skipped. */
export function skillRows(ids: number[]): SkillInput[] {
  return ids.flatMap((id) => {
    const row = id > 0 ? skill(id) : undefined
    return row ? [{ id, ...row }] : []
  })
}

/** Absent ids (no data row) leave `skills` unset, so the engine uses the generic 7777 / 8888. */
const skillsOf = (ids: number[] | undefined) => (ids ? { skills: skillRows(ids) } : {})

export function monsterFighter(id: string): FighterInput {
  const row = npc(id)!
  const n = (key: string) => Number(row[key] ?? 0)
  return {
    name: `lg_${row.Name}`,
    level: n('Level'),
    hp: n('HP'),
    maxHp: n('MaxHP'),
    mp: n('MP'),
    maxMp: n('MaxMP'),
    minAttack: n('MinAtk'),
    maxAttack: n('MaxAtk'),
    atkTime: n('AtkTime'),
    hit: n('HitMul'),
    dodge: n('DodgeMul'),
    crit: n('CritMul'),
    critAttach: n('CritAttach'),
    tough: n('Tough'),
    parry: n('ParryMul'),
    pierce: n('Pierce'),
    defense: n('Defense'),
    neglectDefense: n('NeglectDefAttach'),
    counter: n('CounterMul'),
    priority: n('PriorityMul'),
    ...(row.CounterBombMul !== undefined && n('CounterBombMul') !== NO_AVATAR_LEVEL
      ? { avatarLevel: n('CounterBombMul') }
      : {}),
    ...skillsOf(npcSkillIds(id)),
  }
}

export async function playerFighter(tx: Tx | Db, character: CharacterRow): Promise<PlayerFighter> {
  return playerFighterFrom(
    character,
    await equippedGear(tx, character.id),
    await buffBonuses(tx, character.id),
  )
}

/** A character's fighter from its equipped rows (RefreshSystem with the *Equip terms). */
export function playerFighterFrom(
  character: Pick<CharacterRow, 'name' | 'avatarId' | 'gender' | 'level' | 'hp' | 'mp'>,
  equipped: readonly Gear[],
  effects: Partial<Bonuses> = {},
): PlayerFighter {
  const stats = deriveStats(
    avatarStats(character.avatarId),
    character.level,
    sumBonuses(equipmentBonuses(equipped, character), effects),
  )
  return {
    ...stats,
    name: character.name,
    hp: Math.min(character.hp, stats.maxHp),
    mp: Math.min(character.mp, stats.maxMp),
    avatarLevel: avatarLevelFromAvatarId(character.avatarId),
    ...skillsOf(avatarSkillIds(character.avatarId)),
  }
}

/** A monster's drop lists that exist (NormalNpc DropLibID and AppendDropLibID). */
const monsterDropLibIds = (monsterId: string) =>
  [npc(monsterId)?.DropLibID, npc(monsterId)?.AppendDropLibID]
    .map(Number)
    .filter((libId) => libId > 0 && dropLib(libId))

/** Each item a monster can drop, once; the chances stay on the server like the original UI. */
export function monsterDrops(monsterId: string): MonsterDrop[] {
  const itemIds = monsterDropLibIds(monsterId).flatMap((libId) =>
    dropItems(libId)
      .filter((entry) => Number(entry.Probability) > 0)
      .map((entry) => String(entry.ItemConfig)),
  )
  return [...new Set(itemIds)].map((itemId) => ({ itemId, nameKey: itemNameKey(itemId) }))
}

export interface FightRewards {
  exp: number
  stone: number
  items: GrantedItem[]
  levelsGained: number
  /** Drops that did not fit in a full bag. */
  lost?: number
}

/**
 * Fights one monster, pays out a win (EXP, Stone, drops, quest kills and quest items) and saves
 * HP, MP, level and EXP. The caller checks that the monster may be fought.
 */
export async function fightMonster(
  tx: Tx,
  character: CharacterRow,
  monsterId: string,
  minHp = DEFEATED_HP,
) {
  const seed = randomInt(2 ** 31)
  const equipped = await equippedGear(tx, character.id)
  const effects = await buffBonuses(tx, character.id)
  const bonuses = sumBonuses(equipmentBonuses(equipped, character), effects)
  const statsAt = (level: number) => deriveStats(avatarStats(character.avatarId), level, bonuses)
  const replay = simulateFight({
    attackers: [playerFighterFrom(character, equipped, effects)],
    defenders: [monsterFighter(monsterId)],
    seed,
  })
  const won = replay.winner === 'attackers'
  const rewards: FightRewards = { exp: 0, stone: 0, items: [], levelsGained: 0 }
  let { level, exp } = character
  const explore = minHp > DEFEATED_HP
  // A timeout loss can leave HP above 0; the player is dead all the same.
  let hp = won || explore ? replay.fighters[0]!.hp : DEFEATED_HP
  let mp = replay.fighters[0]!.mp

  if (won) {
    const monster = npc(monsterId)!
    const random = createRandom(seed ^ 0x5eed)
    const dropMul = vipDropMul(character)
    rewards.exp = buffExp(Number(monster.NpcExp ?? 0), character, bonuses.expMul)
    rewards.stone = random.between(
      Number(monster.DropCapital0Min ?? 0),
      Number(monster.DropCapital0Max ?? 0),
    )
    rewards.stone = buffStone(rewards.stone, bonuses.capMul)
    for (const libId of monsterDropLibIds(monsterId)) {
      rewards.items.push(...rollLibDrops(libId, random, dropMul))
    }

    const table = levels()
    const gained = gainExp(level, exp, rewards.exp, table.levelexp, table.role.maxlevel)
    rewards.levelsGained = gained.levelsGained
    level = gained.level
    exp = gained.exp
    if (gained.levelsGained > 0) {
      const stats = statsAt(level)
      hp = stats.maxHp
      mp = stats.maxMp
    }

    let progress: QuestProgress[] = await loadQuests(tx, character.id)
    const changed = new Set<number>()
    const apply = (updates: QuestProgress[]) => {
      for (const update of updates) changed.add(update.taskId)
      progress = progress.map((q) => updates.find((u) => u.taskId === q.taskId) ?? q)
    }
    const questItems = questItemDrops(progress, monsterId, character.sceneId, random, dropMul)
    apply(recordKill(progress, monsterId, character.sceneId))
    // Quest items take the last bag rows first; a full bag loses the rest of the loot.
    const keptQuestItems = await grantDrops(
      tx,
      character.id,
      questItems.map((itemId) => ({ itemId, bound: true })),
    )
    for (const questItem of keptQuestItems) apply(recordCollect(progress, questItem.itemId))
    await saveQuests(
      tx,
      character.id,
      progress.filter((q) => changed.has(q.taskId)),
    )
    const keptLoot = await grantDrops(tx, character.id, rewards.items)
    const lost = rewards.items.length + questItems.length - keptLoot.length - keptQuestItems.length
    rewards.items = [...keptLoot, ...keptQuestItems]
    if (lost > 0) rewards.lost = lost
    // HardinessSystem 170-182: worn gear loses 1 per enemy killed (one monster per fight).
    await wearEquipped(tx, character.id, () => KILL_LOSS)
  }

  // RoleUseSystem.OnCommandFightEnd draws on the pouches after a win; OutSearchSystem does it
  // after every explore fight, before lifting HP 0 to 1.
  let { hpPouch, mpPouch } = character
  if (won || explore) {
    const stats = statsAt(level)
    ;({ value: hp, pouch: hpPouch } = drawPouch(hp, stats.maxHp, hpPouch))
    ;({ value: mp, pouch: mpPouch } = drawPouch(mp, stats.maxMp, mpPouch))
  }
  hp = Math.max(minHp, hp)

  await tx
    .update(characters)
    .set({ hp, mp, hpPouch, mpPouch, level, exp, stone: character.stone + rewards.stone })
    .where(eq(characters.id, character.id))
  return { replay, won, rewards }
}
