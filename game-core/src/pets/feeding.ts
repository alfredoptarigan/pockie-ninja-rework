// Pet feeding (decision 13), NewPetSystem.java 1:1: AddPetFeed, CanFeedFood, DigestFood,
// GetFeedType / GetFeedMul / GetAddMul. Tables: PetFeedLib and PetGrow (pet-foods.json).
import data from '../../../server/data/game/reborn/pet-foods.json'
import type { Random } from '../random.js'

/** One food slot: the type it asks for (1 = any) and its rolled multiplier (percent, 0-3). */
export interface FoodSlot {
  type: number
  mul: number
}
/** A food in a slot: `ItemPetFeedType` (1 = any slot) and `ItemAddPetHunger`. */
export interface PetFood {
  type: number
  hunger: number
}

export const FOOD_SLOTS = 6
const ANY_TYPE = 1
const g = data.grow
/** m_PetAddMul: like, combos of 2-6, full (absent: 1), perfect, slave (home, M7). */
const ADD_MUL = [
  g.PetLikeMul,
  g.PetC2Mul,
  g.PetC3Mul,
  g.PetC4Mul,
  g.PetC5Mul,
  g.PetC6Mul,
  1,
  g.PetPerfMul,
]
const LIKE = 0
const PERFECT = 7
const addMul = (type: number) => ADD_MUL[type] ?? 0

/** Weighted pick of a `[key]=weight` section: RandInt(1, total), first cumulative weight >= roll. */
function pick(weights: readonly number[], keyOf: (i: number) => number, random: Random) {
  const total = weights.reduce((sum, w) => sum + w, 0)
  const roll = random.between(1, total)
  let acc = 0
  for (const [i, weight] of weights.entries()) {
    acc += weight
    if (roll <= acc) return keyOf(i)
  }
  return keyOf(0)
}
/** GetFeedType: `[type]` keys 1-7. */
const feedType = (random: Random) => pick(data.typeWeights, (i) => i + 1, random)
/** GetFeedMul: `[mul]` keys 0-3, weights 90/5/3/2. */
const feedMul = (random: Random) => pick(data.mulWeights, (i) => i, random)

/** AddPetFeed: a new kennel slot rolls the six multipliers first, then the six types. */
export function newFoodSlots(random: Random): FoodSlot[] {
  const muls = Array.from({ length: FOOD_SLOTS }, () => feedMul(random))
  return muls.map((mul) => ({ type: feedType(random), mul }))
}

const isFood = (food: PetFood | null | undefined): food is PetFood =>
  !!food && food.type > 0 && food.hunger > 0

/** CanFeedFood: at least one food, and each food fits its slot (type 1 on either side fits). */
export function canFeed(slots: readonly FoodSlot[], foods: readonly (PetFood | null)[]) {
  let fits = false
  for (let i = 0; i < FOOD_SLOTS; i++) {
    const food = foods[i]
    if (!isFood(food)) continue
    const need = slots[i]?.type ?? 0
    if (food.type !== need && need !== ANY_TYPE && food.type !== ANY_TYPE) return false
    fits = true
  }
  return fits
}

/** DigestFood's combo pass (bytecode-checked: the counter grows on every repeat). */
function comboMul(types: readonly number[]) {
  let combo = 0
  let last = 0
  let mul = 0
  for (const [i, type] of types.entries()) {
    if (last > 0) {
      if (type === last) {
        combo++
        if (i === types.length - 1) mul += addMul(combo)
      } else {
        if (combo > 0) mul += addMul(combo)
        combo = 0
      }
    }
    last = type
  }
  return mul
}

/** DigestFood's perfect check: six foods of six different types. */
const isPerfect = (types: readonly number[]) =>
  types.every((type, i) => type > 0 && types.indexOf(type) === i)

/**
 * DigestFood: the foods' hunger plus `hunger * (slot muls + like + combo + perfect) / 100`. Fed
 * slots then reroll their type and multiplier. `petFoodType` is the species' food type (like
 * bonus). The caller caps the appetite at HUNGER_MAX; `gained` is also the pet's EXP (decision 12).
 */
export function digest(
  slots: readonly FoodSlot[],
  foods: readonly (PetFood | null)[],
  petFoodType: number,
  random: Random,
) {
  let hunger = 0
  let percent = 0
  const types = Array.from({ length: FOOD_SLOTS }, (_, i) => {
    const food = foods[i]
    if (!isFood(food)) return 0
    hunger += food.hunger
    percent += Math.max(0, slots[i]?.mul ?? 0)
    if (food.type === petFoodType) percent += addMul(LIKE)
    return food.type
  })
  percent += comboMul(types)
  if (isPerfect(types)) percent += addMul(PERFECT)
  const gained = hunger + Math.trunc((hunger * percent) / 100)
  const next = Array.from({ length: FOOD_SLOTS }, (_, i): FoodSlot => {
    const kept = slots[i] ?? { type: 0, mul: 0 }
    if (types[i] === 0 && kept.type !== 0) return kept
    const type = feedType(random)
    return { type, mul: feedMul(random) }
  })
  return { gained, slots: next }
}
