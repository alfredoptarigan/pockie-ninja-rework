// Pet Kennel state (M6 decisions 11-18): the view, lazy digestion, adoption and skill placement.
// Callers lock the character row first, then the pet rows (plan ground rules).
import { and, asc, eq, inArray, sum } from 'drizzle-orm'
import { createRandom, type Random } from '@pockie/game-core'
import { randomInt } from 'node:crypto'
import {
  DIGEST_AT_ONCE_PRICE,
  EVOLVE_FEATHERS,
  EVOLVE_LEVEL,
  HUNGER_MAX,
  KENNEL_MAX_SLOTS,
  KENNEL_SLOT_PRICE,
  PET_LOCK_ITEM,
  PET_MAX_LEVEL,
  PET_SKILL_REMOVE_ITEM,
} from '../../../../game-core/src/pets/constants.js'
import { digest, newFoodSlots, type PetFood } from '../../../../game-core/src/pets/feeding.js'
import {
  canUnlockSlot,
  learnSkill,
  lockCost,
  skillCap,
  slotCost,
  type LearnedSkill,
} from '../../../../game-core/src/pets/skills.js'
import { petTotals, rollBases, speciesBaseProps } from '../../../../game-core/src/pets/stats.js'
import type {
  PetActionResult,
  PetSkillKind,
  PetsView,
  PetView,
} from '../../../../shared/src/schemas/pets.js'
import type { Db } from '../../db/client.js'
import { characterPets, characterPetSkills, characters, inventoryItems } from '../../db/schema.js'
import { unequippedBagItemsWhere } from '../../game/bag.js'
import { playerFighter } from '../../game/combat.js'
import { itemNameKey, rebornPetFoods, rebornPets, rebornPetSkills } from '../../game/data.js'
import { addPetExp, petAvatar, petBases, petSpecies } from '../../game/pets.js'
import { consumeOne, removeItems, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { toCharacter } from '../game/characters.js'

export type PetRow = typeof characterPets.$inferSelect
type CharacterRow = typeof characters.$inferSelect
type InventoryRow = typeof inventoryItems.$inferSelect
/** A skill row without its pet id; skill ids <= 0 hold an unlocked empty slot. */
export type SkillRow = LearnedSkill

export const bad = (code: string, message: string) => new HttpError(400, code, message)
export const cryptoRandom = () => createRandom(randomInt(2 ** 31))

/** Feathers (2011 i150319) pay for evolution (decision 18). */
export const FEATHER_ITEM = 'i150319'
/** Ours: Reborn required level of every species until pets.json carries item field 1 (11b). */
const REQUIRED_LEVEL = 30
/** skill.ini has one row per pet skill (`GetSecondMaxLevel` 1), so a known skill cannot rise. */
export const PET_SKILL_MAX_LEVEL = 1
export {
  REBORN_EQUIP_PET_COMMAND as EQUIP_PET_COMMAND,
  REBORN_FEED_PET_COMMAND as FEED_PET_COMMAND,
} from '../../game/quests.js'

const KIND_KEYS = { 1: 'halo', 2: 'help', 3: 'pass' } as const

/**
 * Ponytail: the schema has no column for unlocked skill slots, so an unlocked empty slot is a
 * skill row with a negative id (2011 keeps a row with skill id 0). Add a column if it grows.
 */
export const emptySlotId = (kind: number, slot: number) => -(kind * 10 + slot + 1)
const isReal = (row: SkillRow) => row.skillId > 0
const emptySlot = (kind: number, slot: number): SkillRow => ({
  skillId: emptySlotId(kind, slot),
  level: 1,
  learnedOrder: 0,
  locked: false,
  kind,
  slot,
})

let foods: Map<string, PetFood & { level: number }> | undefined
export function petFood(itemId: string) {
  foods ??= new Map(rebornPetFoods().foods.map((food) => [food.item, food]))
  return foods.get(itemId)
}

export const evolutionsOf = (species: string) => rebornPets().filter((p) => p.parent === species)

/** Locks one pet row of the character. */
export async function lockPet(tx: Tx, characterId: string, petId: string) {
  const [pet] = await tx
    .select()
    .from(characterPets)
    .where(and(eq(characterPets.id, petId), eq(characterPets.characterId, characterId)))
    .for('update')
  if (!pet) throw new HttpError(404, 'no_pet', 'That pet is not in your kennel.')
  return pet
}

export async function skillRows(tx: Tx | Db, petId: string): Promise<SkillRow[]> {
  return tx
    .select({
      skillId: characterPetSkills.skillId,
      level: characterPetSkills.level,
      learnedOrder: characterPetSkills.learnedOrder,
      locked: characterPetSkills.locked,
      kind: characterPetSkills.kind,
      slot: characterPetSkills.slot,
    })
    .from(characterPetSkills)
    .where(eq(characterPetSkills.petId, petId))
}

/** Rewrites a pet's skill rows (at most 18 slots). */
export async function saveSkills(tx: Tx, petId: string, rows: readonly SkillRow[]) {
  await tx.delete(characterPetSkills).where(eq(characterPetSkills.petId, petId))
  if (rows.length > 0)
    await tx.insert(characterPetSkills).values(rows.map((row) => ({ ...row, petId })))
}

/**
 * LearnSkill + PetRealizeSkill (decision 14): the skill takes the first empty slot of its kind;
 * with none it replaces the oldest unlocked skill of the kind. The learned list keeps
 * MaxSkillCount (5) skills (game-core learnSkill drops the oldest unlocked one, its slot empties).
 */
export function placeSkill(rows: readonly SkillRow[], skillId: number, kind: number) {
  const slots = rows
    .filter((row) => row.kind === kind && row.slot !== null)
    .sort((a, b) => a.slot! - b.slot!)
  if (slots.length === 0) throw bad('no_slot', 'Add a skill slot of this kind first.')
  const real = rows.filter(isReal)
  if (real.some((row) => row.skillId === skillId))
    throw bad('known', 'Your pet already knows that skill.')
  const empty = slots.find((row) => !isReal(row))
  const victim = empty
    ? undefined
    : slots
        .filter((row) => !row.locked)
        .sort((a, b) => a.learnedOrder - b.learnedOrder)
        .at(0)
  const target = empty ?? victim
  const learned =
    target &&
    learnSkill(
      real.filter((row) => row !== victim),
      skillId,
      kind,
      PET_SKILL_MAX_LEVEL,
    )
  if (!target || !learned) throw bad('all_locked', 'Every skill that could be replaced is locked.')
  const placed = learned.map((row) =>
    row.skillId === skillId ? { ...row, slot: target.slot } : row,
  )
  return withEmptySlots(placed, rows)
}

/** `skills` plus an empty-slot row for every slot unlocked in `unlocked` that no skill holds. */
export function withEmptySlots(skills: readonly SkillRow[], unlocked: readonly SkillRow[]) {
  const held = (row: SkillRow) =>
    skills.some((s) => isReal(s) && s.kind === row.kind && s.slot === row.slot)
  return [
    ...skills.filter(isReal),
    ...unlocked
      .filter((row) => row.slot !== null && !held(row))
      .map((row) => emptySlot(row.kind, row.slot!)),
  ]
}

/** OnCustomActSkill: the next free slot of the kind, or null when no more can be unlocked. */
export function nextSlot(rows: readonly SkillRow[], kind: number, level: number) {
  const unlocked = rows.filter((row) => row.slot !== null)
  const ofKind = unlocked.filter((row) => row.kind === kind)
  if (!canUnlockSlot(unlocked.length, ofKind.length, level)) return null
  const slot = [0, 1, 2, 3, 4, 5].find((n) => !ofKind.some((row) => row.slot === n))!
  return { row: emptySlot(kind, slot), cost: slotCost(unlocked.length + 1)! }
}

/** Learnable skills of a kind: the species pool, without rows that do nothing in a fight. */
export function learnPool(species: string, kind: PetSkillKind) {
  const known = rebornPetSkills().skills
  return (petSpecies(species)?.pool[KIND_KEYS[kind]] ?? []).filter((id) => {
    const row = known[String(id)]
    // Halo and Help rows without a script do nothing in a fight (skill-ledger.md).
    return row && (row.kind === 3 || row.script !== null)
  })
}

/** Locks the unequipped stacks of an item and removes `count`, bound stacks first. */
export async function spendItems(
  tx: Tx,
  characterId: string,
  itemId: string,
  count: number,
  message = 'You do not have enough of that item.',
) {
  const rows = await tx
    .select({ count: inventoryItems.count })
    .from(inventoryItems)
    .where(and(unequippedBagItemsWhere(characterId), eq(inventoryItems.itemId, itemId)))
    .for('update')
  if (rows.reduce((total, row) => total + row.count, 0) < count)
    throw bad('not_enough_items', message)
  await removeItems(tx, characterId, itemId, count)
}

/** Takes `price` of a currency from the locked character row; refuses when short. */
export async function spendCurrency(
  tx: Tx,
  character: CharacterRow,
  currency: 'stone' | 'gold' | 'giftCoupon',
  price: number,
) {
  const names = { stone: 'Stone', gold: 'Gold', giftCoupon: 'Gift Coupons' }
  if (character[currency] < price)
    throw bad('not_enough_currency', `You need ${price} ${names[currency]}.`)
  await tx
    .update(characters)
    .set({ [currency]: character[currency] - price })
    .where(eq(characters.id, character.id))
}

/**
 * DigestFood: the foods in the slots become appetite (capped at HungerMax) and the same amount
 * of pet EXP (decision 12); the fed slots reroll.
 */
export async function finishDigestion(tx: Tx, pet: PetRow, masterLevel: number, random: Random) {
  const species = petSpecies(pet.species)!
  const fed = pet.foodSlots.map((slot) => (slot.item ? (petFood(slot.item) ?? null) : null))
  const { gained, slots } = digest(pet.foodSlots, fed, species.food, random)
  const [updated] = await tx
    .update(characterPets)
    .set({
      appetite: Math.min(HUNGER_MAX, pet.appetite + gained),
      foodSlots: slots,
      digestEndsAt: null,
    })
    .where(eq(characterPets.id, pet.id))
    .returning()
  await addPetExp(tx, updated!, gained, masterLevel)
  return gained
}

/** RefreshPetDigest, lazily: finishes every pet whose food is done. Pet rows are locked here. */
export async function settlePets(tx: Tx, character: CharacterRow, random: Random) {
  const done = await tx
    .select()
    .from(characterPets)
    .where(eq(characterPets.characterId, character.id))
    .orderBy(asc(characterPets.kennelSlot))
    .for('update')
  const now = Date.now()
  for (const pet of done) {
    if (pet.digestEndsAt && pet.digestEndsAt.getTime() <= now)
      await finishDigestion(tx, pet, character.level, random)
  }
}

/**
 * Decision 17: a pet item adopts into the first free kennel slot and is used up. Returns false
 * for items that are not pets. Call inside the item-use transaction (character locked).
 */
export async function adoptPetItem(
  tx: Tx,
  character: CharacterRow,
  row: InventoryRow,
  random: Random = cryptoRandom(),
) {
  const species = petSpecies(row.itemId)
  if (!species) return false
  const taken = await tx
    .select({ slot: characterPets.kennelSlot })
    .from(characterPets)
    .where(eq(characterPets.characterId, character.id))
    .for('update')
  const free = Array.from({ length: character.petSlots }, (_, i) => i).find(
    (slot) => !taken.some((pet) => pet.slot === slot),
  )
  if (free === undefined)
    throw bad('kennel_full', 'Your Pet Kennel is full. Unlock a slot or release a pet.')
  const bases = rollBases(
    speciesBaseProps(species.nature, REQUIRED_LEVEL, species.parent !== null),
    random,
  )
  await tx.insert(characterPets).values({
    characterId: character.id,
    species: species.item,
    kennelSlot: free,
    growth: species.growth,
    baseAttack: bases.attack,
    baseDefence: bases.defence,
    baseDisturb: bases.disturb,
    baseActive: bases.active,
    baseSavvy: bases.savvy,
    foodSlots: newFoodSlots(random),
  })
  await consumeOne(tx, row)
  return true
}

async function itemCounts(tx: Tx | Db, characterId: string) {
  const rows = await tx
    .select({ itemId: inventoryItems.itemId, count: sum(inventoryItems.count).mapWith(Number) })
    .from(inventoryItems)
    .where(unequippedBagItemsWhere(characterId))
    .groupBy(inventoryItems.itemId)
  return new Map(rows.map((row) => [row.itemId, row.count]))
}

function petView(pet: PetRow, rows: readonly SkillRow[]): PetView {
  const species = petSpecies(pet.species)!
  const unlocked = rows.filter((row) => row.slot !== null)
  const real = rows.filter(isReal)
  const kindCount = (kind: number) => unlocked.filter((row) => row.kind === kind).length
  const nextCost = slotCost(unlocked.length + 1)
  return {
    id: pet.id,
    species: pet.species,
    nameKey: itemNameKey(pet.species),
    avatar: petAvatar(species),
    nature: species.nature,
    foodType: species.food,
    kennelSlot: pet.kennelSlot,
    active: pet.active,
    level: pet.level,
    exp: pet.exp,
    expToNext: pet.level < PET_MAX_LEVEL ? (rebornPetFoods().exp[pet.level - 1] ?? null) : null,
    growth: pet.growth,
    totals: petTotals(petBases(pet), pet.level, pet.growth),
    appetite: pet.appetite,
    appetiteMax: HUNGER_MAX,
    digestEndsAt: pet.digestEndsAt?.toISOString() ?? null,
    foodSlots: pet.foodSlots.map((slot) => ({
      type: slot.type,
      mul: slot.mul,
      item: slot.item ?? null,
    })),
    skills: real
      .filter((row) => row.slot !== null)
      .map((row) => ({
        skillId: row.skillId,
        nameKey: `lg_Skill_${row.skillId}`,
        kind: row.kind as PetSkillKind,
        slot: row.slot!,
        level: row.level,
        locked: row.locked,
      })),
    slots: [kindCount(1), kindCount(2), kindCount(3)],
    slotCap: skillCap(pet.level),
    nextSlotCost:
      unlocked.length < skillCap(pet.level) && nextCost && nextCost > 0 ? nextCost : null,
    nextLockCost: lockCost(real.filter((row) => row.locked).length),
    evolvesTo: evolutionsOf(pet.species).map((p) => ({ species: p.item, nameKey: p.nameKey })),
  }
}

export async function petsView(tx: Tx | Db, character: CharacterRow): Promise<PetsView> {
  const pets = await tx
    .select()
    .from(characterPets)
    .where(eq(characterPets.characterId, character.id))
    .orderBy(asc(characterPets.kennelSlot))
  const skills =
    pets.length === 0
      ? []
      : await tx
          .select()
          .from(characterPetSkills)
          .where(
            inArray(
              characterPetSkills.petId,
              pets.map((pet) => pet.id),
            ),
          )
  const counts = await itemCounts(tx, character.id)
  const held = (itemId: string) => ({
    itemId,
    nameKey: itemNameKey(itemId),
    count: counts.get(itemId) ?? 0,
  })
  return {
    pets: pets.map((pet) =>
      petView(
        pet,
        skills.filter((row) => row.petId === pet.id),
      ),
    ),
    petSlots: character.petSlots,
    maxSlots: KENNEL_MAX_SLOTS,
    slotPrice: KENNEL_SLOT_PRICE,
    digestPrice: DIGEST_AT_ONCE_PRICE,
    evolve: { level: EVOLVE_LEVEL, feathers: EVOLVE_FEATHERS },
    feathers: counts.get(FEATHER_ITEM) ?? 0,
    lockItem: held(PET_LOCK_ITEM),
    removeItem: held(PET_SKILL_REMOVE_ITEM),
    foods: rebornPetFoods()
      .foods.filter((food) => counts.has(food.item))
      .map((food) => ({ ...held(food.item), type: food.type, hunger: food.hunger })),
    books: rebornPetSkills()
      .books.filter((book) => counts.has(book.item))
      .map((book) => ({ ...held(book.item), skillId: book.skill, kind: book.kind })),
  }
}

/** The view plus the fresh character (currencies) for the HUD. */
export async function actionResult(tx: Tx, characterId: string): Promise<PetActionResult> {
  const [character] = await tx.select().from(characters).where(eq(characters.id, characterId))
  return {
    ...(await petsView(tx, character!)),
    character: toCharacter(character!, await playerFighter(tx, character!)),
  }
}
