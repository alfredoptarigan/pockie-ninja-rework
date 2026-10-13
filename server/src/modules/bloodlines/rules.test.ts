import { createRandom, type Random } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { rebornBloodlines } from '../../game/data.js'
import { LIMIT_ITEM_BANDS, LIMIT_ITEM_COMBO_COUNT, limitItemDrops } from './rules.js'

/** A Random whose rolls come from `values` (next() in [0, 1)). */
const fixed = (...values: number[]): Random => {
  const next = () => values.shift() ?? 0
  return {
    next,
    int: (n) => Math.floor(next() * n),
    between: (a, b) => a + Math.floor(next() * (b - a + 1)),
  }
}

describe('LIMIT_ITEM_BANDS', () => {
  it('covers exactly the 18 unlock items of the 44 limits', () => {
    const items = new Set(rebornBloodlines().limits.map((l) => l.unlockItem))
    expect(new Set(Object.keys(LIMIT_ITEM_BANDS))).toEqual(items)
    expect(items.size).toBe(18)
  })
})

describe('limitItemDrops', () => {
  it('drops nothing on 70% of wins', () => {
    expect(limitItemDrops(71, fixed(0.3))).toEqual([])
  })

  it('drops 1 bound item on 30% of wins, only from bands at or below the scene level', () => {
    expect(limitItemDrops(16, fixed(0.29, 0))).toEqual([{ itemId: 'i148023', bound: true }])
    expect(limitItemDrops(16, fixed(0.29, 0.99))).toEqual([{ itemId: 'i148024', bound: true }])
    // Scene level 26 (2605) adds the Lv26 band: 4 items.
    expect(limitItemDrops(26, fixed(0.29, 0.99))).toEqual([{ itemId: 'i148026', bound: true }])
  })

  it('never drops above the scene band over many seeded rolls', () => {
    const random = createRandom(42)
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++)
      for (const drop of limitItemDrops(41, random)) seen.add(drop.itemId)
    expect([...seen].every((id) => LIMIT_ITEM_BANDS[id]! <= 41)).toBe(true)
    // Lv16, 26, 31 and 41 bands: 12 items.
    expect(seen.size).toBe(12)
  })

  it('gives 4 of one eligible item for a matched combo', () => {
    expect(LIMIT_ITEM_COMBO_COUNT).toBe(4)
    const drops = limitItemDrops(86, fixed(0.99), { combo: true })
    expect(drops).toEqual(Array(4).fill({ itemId: 'i148040', bound: true }))
  })

  it('gives nothing below the lowest band', () => {
    expect(limitItemDrops(15, fixed(0))).toEqual([])
    expect(limitItemDrops(15, fixed(0), { combo: true })).toEqual([])
  })
})
