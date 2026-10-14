import { describe, expect, it } from 'vitest'
import { createRandom, type Random } from '../random.js'
import { canFeed, digest, newFoodSlots, type FoodSlot, type PetFood } from './feeding.js'

/** A Random whose `between` returns the queued rolls. */
const queued = (rolls: number[]): Random => ({
  ...createRandom(1),
  between: () => {
    const roll = rolls.shift()
    if (roll === undefined) throw new Error('unexpected roll')
    return roll
  },
})
const food = (type: number, hunger: number): PetFood => ({ type, hunger })
const slots = (types: number[], muls: number[]): FoodSlot[] =>
  types.map((type, i) => ({ type, mul: muls[i]! }))
/** Six rerolls that all land on type 1 / multiplier 0 (RandInt(1, 700) = 1, RandInt(1, 100) = 1). */
const sixRerolls = () => queued(Array.from({ length: 12 }, () => 1))

describe('digest (DigestFood)', () => {
  it('adds slot multipliers, like and a 3-combo like a hand computation', () => {
    const result = digest(
      slots([2, 1, 2, 3, 5, 7], [1, 0, 0, 2, 0, 3]),
      [food(2, 80), food(2, 80), food(2, 80), food(3, 80), food(5, 80), food(7, 80)],
      2,
      sixRerolls(),
    )
    // base 480; mul 1+2+3 = 6; like 3 x PetLikeMul 2 = 6; combo of 3 = PetC3Mul 15 -> 27%.
    // 480 + 480 x 27 / 100 = 480 + 129.
    expect(result.gained).toBe(609)
  })

  it('adds the perfect bonus when all six foods differ', () => {
    const result = digest(
      slots([1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1]),
      [food(2, 10), food(3, 10), food(4, 10), food(5, 10), food(6, 10), food(7, 10)],
      2,
      sixRerolls(),
    )
    // base 60; mul 1; like 2; perfect PetPerfMul 40 -> 43%. 60 + 25.
    expect(result.gained).toBe(85)
  })

  it('counts a combo that runs to the last slot (6 in a row = PetC6Mul 70)', () => {
    const result = digest(
      slots([3, 3, 3, 3, 3, 3], [0, 0, 0, 0, 0, 0]),
      Array.from({ length: 6 }, () => food(3, 100)),
      5,
      sixRerolls(),
    )
    expect(result.gained).toBe(1020)
  })

  it('rerolls the fed slots (type, then multiplier) and keeps the empty ones', () => {
    // Slot 1 is empty; slots 0 and 2-5 reroll: RandInt(1, 700) then RandInt(1, 100).
    const rolls = [101, 91, 1, 100, 650, 99, 1, 1, 1, 1]
    const result = digest(
      slots([2, 4, 2, 1, 1, 1], [3, 2, 0, 0, 0, 0]),
      [food(2, 5), null, food(2, 5), food(1, 5), food(1, 5), food(1, 5)],
      2,
      queued(rolls),
    )
    expect(result.slots).toEqual([
      { type: 2, mul: 1 },
      { type: 4, mul: 2 },
      { type: 1, mul: 3 },
      { type: 7, mul: 3 },
      { type: 1, mul: 0 },
      { type: 1, mul: 0 },
    ])
  })
})

describe('canFeed (CanFeedFood)', () => {
  it('needs one food and every food to match its slot (type 1 matches anything)', () => {
    const fed = slots([2, 1, 3, 4, 5, 6], [0, 0, 0, 0, 0, 0])
    expect(canFeed(fed, [null, null, null, null, null, null])).toBe(false)
    expect(canFeed(fed, [food(2, 5), food(7, 5), food(1, 5), null, null, null])).toBe(true)
    expect(canFeed(fed, [food(2, 5), null, food(4, 5), null, null, null])).toBe(false)
  })
})

describe('newFoodSlots (AddPetFeed)', () => {
  it('rolls six multipliers, then six types', () => {
    const rolls = [1, 91, 96, 99, 100, 50, 1, 101, 201, 301, 401, 700]
    expect(newFoodSlots(queued(rolls))).toEqual([
      { type: 1, mul: 0 },
      { type: 2, mul: 1 },
      { type: 3, mul: 2 },
      { type: 4, mul: 3 },
      { type: 5, mul: 3 },
      { type: 7, mul: 0 },
    ])
  })
})
