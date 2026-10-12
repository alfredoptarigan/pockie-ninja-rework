import { createRandom, type Random } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { exploreSpot } from './data.js'
import {
  advanceStar,
  peekCost,
  cardGranted,
  seniorKey,
  dailyExploreTotal,
  requiredItems,
  rollCard,
  rollStarBonus,
  weightedIndex,
} from './explore.js'

/** A Random whose int(n) returns the queued values in order. */
const fixed = (...values: number[]): Random => ({
  next: () => 0,
  int: (n) => {
    const value = values.shift() ?? 0
    if (value >= n) throw new Error(`int(${n}) cannot return ${value}`)
    return value
  },
  between: (min) => min,
})

const spot = exploreSpot('21011')!

describe('dailyExploreTotal', () => {
  it('is 7 plus one per 10 levels', () => {
    expect(dailyExploreTotal(1)).toBe(7)
    expect(dailyExploreTotal(9)).toBe(7)
    expect(dailyExploreTotal(10)).toBe(8)
    expect(dailyExploreTotal(90)).toBe(16)
  })
})

describe('weightedIndex', () => {
  it('picks by cumulative weight and skips zero weights', () => {
    expect(weightedIndex([1, 0, 2], fixed(0))).toBe(0)
    expect(weightedIndex([1, 0, 2], fixed(1))).toBe(2)
    expect(weightedIndex([1, 0, 2], fixed(2))).toBe(2)
    expect(weightedIndex([0, 0], fixed())).toBe(-1)
  })
})

describe('advanceStar', () => {
  it('starts a spot at star 0 and rises every StarUp searches up to 5', () => {
    let star = advanceStar(undefined, 2)
    expect(star).toEqual({ level: 0, progress: 1 })
    star = advanceStar(star, 2)
    expect(star).toEqual({ level: 1, progress: 0 })
    star = advanceStar(star, 2)
    expect(star).toEqual({ level: 1, progress: 1 })
    for (let i = 0; i < 7; i++) star = advanceStar(star, 2)
    expect(star).toEqual({ level: 5, progress: 0 })
    expect(advanceStar(star, 2)).toEqual({ level: 5, progress: -1 })
    expect(advanceStar({ level: 5, progress: -1 }, 2)).toEqual({ level: 5, progress: -1 })
  })
})

describe('rollStarBonus', () => {
  it('gives nothing unless the star level just rose', () => {
    expect(rollStarBonus(spot, { level: 0, progress: 1 }, fixed())).toBeNull()
    expect(rollStarBonus(spot, { level: 2, progress: 1 }, fixed())).toBeNull()
    expect(rollStarBonus(spot, { level: 5, progress: -1 }, fixed())).toBeNull()
  })

  it('rolls the pet egg (weight 1) or ExpBase + ExpBase * star / 10 (weight 99)', () => {
    // 21011: ExpBase 105, BabyRateStarLv1 1, ExpRateStarLv1 99, PetBonusAppend i283017.
    expect(rollStarBonus(spot, { level: 1, progress: 0 }, fixed(0))).toEqual({
      type: 'pet',
      itemId: 'i283017',
      bound: true,
    })
    expect(rollStarBonus(spot, { level: 1, progress: 0 }, fixed(1))).toEqual({
      type: 'exp',
      exp: 115,
    })
    // Star 3: weights 3 / 97, exp 105 + 31.
    expect(rollStarBonus(spot, { level: 3, progress: 0 }, fixed(3))).toEqual({
      type: 'exp',
      exp: 136,
    })
  })
})

describe('rollCard', () => {
  // 21011 weights: fight 1000, stone 1000, pet 500, boss 800, item 6000, game 0, key 700.
  it('rolls a monster fight from the spot’s GostFactory', () => {
    expect(rollCard(spot, fixed(0, 1))).toEqual({ type: 'fight', monsterId: 'n330171' })
  })

  it('rolls MoneyRule Stone', () => {
    expect(rollCard(spot, fixed(1000))).toEqual({ type: 'stone', amount: 671 })
  })

  it('rolls factory items with their binding, each entry covering Odds + 1 rolls', () => {
    // ItemFactory 1: entry 0 i170001 (odds 1, bound) covers rolls 0-1, entry 1 starts at 2.
    expect(rollCard(spot, fixed(3300, 1))).toEqual({ type: 'item', itemId: 'i170001', bound: true })
    expect(rollCard(spot, fixed(3300, 2))).toEqual({
      type: 'item',
      itemId: 'i159000',
      bound: false,
    })
    expect(rollCard(spot, fixed(2000, 0))).toMatchObject({ type: 'pet', bound: true })
    expect(rollCard(spot, fixed(2500, 0))).toEqual({ type: 'boss', itemId: 'i150078', bound: true })
    expect(rollCard(spot, fixed(9300, 0))).toEqual({ type: 'key', itemId: 'i150046', bound: true })
  })

  it('gives nothing when the spot’s monster factory is missing from the data', () => {
    // GostFactory 18 is absent in every backup copy; its real spots all have GostRate=0.
    expect(rollCard({ ...spot, GostFactoryID: 18 }, fixed(0))).toEqual({ type: 'nothing' })
  })

  it('only produces outcomes with a weight', () => {
    const random = createRandom(7)
    for (let i = 0; i < 500; i++) expect(rollCard(spot, random).type).not.toBe('game')
  })
})

describe('requiredItems', () => {
  it('parses RequireItem', () => {
    expect(requiredItems(spot)).toEqual([])
    expect(requiredItems(exploreSpot('21012')!)).toEqual([{ itemId: 'i150046', count: 1 }])
  })
})

describe('paid peeks', () => {
  it('uses Stone first, Gold or Gift Coupons second, then Gold only', () => {
    expect(peekCost(spot, 0, 'gold')).toEqual({ currency: 'stone', amount: 83 })
    expect(peekCost(spot, 1, 'giftCoupon')).toEqual({ currency: 'giftCoupon', amount: 2 })
    expect(peekCost(spot, 2, 'gold')).toEqual({ currency: 'gold', amount: 7 })
    expect(peekCost(spot, 2, 'giftCoupon')).toBeNull()
    expect(peekCost(spot, 3, 'gold')).toBeNull()
  })
})

describe('senior search keys', () => {
  it('uses the original item GetItemsId and UseLevel, with no extra cards', () => {
    expect(seniorKey('21012')).toEqual({ itemId: 'i150046', level: 1 })
    expect(seniorKey('27012')).toEqual({ itemId: 'i150066', level: 46 })
    expect(seniorKey('21011')).toBeNull()
  })
})

describe('card grants', () => {
  it('gives only pet cards the 50 percent chance, including its boundaries', () => {
    const pet = { type: 'pet' as const, itemId: 'i283017', bound: true }
    expect(cardGranted(pet, fixed(49))).toBe(true)
    expect(cardGranted(pet, fixed(50))).toBe(false)
    expect(cardGranted({ ...pet, type: 'item' }, fixed(99))).toBe(true)
    expect(cardGranted({ ...pet, type: 'boss' }, fixed(99))).toBe(true)
    expect(cardGranted({ ...pet, type: 'key' }, fixed(99))).toBe(true)
  })

  it('raises the pet chance by the VIP factor (50 * 1.25 = 62.5)', () => {
    const pet = { type: 'pet' as const, itemId: 'i283017', bound: true }
    expect(cardGranted(pet, fixed(62), 1.25)).toBe(true)
    expect(cardGranted(pet, fixed(63), 1.25)).toBe(false)
  })
})
