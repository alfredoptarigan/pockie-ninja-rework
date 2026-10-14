import { describe, expect, it } from 'vitest'
import { createRandom, type Random } from '../random.js'
import { petBonuses, petTotals, rollBases, speciesBaseProps } from './stats.js'

const bases = { attack: 10, defence: 7, disturb: 13, active: 0, savvy: 25 }

describe('petTotals (RefreshPetProp)', () => {
  it('is base x (1 + level x growth / 100) + bonus at levels 1, 30 and 50 with growth 120', () => {
    // 1 + 1 x 1.2 = 2.2; 1 + 30 x 1.2 = 37; 1 + 50 x 1.2 = 61.
    expect(petTotals(bases, 1, 120)).toEqual({
      attack: 22,
      defence: 15,
      disturb: 28,
      active: 0,
      savvy: 55,
    })
    expect(petTotals(bases, 30, 120)).toEqual({
      attack: 370,
      defence: 259,
      disturb: 481,
      active: 0,
      savvy: 925,
    })
    expect(petTotals(bases, 50, 120, { attack: 5 })).toEqual({
      attack: 615,
      defence: 427,
      disturb: 793,
      active: 0,
      savvy: 1525,
    })
  })
})

describe('rollBases (OnPetItemCreate)', () => {
  it('rolls each prop at 80-120% with integer division, in prop order', () => {
    const rolls = [80, 120, 100, 99, 101]
    const random: Random = { ...createRandom(1), between: () => rolls.shift()! }
    expect(
      rollBases({ attack: 14, defence: 8, disturb: 10, active: 10, savvy: 8 }, random),
    ).toEqual({ attack: 11, defence: 9, disturb: 10, active: 9, savvy: 8 })
  })

  it('stays within 80-120% for any seed', () => {
    const base = { attack: 50, defence: 50, disturb: 50, active: 50, savvy: 50 }
    for (let seed = 0; seed < 50; seed++) {
      for (const value of Object.values(rollBases(base, createRandom(seed)))) {
        expect(value).toBeGreaterThanOrEqual(40)
        expect(value).toBeLessThanOrEqual(60)
      }
    }
  })
})

describe('speciesBaseProps (ours)', () => {
  it('scales the nature profile by the level band and evolution', () => {
    expect(speciesBaseProps(2, 30, false)).toEqual({
      attack: 14,
      defence: 8,
      disturb: 10,
      active: 10,
      savvy: 8,
    })
    expect(speciesBaseProps(2, 50, false).attack).toBe(16)
    expect(speciesBaseProps(5, 40, true)).toEqual({
      attack: 11,
      defence: 10,
      disturb: 9,
      active: 9,
      savvy: 9,
    })
  })

  it('falls back to the level-30 band for an unknown band', () => {
    expect(speciesBaseProps(1, 35, false)).toEqual(speciesBaseProps(1, 30, false))
  })
})

describe('petBonuses (ours)', () => {
  it('turns prop totals into master bonus points', () => {
    expect(
      petBonuses({ attack: 854, defence: 488, disturb: 610, active: 610, savvy: 488 }),
    ).toEqual({ minAttack: 2, maxAttack: 2, defense: 18, hit: 11, dodge: 9, crit: 4 })
  })
})
