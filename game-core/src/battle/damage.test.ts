import { describe, expect, it } from 'vitest'
import { applyCrit, applyDefense, applyParry, critChance, hitChance } from './damage.js'

describe('Damage.java formulas', () => {
  it('hits always when dodge <= hit, otherwise loses 1% per 16 points', () => {
    expect(hitChance(10, 20)).toBe(100)
    expect(hitChance(48, 0)).toBe(97)
    expect(hitChance(15, 0)).toBe(100)
  })

  it('crits only when CritMul beats Tough, 1% per 16 points', () => {
    expect(critChance(0, 0)).toBe(0)
    expect(critChance(10, 20)).toBe(0)
    expect(critChance(160, 0)).toBe(10)
  })

  it('applies the crit multiplier from CritAttach (230 = x2.3)', () => {
    expect(applyCrit(100, 230, 160)).toBe(230)
    // A multiplier of 1 or less leaves the damage alone.
    expect(applyCrit(100, 50, 160)).toBe(100)
  })

  it('reduces damage by an active parry percentage', () => {
    expect(applyParry(100, 40)).toBe(60)
    expect(applyParry(100, 0)).toBe(100)
  })

  it('matches the defence result of an original replay (1848 vs 154 → 1659)', () => {
    expect(applyDefense(1848, 154, 0)).toBe(1659)
  })

  it('lets ignore-defence lower defence but never below -1353', () => {
    expect(applyDefense(100, 154, 154)).toBe(100)
    expect(applyDefense(100, 0, 99999)).toBeGreaterThan(100)
  })
})
