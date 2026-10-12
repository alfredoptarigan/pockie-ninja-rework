import { describe, expect, it } from 'vitest'
import { createRandom } from '../random.js'
import { canEnhance, enhancedAttack, enhancedMaxHp, rollEnhance } from './enhance.js'
import { ENHANCE_FACTOR, FAIL_RATES, appraised, fixedRandom, i220102, i250104 } from './fixtures.js'

describe('enhancedAttack (ConsolidateSystem.SetConsolidatedPropValue 116-133)', () => {
  it('keeps the config attack at +0', () => {
    expect(enhancedAttack(i250104, 0, ENHANCE_FACTOR)).toEqual({ min: 34, max: 41 })
  })

  it('matches the spec example i250104 34-41: +1 35-43, +12 54-66', () => {
    expect(enhancedAttack(i250104, 1, ENHANCE_FACTOR)).toEqual({ min: 35, max: 43 })
    expect(enhancedAttack(i250104, 12, ENHANCE_FACTOR)).toEqual({ min: 54, max: 66 })
  })

  it('always spreads ±10% around the mean from +1 on', () => {
    // (34 + 41) / 2 * 1.25 = 46.875 at +5.
    expect(enhancedAttack(i250104, 5, ENHANCE_FACTOR)).toEqual({ min: 42, max: 51 })
  })
})

describe('enhancedMaxHp', () => {
  it('adds a flat ConsolidateRate per level to armour (i220102 rate 4)', () => {
    expect(enhancedMaxHp(i220102, 0)).toBe(0)
    expect(enhancedMaxHp(i220102, 3)).toBe(12)
    expect(enhancedMaxHp(i220102, 12)).toBe(48)
  })

  it('gives weapons no HP', () => {
    expect(enhancedMaxHp(i250104, 12)).toBe(0)
  })
})

describe('canEnhance (CanBaseConsolidateEquip 88-114)', () => {
  it('accepts appraised weapons and armour below their max level', () => {
    expect(canEnhance(i250104, { ...appraised, enhanceLevel: 0 }, FAIL_RATES)).toBe(true)
    expect(canEnhance(i220102, { ...appraised, enhanceLevel: 11 }, FAIL_RATES)).toBe(true)
  })

  it('refuses at the max level +12', () => {
    expect(canEnhance(i250104, { ...appraised, enhanceLevel: 12 }, FAIL_RATES)).toBe(false)
  })

  it('refuses items with ConsolidateMaxLevel 0', () => {
    expect(
      canEnhance(
        { ...i250104, ConsolidateMaxLevel: 0 },
        { ...appraised, enhanceLevel: 0 },
        FAIL_RATES,
      ),
    ).toBe(false)
  })

  it('refuses rings and amulets (base type 3)', () => {
    expect(
      canEnhance({ ...i250104, EquipBaseType: 3 }, { ...appraised, enhanceLevel: 0 }, FAIL_RATES),
    ).toBe(false)
  })

  it('refuses unappraised gear', () => {
    const unappraised = { canIdentify: true, identifyTimes: 0, enhanceLevel: 0 }
    expect(canEnhance(i250104, unappraised, FAIL_RATES)).toBe(false)
  })

  it('refuses when the fail-rate table has no row for the next level', () => {
    const { '3': _, ...withoutThree } = FAIL_RATES
    expect(canEnhance(i250104, { ...appraised, enhanceLevel: 2 }, withoutThree)).toBe(false)
  })
})

describe('rollEnhance (ConsolidateSystem 176, 215)', () => {
  it('always succeeds to +1 (FailRate 0)', () => {
    expect(rollEnhance(0, FAIL_RATES, fixedRandom(100))).toEqual({ success: true, level: 1 })
  })

  it('succeeds when 100 - FailRate >= RandInt(0, 100)', () => {
    // Target +2: FailRate 33, so rolls 0..67 succeed.
    expect(rollEnhance(1, FAIL_RATES, fixedRandom(67))).toEqual({ success: true, level: 2 })
    expect(rollEnhance(1, FAIL_RATES, fixedRandom(68))).toEqual({ success: false, level: 1 })
  })

  it('keeps the level on failure, even at +11 → +12 (FailRate 99)', () => {
    expect(rollEnhance(11, FAIL_RATES, fixedRandom(2))).toEqual({ success: false, level: 11 })
    expect(rollEnhance(11, FAIL_RATES, fixedRandom(1))).toEqual({ success: true, level: 12 })
  })

  it('succeeds about (101 - F) / 101 of the time', () => {
    const random = createRandom(9)
    let wins = 0
    for (let i = 0; i < 10_000; i++) if (rollEnhance(1, FAIL_RATES, random).success) wins++
    expect(wins / 10_000).toBeCloseTo(68 / 101, 1)
  })

  it('throws without a fail-rate row (callers check canEnhance first)', () => {
    expect(() => rollEnhance(12, FAIL_RATES, fixedRandom(0))).toThrow()
  })
})
