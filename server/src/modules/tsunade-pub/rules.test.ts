// Tsunade Pub rules: tier odds, bonus and guaranteed spins, the wheel, Valhalla gear, sell values.
import { createRandom, type Random } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { PUB_RARITIES } from '../../../../shared/src/schemas/tsunade-pub.js'
import { item } from '../../game/data.js'
import { TSUNADE_PUB_PLACEHOLDERS as PLACEHOLDERS } from './config.js'
import {
  makeBoard,
  pickPrize,
  rollsUntil,
  rollTier,
  sellValue,
  spin,
  spinTier,
  valhallaPool,
} from './rules.js'

/** A Random that returns `values` from next() in turn (int scales them). */
function scripted(values: number[]): Random {
  let i = 0
  const next = () => values[i++ % values.length]!
  return {
    next,
    int: (n) => Math.floor(next() * n),
    between: (min, max) => min + Math.floor(next() * (max - min + 1)),
  }
}

describe('rollTier', () => {
  it('follows the tier weights (60 / 25 / 12 / 2.5 / 0.5)', () => {
    expect(rollTier(scripted([0]))).toBe('common')
    expect(rollTier(scripted([0.6]))).toBe('uncommon')
    expect(rollTier(scripted([0.85]))).toBe('rare')
    expect(rollTier(scripted([0.97]))).toBe('epic')
    expect(rollTier(scripted([0.996]))).toBe('legendary')
  })

  it('lands near the weights over many rolls', () => {
    const random = createRandom(7)
    const counts = Object.fromEntries(PUB_RARITIES.map((r) => [r, 0]))
    for (let i = 0; i < 20_000; i++) counts[rollTier(random)]! += 1
    expect(counts.common! / 20_000).toBeCloseTo(0.6, 1)
    expect(counts.uncommon! / 20_000).toBeCloseTo(0.25, 1)
  })
})

describe('spinTier', () => {
  it('makes every 100th spin legendary without rolling', () => {
    expect(spinTier(100, scripted([0]))).toBe('legendary')
    expect(spinTier(200, scripted([0]))).toBe('legendary')
  })

  it('keeps the better of two rolls on every 5th spin', () => {
    expect(spinTier(5, scripted([0, 0.9]))).toBe('rare')
    expect(spinTier(4, scripted([0, 0.9]))).toBe('common')
  })
})

describe('rollsUntil', () => {
  it('counts down to the next bonus and guaranteed spin', () => {
    expect(rollsUntil(0, 5)).toBe(5)
    expect(rollsUntil(3, 5)).toBe(2)
    expect(rollsUntil(37, 100)).toBe(63)
  })
})

describe('the prize pool', () => {
  it('holds only real items', () => {
    for (const tier of PUB_RARITIES)
      for (const prize of PLACEHOLDERS.prizes[tier])
        expect(item(prize.itemId), prize.itemId).toBeDefined()
  })

  it('picks a prize of the tier asked for', () => {
    expect(pickPrize('epic', createRandom(1))).toMatchObject({ rarity: 'epic', amount: 1 })
  })

  it('fills a wheel of 16 slots', () => {
    expect(makeBoard(createRandom(2))).toHaveLength(16)
  })
})

describe('spin', () => {
  const board = makeBoard(createRandom(3))

  it('puts the prize into the winning slot and keeps the other 15', () => {
    const result = spin(board, 0, 50, createRandom(4))
    const { bound: _bound, ...shown } = result.prize
    expect(result.currentBoard[result.winningIndex]).toEqual(shown)
    result.currentBoard.forEach(
      (slot, i) => i !== result.winningIndex && expect(slot).toEqual(board[i]),
    )
    expect(result.newBoard).toHaveLength(16)
  })

  it('gives a legendary on the 100th spin', () => {
    expect(spin(board, 99, 50, createRandom(5)).prize.rarity).toBe('legendary')
  })

  it('leaves about half the prizes unbound and adds Valhalla gear about 15% of the time', () => {
    const random = createRandom(6)
    let unbound = 0
    let valhalla = 0
    for (let i = 0; i < 4000; i++) {
      const result = spin(board, i % 99, 50, random)
      if (!result.prize.bound) unbound++
      if (result.extra) valhalla++
    }
    expect(unbound / 4000).toBeCloseTo(0.5, 1)
    expect(valhalla / 4000).toBeCloseTo(0.15, 1)
  })
})

describe('valhallaPool', () => {
  it('offers wearable gear of the ninja’s ten-level band', () => {
    const levels = (level: number) =>
      [...new Set(valhallaPool(level).map((id) => Number(item(id)?.UseLevel)))].sort(
        (a, b) => a - b,
      )
    expect(levels(53)).toEqual([51, 52, 53])
    expect(levels(60)).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60])
    expect(levels(61)).toEqual([61])
  })

  it('offers nothing below the first band', () => {
    expect(valhallaPool(0)).toEqual([])
  })
})

describe('sellValue', () => {
  it('uses the shop price times the amount when the item has one', () => {
    expect(sellValue({ itemId: 'i160010', amount: 5, rarity: 'common' })).toBe(29 * 5)
  })

  it('falls back to the tier value otherwise', () => {
    expect(sellValue({ itemId: 'i150110', amount: 1, rarity: 'common' })).toBe(100)
    expect(sellValue({ itemId: 'i159004', amount: 1, rarity: 'legendary' })).toBe(50_000)
  })
})
