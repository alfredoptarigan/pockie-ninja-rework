// Server-simulated fights against monsters (FightSystem) with their rewards and quest progress.
import { randomInt } from 'node:crypto'
import {
  avatarLevelFromAvatarId,
  createRandom,
  deriveStats,
  equipBonuses,
  gainExp,
  NATION_PASSIVES,
  simulateFight,
  type CombatStats,
  type Bonuses,
  type FighterInput,
  type SkillInput,
} from '@pockie/game-core'
import type { MonsterDrop } from '@pockie/shared'
import type { Db } from '../db/client.js'
import { characters } from '../db/schema.js'
import {
  avatarSkillIds,
  avatarStats,
  outfitOfAvatar,
  dropItems,
  dropLib,
  item,
  itemNameKey,
  levels,
  npc,
  npcSkillIds,
  skill,
  skillAddRow,
} from './data.js'
import { equipmentBonuses, equippedGear, type Gear } from './equipment.js'
import { secretThreshold } from './outfit.js'
import { KILL_LOSS, rollLibDrops, wearEquipped, type GrantedItem } from './gear.js'
import { drawPouch } from './pouch.js'
import { grantDrops, loadQuests, saveQuests, saveCharacterProgress, type Tx } from './progress.js'
import { questItemDrops, recordCollect, recordKill, type QuestProgress } from './quests.js'
import { talentFighterInput } from './talents.js'
import { bloodlineBonuses } from './bloodlines.js'
import { wingBonuses } from './wings.js'
import { collectionBonuses } from './collection.js'
import { sanninBonuses } from './sannin.js'
import { cardBoxDrop } from './card-boxes.js'
import { activePetFighterInput, grantPetExp } from './pets.js'
import { characterSkillInputs } from './skill-bar.js'
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

type PetFighterInput = Awaited<ReturnType<typeof activePetFighterInput>>

/**
 * Buffs, active bloodline limits (M5 decision 11), the worn wing (M6 decision 23) and the active
 * pet's bonuses (M6 decision 15), plus the Collection's STR / AGI / STA and percent bonuses.
 * The Sannin Test rank adds its permanent Max HP.
 * The pet's skills ride on `pet`, never in the learned skills.
 */
export const fighterEffects = async (
  tx: Tx | Db,
  characterId: string,
  pet: PetFighterInput = null,
) =>
  sumBonuses(
    await buffBonuses(tx, characterId),
    await bloodlineBonuses(tx, characterId),
    await wingBonuses(tx, characterId),
    await collectionBonuses(tx, characterId),
    await sanninBonuses(tx, characterId),
    pet?.bonuses ?? {},
  )

export async function playerFighter(tx: Tx | Db, character: CharacterRow): Promise<PlayerFighter> {
  const pet = await activePetFighterInput(tx, character.id)
  return {
    ...playerFighterFrom(
      character,
      await equippedGear(tx, character.id),
      await fighterEffects(tx, character.id, pet),
      await characterSkillInputs(tx, character.id),
    ),
    talents: await talentFighterInput(tx, character.id),
    ...(pet && { pet: pet.pet }),
  }
}

/** Matches the *Skill property names of skilladd.ini (MaxHPMulSKill keeps its original typo). */
const SKILL_TERM = /S[Kk]ill$/

/**
 * SkillSystem.RefreshSkillProperty: every passive (type 3) adds its skilladd.ini row to the *Skill
 * terms, which RefreshSystem sums like the *Equip ones. Rows that name a final property (MaxHP,
 * CounterBombMul, ...) are overwritten by RefreshRoleProperty in the original, so they add nothing.
 */
export function passiveBonuses(skills: readonly SkillInput[]): Partial<Bonuses> {
  const totals: Record<string, number> = {}
  for (const { type, skilladd } of skills) {
    if (type !== 3 || !skilladd) continue
    for (const [name, value] of Object.entries(skillAddRow(skilladd) ?? {})) {
      if (!SKILL_TERM.test(name)) continue
      const term = name.replace(SKILL_TERM, 'Equip')
      totals[term] = (totals[term] ?? 0) + value
    }
  }
  return equipBonuses(totals)
}

type FighterCharacter = Pick<
  CharacterRow,
  'name' | 'avatarId' | 'gender' | 'level' | 'hp' | 'mp' | 'nation'
>

/**
 * RefreshPlayerSkill: the learned skills, the outfit's AvatarSkill row and one level of the
 * nation's element passive (NationUpSkill.ini). Element passives only have level 1, so the extra
 * level resolves to the same row, and AddSkill keeps one row per id. Outfit recasts are M6.
 */
const characterSkills = (character: FighterCharacter, learned: SkillInput[]) => {
  const all = [
    ...learned,
    ...skillRows(avatarSkillIds(character.avatarId) ?? [7777, 8888]),
    ...skillRows([NATION_PASSIVES[character.nation] ?? 0]),
  ]
  return all.filter((row, i) => all.findIndex((other) => other.id === row.id) === i)
}

/** Equipment, buff and passive skill bonuses of a character (RefreshRoleProperty reason 0). */
const characterBonuses = (
  character: FighterCharacter,
  equipped: readonly Gear[],
  effects: Partial<Bonuses>,
  skills: readonly SkillInput[],
) => sumBonuses(equipmentBonuses(equipped, character), effects, passiveBonuses(skills))

/** Art of the worn wing (WingSprite) or aura (BattleAura), drawn in replays (M6 decision 22). */
export function wingLook(equipped: readonly Gear[]): { wingSprite?: string; aura?: string } {
  for (const { itemId } of equipped) {
    const def = item(itemId)
    if (def?.WingSprite) return { wingSprite: String(def.WingSprite) }
    if (def?.BattleAura) return { aura: String(def.BattleAura) }
  }
  return {}
}

/** Reborn's fifth outfit star: the worn outfit's Secret Technique threshold, when raised. */
function secretThresholdOf(equipped: readonly Gear[]) {
  const outfit = equipped.find((gear) => item(gear.itemId)?.class === 'AvatarItem')
  const threshold = secretThreshold(outfit?.stars ?? 0)
  return threshold === undefined ? {} : { secretThreshold: threshold }
}

/** A character's fighter from its equipped rows (RefreshSystem with the *Equip terms). */
export function playerFighterFrom(
  character: FighterCharacter,
  equipped: readonly Gear[],
  effects: Partial<Bonuses> = {},
  learned: SkillInput[] = [],
): PlayerFighter {
  const skills = characterSkills(character, learned)
  // Reborn stacks the nation's element passive on a learned copy (a Fire Village character with
  // Fire Release learned shows SkillAdd0 6), while the fight keeps one row per id.
  const nationRepeat = learned.filter((row) => row.id === NATION_PASSIVES[character.nation])
  const stats = deriveStats(
    avatarStats(character.avatarId),
    character.level,
    characterBonuses(character, equipped, effects, [...skills, ...nationRepeat]),
  )
  return {
    ...stats,
    name: character.name,
    hp: Math.min(character.hp, stats.maxHp),
    mp: Math.min(character.mp, stats.maxMp),
    avatarLevel:
      outfitOfAvatar(character.avatarId)?.tier ?? avatarLevelFromAvatarId(character.avatarId),
    ...secretThresholdOf(equipped),
    // The engine only reads type 1 and 2; passives (type 3) stay listed, like the PassiveSkill rec.
    skills,
    ...wingLook(equipped),
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
  return [...new Set(itemIds)]
    .filter((itemId) => !/^i15900[0-3]$/.test(itemId))
    .map((itemId) => ({ itemId, nameKey: itemNameKey(itemId) }))
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
  // Ticket bosses fight a level variant but quests target the standing boss.
  questMonsterId = monsterId,
) {
  const seed = randomInt(2 ** 31)
  const equipped = await equippedGear(tx, character.id)
  const pet = await activePetFighterInput(tx, character.id)
  const effects = await fighterEffects(tx, character.id, pet)
  const learned = await characterSkillInputs(tx, character.id)
  const bonuses = characterBonuses(
    character,
    equipped,
    effects,
    characterSkills(character, learned),
  )
  const statsAt = (level: number) => deriveStats(avatarStats(character.avatarId), level, bonuses)
  const replay = simulateFight({
    attackers: [
      { ...playerFighterFrom(character, equipped, effects, learned), ...(pet && { pet: pet.pet }) },
    ],
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
    rewards.items.push(...cardBoxDrop('fieldWin', random))

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
    const questItems = questItemDrops(progress, questMonsterId, character.sceneId, random, dropMul)
    apply(recordKill(progress, questMonsterId, character.sceneId))
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

  await saveCharacterProgress(tx, character.id, {
    hp,
    mp,
    hpPouch,
    mpPouch,
    level,
    exp,
    stone: character.stone + rewards.stone,
  })
  // M6 decision 12: the active pet shares a win's EXP.
  if (won) await grantPetExp(tx, character.id, rewards.exp)
  return { replay, won, rewards }
}
