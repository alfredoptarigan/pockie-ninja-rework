// Server-simulated fights against monsters (FightSystem) with their rewards and quest progress.
import { randomInt } from 'node:crypto'
import {
  avatarLevelFromAvatarId,
  createRandom,
  deriveStats,
  gainExp,
  rollDrops,
  simulateFight,
  type DropEntry,
  type DropLib,
  type FighterInput,
  type SkillInput,
} from '@pockie/game-core'
import { and, eq, isNotNull } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { characters, inventoryItems } from '../db/schema.js'
import {
  avatarSkillIds,
  avatarStats,
  dropItems,
  dropLib,
  item,
  levels,
  npc,
  npcSkillIds,
  skill,
} from './data.js'
import { grantItems, loadQuests, saveQuests, type Tx } from './progress.js'
import { questItemDrops, recordCollect, recordKill, type QuestProgress } from './quests.js'

type CharacterRow = typeof characters.$inferSelect

// ponytail: the original revive rules (ReliveSystem) are not ported; a lost fight leaves 1 HP.
const HP_AFTER_DEFEAT = 1
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

export async function playerFighter(tx: Tx | Db, character: CharacterRow): Promise<FighterInput> {
  const equipped = await tx
    .select({ itemId: inventoryItems.itemId })
    .from(inventoryItems)
    .where(
      and(eq(inventoryItems.characterId, character.id), isNotNull(inventoryItems.equippedSlot)),
    )
  return playerFighterFrom(
    character,
    equipped.map((row) => row.itemId),
  )
}

/** A character's fighter from its equipped item ids (EquipSystem.GetEquipSelfProp). */
export function playerFighterFrom(
  character: Pick<CharacterRow, 'name' | 'avatarId' | 'level' | 'hp' | 'mp'>,
  equippedItemIds: string[],
): FighterInput {
  const bonus = { minAttack: 0, maxAttack: 0, defense: 0 }
  for (const itemId of equippedItemIds) {
    const row = item(itemId)
    bonus.minAttack += Number(row?.AttackMin ?? 0)
    bonus.maxAttack += Number(row?.AttackMax ?? 0)
    bonus.defense += Number(row?.Defense ?? 0)
  }
  const stats = deriveStats(avatarStats(character.avatarId), character.level, bonus)
  return {
    ...stats,
    name: character.name,
    hp: Math.min(character.hp, stats.maxHp),
    mp: Math.min(character.mp, stats.maxMp),
    neglectDefense: 0,
    tough: 0,
    pierce: 0,
    priority: 0,
    avatarLevel: avatarLevelFromAvatarId(character.avatarId),
    ...skillsOf(avatarSkillIds(character.avatarId)),
  }
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
export async function fightMonster(tx: Tx, character: CharacterRow, monsterId: string) {
  const seed = randomInt(2 ** 31)
  const replay = simulateFight({
    attackers: [await playerFighter(tx, character)],
    defenders: [monsterFighter(monsterId)],
    seed,
  })
  const won = replay.winner === 'attackers'
  const rewards: FightRewards = { exp: 0, stone: 0, items: [], levelsGained: 0 }
  let { level, exp } = character
  let hp = won ? replay.fighters[0]!.hp : HP_AFTER_DEFEAT
  let mp = replay.fighters[0]!.mp

  if (won) {
    const monster = npc(monsterId)!
    const random = createRandom(seed ^ 0x5eed)
    rewards.exp = Number(monster.NpcExp ?? 0)
    rewards.stone = random.between(
      Number(monster.DropCapital0Min ?? 0),
      Number(monster.DropCapital0Max ?? 0),
    )
    for (const libId of [monster.DropLibID, monster.AppendDropLibID].map(Number)) {
      const lib = libId > 0 ? dropLib(libId) : undefined
      if (lib) {
        rewards.items.push(
          ...rollDrops(
            lib as unknown as DropLib,
            dropItems(libId) as unknown as DropEntry[],
            random,
          ),
        )
      }
    }

    const table = levels()
    const gained = gainExp(level, exp, rewards.exp, table.levelexp, table.role.maxlevel)
    rewards.levelsGained = gained.levelsGained
    level = gained.level
    exp = gained.exp
    if (gained.levelsGained > 0) {
      const stats = deriveStats(avatarStats(character.avatarId), level)
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

  await tx
    .update(characters)
    .set({ hp, mp, level, exp, stone: character.stone + rewards.stone })
    .where(eq(characters.id, character.id))
  return { replay, won, rewards }
}
