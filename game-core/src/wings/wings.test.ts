import { describe, expect, it } from 'vitest'
import { createRandom, type Random } from '../random.js'
import { enhance, enhanceOdds, type WingOutcome } from './enhance.js'
import { wingStats } from './stats.js'

/** A Random whose next() always returns `value`. */
const fixed = (value: number): Random => ({ next: () => value, int: () => 0, between: (a) => a })
const PLUME = { levelJump: 1 }

describe('enhanceOdds (decision 24)', () => {
  it('level 5: only success or fail', () => {
    expect(enhanceOdds(5, 1)).toEqual({ success: 80, fail: 20, decrease: 0, reset: 0, destroy: 0 })
  })

  it('level 15: failures split into fail and decrease', () => {
    expect(enhanceOdds(15, 1)).toEqual({
      success: 40,
      fail: 42,
      decrease: 18,
      reset: 0,
      destroy: 0,
    })
  })

  it('level 25: every outcome band is open', () => {
    expect(enhanceOdds(25, 1)).toEqual({
      success: 15,
      fail: 42.5,
      decrease: 25.5,
      reset: 12.75,
      destroy: 4.25,
    })
  })

  it('a stone jump is rated by its target level, capped at 30', () => {
    expect(enhanceOdds(0, 4).success).toBe(100)
    expect(enhanceOdds(3, 3).success).toBe(80)
    expect(enhanceOdds(28, 4).success).toBe(15)
  })

  it('Luck multiplies success, at most 100%', () => {
    expect(enhanceOdds(25, 1, { luck: 100 })).toEqual({
      success: 30,
      fail: 35,
      decrease: 21,
      reset: 10.5,
      destroy: 3.5,
    })
    expect(enhanceOdds(5, 1, { luck: 100 }).success).toBe(100)
    expect(enhanceOdds(5, 1, { luck: 100 }).fail).toBe(0)
  })

  it('Safety reduces decrease and reset; the rest becomes fail', () => {
    expect(enhanceOdds(25, 1, { safety: 50 })).toEqual({
      success: 15,
      fail: 61.625,
      decrease: 12.75,
      reset: 6.375,
      destroy: 4.25,
    })
    expect(enhanceOdds(15, 1, { safety: 100 })).toMatchObject({ fail: 60, decrease: 0 })
  })

  it('Integrity reduces destroy only', () => {
    expect(enhanceOdds(25, 1, { integrity: 100 })).toEqual({
      success: 15,
      fail: 46.75,
      decrease: 25.5,
      reset: 12.75,
      destroy: 0,
    })
  })

  it('refuses a wing already at level 30', () => {
    expect(() => enhanceOdds(30, 1)).toThrow(RangeError)
  })
})

describe('enhance (decision 24)', () => {
  const cases: [number, number, WingOutcome, number | null][] = [
    [5, 0.79, 'success', 6],
    [5, 0.85, 'fail', 5],
    [15, 0.1, 'success', 16],
    [15, 0.5, 'decrease', 14],
    [15, 0.7, 'fail', 15],
    [25, 0.1, 'success', 26],
    [25, 0.16, 'decrease', 24],
    [25, 0.45, 'reset', 0],
    [25, 0.55, 'destroy', null],
    [25, 0.9, 'fail', 25],
  ]
  it.each(cases)('level %i, roll %f: %s', (level, roll, outcome, after) => {
    expect(enhance(level, PLUME, {}, fixed(roll))).toEqual({ outcome, level: after })
  })

  it('a +4 stone from 28 stops at 30', () => {
    expect(enhance(28, { levelJump: 4 }, {}, fixed(0))).toEqual({ outcome: 'success', level: 30 })
  })

  it('seeded rolls at levels 5, 15 and 25 follow the odds', () => {
    const random = createRandom(2026)
    const trials = 20000
    for (const level of [5, 15, 25]) {
      const seen: Record<WingOutcome, number> = {
        success: 0,
        fail: 0,
        decrease: 0,
        reset: 0,
        destroy: 0,
      }
      for (let i = 0; i < trials; i++) seen[enhance(level, PLUME, {}, random).outcome]++
      const odds = enhanceOdds(level, 1)
      for (const outcome of Object.keys(seen) as WingOutcome[])
        expect(Math.abs((seen[outcome] / trials) * 100 - odds[outcome])).toBeLessThan(1.5)
    }
  })
})

describe('wingStats (decision 23)', () => {
  it('reads WING.Line at the level, truncated', () => {
    expect(wingStats('i218000', 0)).toEqual({ hp: 80, hit: 42, neglectDefense: 46, decDamage: 1 })
    expect(wingStats('i218000', 1)).toEqual({ hp: 96, hit: 50, neglectDefense: 55, decDamage: 1 })
    expect(wingStats('i218000', 30)).toEqual({
      hp: 1600,
      hit: 840,
      neglectDefense: 920,
      decDamage: 4,
    })
  })

  it('auras reuse the wing lines', () => {
    expect(wingStats('i218200', 0)).toEqual(wingStats('i218000', 0))
  })

  it('caps at level 30 and ignores other items', () => {
    expect(wingStats('i218000', 31)).toEqual(wingStats('i218000', 30))
    expect(wingStats('i218021', 0)).toEqual({})
  })
})
