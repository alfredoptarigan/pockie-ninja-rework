// Usage: pnpm db:seed-qa
// Creates (or refreshes) the local QA account `qapockieninja` / `password123`: a level-90 ninja in
// the Itachi Uchiha outfit with max currencies, skills, talents, bloodlines, pets, a +12 level-90
// gear set, a +20 wing and a bag of test items. Idempotent: the user and character rows are
// updated in place; the kit rows of that one character (bag, skills, talents, bloodlines, pets)
// are replaced on every run. Refuses to run in production.
import { createRandom, deriveStats, ELEMENT_PASSIVES, LEARNABLE_NINJUTSU } from '@pockie/game-core'
import { SCROLL_SKILLS_PER_TREE, SKILL_SLOTS_PER_TREE, SKILL_TREE_COUNT } from '@pockie/shared'
import { and, eq } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { KENNEL_MAX_SLOTS, PET_MAX_LEVEL } from '../../game-core/src/pets/constants.js'
import { newFoodSlots } from '../../game-core/src/pets/feeding.js'
import { rollBases, speciesBaseProps } from '../../game-core/src/pets/stats.js'
import { talentCap, TALENT_IDS } from '../../game-core/src/reborn/talents.js'
import { createDb } from '../src/db/client.js'
import {
  characterBloodlinePrayer,
  characterBloodlines,
  characterPets,
  characterPetSkills,
  characterQuests,
  characters,
  characterSkills,
  characterSkillSlots,
  characterSkillState,
  characterSouls,
  characterTalents,
  characterWingCollection,
  inventoryItems,
  users,
} from '../src/db/schema.js'
import { loadEnv } from '../src/env.js'
import { playerFighter } from '../src/game/combat.js'
import {
  outfitForClothing,
  avatarStats,
  FIRST_TUTORIAL_TASK,
  item,
  levels,
  nationScenes,
  rebornBloodlines,
  rebornScrollSkills,
  rebornSouls,
  rebornTalents,
  task,
} from '../src/game/data.js'
import { itemStackSize } from '../src/game/bag.js'
import { petSpecies } from '../src/game/pets.js'
import { pouchMax } from '../src/game/pouch.js'
import { acceptQuest, type Tx } from '../src/game/progress.js'
import { WING_SLOT } from '../src/game/wings.js'
import { refreshArenaSnapshot } from '../src/modules/arena/snapshot.js'
import { hashPassword } from '../src/modules/auth/password.js'
import { learnPool } from '../src/modules/pets/kennel.js'

const USERNAME = 'qapockieninja'
const EMAIL = 'qapockieninja@example.com'
const PASSWORD = 'password123'
const NINJA_NAME = 'QA_Madara'
const NATION = 0 // Fire
const GENDER = 0 // male
// There is no Madara outfit in the 2011 data (Madara is only a Reborn card); Itachi Uchiha
// (avatar-clothing 49, male, weapon class 2 Sharp) is the closest wearable, rendered Uchiha outfit.
const CLOTHING = 49
const LEVEL = levels().role.maxlevel

const CURRENCY = {
  stone: 1_000_000_000,
  gold: 10_000_000,
  giftCoupon: 10_000_000,
  battleCoins: 1_000_000,
  honor: 1_000_000,
}

const GEAR_ENHANCE = 12
const WING = 'i218018'
const WING_ENHANCE = 20
// Lament set (SuitID 8860, level 83-90, every armor and accessory slot) + Deathgaze Blade (86).
const GEAR = [
  'i260118',
  'i288601',
  'i288602',
  'i288603',
  'i288604',
  'i288605',
  'i288606',
  'i288607',
]

/** Bag kit: [item id, wanted count]; counts are capped at the item's stack size. */
const BAG: [string, number][] = [
  ...['i171001', 'i171002', 'i171003', 'i171004', 'i171005'].map((id): [string, number] => [
    id,
    50,
  ]),
  ...Array.from({ length: 15 }, (_, n): [string, number] => [`i${170113 + n}`, 50]),
  ['i218020', 200],
  ['i218021', 200],
  ['i218022', 50],
  ['i218023', 50],
  ['i218034', 10],
  ['i218044', 10],
  ['i218054', 10],
  ['i150319', 999], // Feathers (pet evolution)
  ['i150406', 100], // Pet Skill Lock
  ['i152027', 99], // Oblivion Potion (pet skill removal)
  ['i160036', 100],
  ['i160080', 100],
  ['i160081', 100],
  ['i160059', 1],
  ['i160079', 1],
]

/** [species, level, active]; the active one gets skill slots and skills. */
const PETS: [string, number, boolean][] = [
  ['i320037', PET_MAX_LEVEL, true],
  ['i320036', 40, false],
  ['i320030', 30, false],
  ['i320002', 1, false],
]
/** Unlocked slots per kind (1 Halo, 2 Help, 3 Pass) on the active pet: 5 = MaxSkillCount. */
const PET_SLOTS = { 1: 2, 2: 2, 3: 1 } as const

const ACTIVE_TALENTS = 3
const ACTIVE_LIMITS = 3
const SOULS_PER_LIMIT = 5
const LOOSE_SOULS = 5

const env = loadEnv()
if (env.NODE_ENV === 'production') {
  console.error('db:seed-qa refuses to run with NODE_ENV=production.')
  process.exit(1)
}

const random = createRandom(randomInt(2 ** 31))

async function upsertUser(tx: Tx) {
  const passwordHash = await hashPassword(PASSWORD)
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameLower, USERNAME))
  if (existing) {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, existing.id))
    return existing.id
  }
  const [created] = await tx
    .insert(users)
    .values({ username: USERNAME, email: EMAIL, passwordHash })
    .returning({ id: users.id })
  return created!.id
}

async function upsertCharacter(tx: Tx, userId: string) {
  const { avatarId } = outfitForClothing(CLOTHING)
  const stats = deriveStats(avatarStats(avatarId), LEVEL)
  const castle = nationScenes()[NATION]!.castle
  const values = {
    name: NINJA_NAME,
    gender: GENDER,
    nation: NATION,
    clothing: CLOTHING,
    avatarId,
    level: LEVEL,
    exp: 0,
    ...CURRENCY,
    hp: stats.maxHp,
    mp: stats.maxMp,
    hpPouch: pouchMax(LEVEL),
    mpPouch: pouchMax(LEVEL),
    sceneId: castle,
    scenesEntered: [castle],
    petSlots: KENNEL_MAX_SLOTS,
  }
  const [existing] = await tx
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.userId, userId))
  if (existing) {
    await tx.update(characters).set(values).where(eq(characters.id, existing.id))
    return { id: existing.id, created: false }
  }
  const [created] = await tx
    .insert(characters)
    .values({ userId, ...values })
    .returning({ id: characters.id })
  return { id: created!.id, created: true }
}

/** Completes the village tutorial chain once and starts the main story it leads to. */
async function seedTutorial(tx: Tx, characterId: string) {
  const chain: number[] = []
  for (let id = FIRST_TUTORIAL_TASK[NATION]!; id >= 90000; id = Number(task(id)!.NextTaskID))
    chain.push(id)
  const next = Number(task(chain.at(-1)!)!.NextTaskID)
  const now = new Date()
  for (const taskId of chain)
    await tx
      .insert(characterQuests)
      .values({ characterId, taskId, state: 2, progress: [], completedAt: now })
      .onConflictDoUpdate({
        target: [characterQuests.characterId, characterQuests.taskId],
        set: { state: 2, completedAt: now },
      })
  const [started] = await tx
    .select()
    .from(characterQuests)
    .where(and(eq(characterQuests.characterId, characterId), eq(characterQuests.taskId, next)))
  if (!started) await acceptQuest(tx, characterId, next)
}

async function clearKit(tx: Tx, characterId: string) {
  // Souls reference bloodline rows without a cascade; prayer, pet skills and slots cascade.
  await tx.delete(characterSouls).where(eq(characterSouls.characterId, characterId))
  await tx.delete(characterBloodlines).where(eq(characterBloodlines.characterId, characterId))
  await tx.delete(characterTalents).where(eq(characterTalents.characterId, characterId))
  await tx.delete(characterSkills).where(eq(characterSkills.characterId, characterId))
  await tx.delete(characterSkillState).where(eq(characterSkillState.characterId, characterId))
  await tx.delete(characterPets).where(eq(characterPets.characterId, characterId))
  await tx
    .delete(characterWingCollection)
    .where(eq(characterWingCollection.characterId, characterId))
  await tx.delete(inventoryItems).where(eq(inventoryItems.characterId, characterId))
}

async function seedSkills(tx: Tx, characterId: string) {
  const scrolls = Object.keys(rebornScrollSkills()).map(Number)
  // Learned skills sit at MAX_LEARNED_SKILL_LEVEL 1 (UpSkilCfg MaxLevel); scrolls are permanent.
  await tx.insert(characterSkills).values(
    [...LEARNABLE_NINJUTSU, ...ELEMENT_PASSIVES, ...scrolls].map((skillId) => ({
      characterId,
      skillId,
      level: 1,
    })),
  )
  await tx
    .insert(characterSkillState)
    .values({ characterId, learnedThrough: LEVEL, activeTree: 0, freeResets: 5 })
  const ninjutsu = [...LEARNABLE_NINJUTSU]
  const slots = Array.from({ length: SKILL_TREE_COUNT }, (_, tree) => {
    const picks = [
      ...(tree === 0 ? scrolls.slice(0, SCROLL_SKILLS_PER_TREE) : []),
      ...ninjutsu.splice(0, SKILL_SLOTS_PER_TREE),
    ].slice(0, SKILL_SLOTS_PER_TREE)
    return picks.map((skillId, slot) => ({ characterId, tree, slot, skillId, level: 1 }))
  }).flat()
  await tx.insert(characterSkillSlots).values(slots)
}

async function seedTalents(tx: Tx, characterId: string) {
  const level = Math.min(talentCap(LEVEL), rebornTalents().expNeeded.length)
  await tx.insert(characterTalents).values(
    TALENT_IDS.map((talentId, i) => ({
      characterId,
      talentId,
      level,
      activeSlot: i < ACTIVE_TALENTS ? i : null,
    })),
  )
}

async function seedBloodlines(tx: Tx, characterId: string) {
  const limits = rebornBloodlines().limits
  const souls = rebornSouls()
  const now = new Date()
  const active = [...limits]
    .sort((a, b) => b.requiredLevel - a.requiredLevel || b.id - a.id)
    .slice(0, ACTIVE_LIMITS)
    .map((limit) => limit.id)
  await tx.insert(characterBloodlines).values(
    limits.map((limit) => ({
      characterId,
      limitId: limit.id,
      amity: limit.amity,
      unlockedAt: now,
      activeSlot: active.includes(limit.id) ? active.indexOf(limit.id) : null,
    })),
  )
  const maxSoulLevel = souls.levelLimits.length
  const types = souls.types.map((type) => type.id)
  await tx.insert(characterSouls).values([
    ...active.flatMap((limitId, n) =>
      Array.from({ length: SOULS_PER_LIMIT }, (_, socket) => ({
        characterId,
        type: types[(n * SOULS_PER_LIMIT + socket) % types.length]!,
        level: maxSoulLevel,
        limitId,
        socket,
      })),
    ),
    ...types.slice(0, LOOSE_SOULS).map((type) => ({ characterId, type, level: 5 })),
  ])
  await tx.insert(characterBloodlinePrayer).values(
    active.map((limitId, n) => ({
      characterId,
      limitId,
      attribute: (n % 3) + 1,
      level: souls.prayer.maxLevel,
    })),
  )
}

async function seedPets(tx: Tx, characterId: string) {
  for (const [kennelSlot, [item, level, active]] of PETS.entries()) {
    const species = petSpecies(item)
    if (!species) throw new Error(`Unknown pet species ${item}`)
    const bases = rollBases(
      speciesBaseProps(species.nature, species.requiredLevel, species.parent !== null),
      random,
    )
    const [pet] = await tx
      .insert(characterPets)
      .values({
        characterId,
        species: item,
        kennelSlot,
        active,
        level,
        growth: species.growth,
        baseAttack: bases.attack,
        baseDefence: bases.defence,
        baseDisturb: bases.disturb,
        baseActive: bases.active,
        baseSavvy: bases.savvy,
        foodSlots: newFoodSlots(random),
        ...(active && {
          haloSlots: PET_SLOTS[1],
          helpSlots: PET_SLOTS[2],
          passSlots: PET_SLOTS[3],
        }),
      })
      .returning({ id: characterPets.id })
    if (!active) continue
    const kinds = [1, 2, 3] as const
    const skills = kinds.flatMap((kind) =>
      learnPool(item, kind)
        .slice(0, PET_SLOTS[kind])
        .map((skillId, slot) => ({ skillId, kind, slot })),
    )
    await tx.insert(characterPetSkills).values(
      skills.map((skill, learnedOrder) => ({
        petId: pet!.id,
        ...skill,
        level: 1,
        learnedOrder,
      })),
    )
  }
}

async function seedItems(tx: Tx, characterId: string) {
  await tx.insert(inventoryItems).values([
    ...GEAR.map((itemId) => ({
      characterId,
      itemId,
      bound: true,
      // Each piece goes in its item.ini EquipType slot.
      equippedSlot: String(item(itemId)!.EquipType),
      enhanceLevel: GEAR_ENHANCE,
    })),
    { characterId, itemId: WING, bound: true, equippedSlot: WING_SLOT, enhanceLevel: WING_ENHANCE },
    // The outfit is an item in set I's Outfit slot (game/outfit.ts).
    {
      characterId,
      itemId: outfitForClothing(CLOTHING).itemId,
      bound: true,
      equippedSlot: 'Outfit',
    },
    ...BAG.map(([itemId, count]) => ({
      characterId,
      itemId,
      count: Math.min(count, itemStackSize(itemId)),
      bound: true,
    })),
  ])
  await tx.insert(characterWingCollection).values({ characterId, itemId: WING })
}

/** Full HP/MP with every bonus (gear, wing, bloodlines, pet) counted. */
async function refill(tx: Tx, characterId: string) {
  const [row] = await tx.select().from(characters).where(eq(characters.id, characterId))
  const fighter = await playerFighter(tx, row!)
  await tx
    .update(characters)
    .set({ hp: fighter.maxHp, mp: fighter.maxMp })
    .where(eq(characters.id, characterId))
  return fighter
}

const { db, close } = createDb(env.DATABASE_URL)
try {
  const result = await db.transaction(async (tx) => {
    const userId = await upsertUser(tx)
    const character = await upsertCharacter(tx, userId)
    await seedTutorial(tx, character.id)
    await clearKit(tx, character.id)
    await seedSkills(tx, character.id)
    await seedTalents(tx, character.id)
    await seedBloodlines(tx, character.id)
    await seedPets(tx, character.id)
    await seedItems(tx, character.id)
    const fighter = await refill(tx, character.id)
    await refreshArenaSnapshot(tx, character.id)
    return { ...character, fighter }
  })
  console.log(
    `${result.created ? 'Created' : 'Refreshed'} ${USERNAME} / ${PASSWORD}: ${NINJA_NAME}, level ${LEVEL}, ` +
      `HP ${result.fighter.maxHp}, attack ${result.fighter.minAttack}-${result.fighter.maxAttack}`,
  )
} finally {
  await close()
}
