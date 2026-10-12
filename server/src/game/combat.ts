// Server-simulated fights against monsters (FightSystem) with their rewards and quest progress.
import { randomInt } from 'node:crypto'
import {
  avatarLevelFromAvatarId,
  createRandom,
  deriveStats,
  gainExp,
  rollDrops,
  simulateFight,
  type Bonuses,
  type CombatStats,
  type DropEntry,
  type DropLib,
  type FighterInput,
  type SkillInput,
} from '@pockie/game-core'
import type { MonsterDrop } from '@pockie/shared'
import { and, eq, isNotNull } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { characters, inventoryItems } from '../db/schema.js'
import {
  avatarSkillIds,
  avatarStats,
  dropItems,
  dropLib,
  item,
  itemNameKey,
  levels,
  npc,
  npcSkillIds,
  skill,
} from './data.js'
import { drawPouch } from './pouch.js'
import { grantItems, loadQuests, saveQuests, type Tx } from './progress.js'
import { questItemDrops, recordCollect, recordKill, type QuestProgress } from './quests.js'

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

async function equippedItemIds(tx: Tx | Db, characterId: string) {
  const rows = await tx
    .select({ itemId: inventoryItems.itemId })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.characterId, characterId), isNotNull(inventoryItems.equippedSlot)))
  return rows.map((row) => row.itemId)
}

export async function playerFighter(tx: Tx | Db, character: CharacterRow): Promise<PlayerFighter> {
  return playerFighterFrom(character, await equippedItemIds(tx, character.id))
}

/** RefreshSystem *Equip terms: deriveStats bonuses plus the ones fighters take as they are. */
type EquipBonuses = Partial<Bonuses> & { tough?: number; pierce?: number; neglectDefense?: number }

/**
 * EquipSystem.AddOtherProp: item.ini OtherPropName → the RefreshSystem term it feeds. With no
 * *MulMul equipment terms, hit/crit/tough/pierce/neglectDefense are plain sums. Not ported yet:
 * DecDamageEquip and VampiricHPEquip (level 21+ items), as the battle engine has no damage
 * reduction or life steal.
 */
const OTHER_PROPS: Record<string, keyof EquipBonuses> = {
  MaxHPEquip: 'hp',
  MaxMPEquip: 'mp',
  MaxHPMulEquip: 'hpMul',
  AbsAddAtkMulEquip: 'attackMul',
  AtkTimeMulEquip: 'atkTimeMul',
  DodgeMulEquip: 'dodge',
  ParryMulEquip: 'parry',
  HitMulEquip: 'hit',
  CritMulEquip: 'crit',
  DefenseEquip: 'defense',
  CounterMulEquip: 'counter',
  ToughEquip: 'tough',
  PierceEquip: 'pierce',
  NeglectDefAttachEquip: 'neglectDefense',
}

/**
 * EquipSystem.RefreshEquipProperty: each equipped item's GetEquipSelfProp (AttackMin/Max,
 * Defense) and AddOtherProp (`OtherPropName` / `OtherPropValue`, `;`-separated) summed.
 * Identify, jewel, inscribe, consolidation and suit bonuses belong to item instances and are not
 * modelled.
 */
export function equipmentBonuses(itemIds: string[]): EquipBonuses {
  const bonuses: Record<string, number> = {}
  const add = (key: keyof EquipBonuses, value: number) => {
    bonuses[key] = (bonuses[key] ?? 0) + value
  }
  for (const itemId of itemIds) {
    const row = item(itemId)
    if (!row) continue
    add('minAttack', Number(row.AttackMin ?? 0))
    add('maxAttack', Number(row.AttackMax ?? 0))
    add('defense', Number(row.Defense ?? 0))
    const names = String(row.OtherPropName ?? '').split(';')
    const values = String(row.OtherPropValue ?? '').split(';')
    // AddOtherProp skips the list when the two lengths differ.
    if (names.length !== values.length) continue
    names.forEach((name, i) => {
      const key = OTHER_PROPS[name]
      if (key) add(key, Number(values[i]))
    })
  }
  return bonuses
}

/** Max HP/MP and the other derived stats at `level` with the equipped items. */
const statsWith = (avatarId: number, level: number, bonuses: EquipBonuses) =>
  deriveStats(avatarStats(avatarId), level, bonuses)

/** A character's fighter from its equipped item ids. */
export function playerFighterFrom(
  character: Pick<CharacterRow, 'name' | 'avatarId' | 'level' | 'hp' | 'mp'>,
  equippedItemIds: string[],
): PlayerFighter {
  const bonuses = equipmentBonuses(equippedItemIds)
  const stats = statsWith(character.avatarId, character.level, bonuses)
  return {
    ...stats,
    name: character.name,
    hp: Math.min(character.hp, stats.maxHp),
    mp: Math.min(character.mp, stats.maxMp),
    neglectDefense: bonuses.neglectDefense ?? 0,
    tough: bonuses.tough ?? 0,
    pierce: bonuses.pierce ?? 0,
    priority: 0,
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
  items: { itemId: string; bound: boolean }[]
  levelsGained: number
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
  const equipped = await equippedItemIds(tx, character.id)
  const bonuses = equipmentBonuses(equipped)
  const replay = simulateFight({
    attackers: [playerFighterFrom(character, equipped)],
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
    rewards.exp = Number(monster.NpcExp ?? 0)
    rewards.stone = random.between(
      Number(monster.DropCapital0Min ?? 0),
      Number(monster.DropCapital0Max ?? 0),
    )
    for (const libId of monsterDropLibIds(monsterId)) {
      rewards.items.push(
        ...rollDrops(
          dropLib(libId) as unknown as DropLib,
          dropItems(libId) as unknown as DropEntry[],
          random,
        ),
      )
    }

    const table = levels()
    const gained = gainExp(level, exp, rewards.exp, table.levelexp, table.role.maxlevel)
    rewards.levelsGained = gained.levelsGained
    level = gained.level
    exp = gained.exp
    if (gained.levelsGained > 0) {
      const stats = statsWith(character.avatarId, level, bonuses)
      hp = stats.maxHp
      mp = stats.maxMp
    }

    let progress: QuestProgress[] = await loadQuests(tx, character.id)
    const changed = new Set<number>()
    const apply = (updates: QuestProgress[]) => {
      for (const update of updates) changed.add(update.taskId)
      progress = progress.map((q) => updates.find((u) => u.taskId === q.taskId) ?? q)
    }
    const questItems = questItemDrops(progress, monsterId, character.sceneId, random)
    apply(recordKill(progress, monsterId, character.sceneId))
    for (const questItem of questItems) {
      rewards.items.push({ itemId: questItem, bound: true })
      apply(recordCollect(progress, questItem))
    }
    await saveQuests(
      tx,
      character.id,
      progress.filter((q) => changed.has(q.taskId)),
    )
    await grantItems(tx, character.id, rewards.items)
  }

  // RoleUseSystem.OnCommandFightEnd draws on the pouches after a win; OutSearchSystem does it
  // after every explore fight, before lifting HP 0 to 1.
  let { hpPouch, mpPouch } = character
  if (won || explore) {
    const stats = statsWith(character.avatarId, level, bonuses)
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
