import { describe, expect, it } from 'vitest'
import { deriveStats, type AvatarStats } from '../stats.js'
import { limitBonuses } from './bloodlines.js'

// RoleInitProperty.ini [45] (Naruto Uzumaki +0), as in stats.test.ts.
const naruto: AvatarStats = {
  AgiAtkAdd: 1500,
  Agility: 2400,
  AgilityUp: 120,
  AtkTime: 1000,
  DodgeAdd: 1500,
  MaxHP: 200,
  MaxHPAdd: 1200,
  MaxHPUp: 20,
  MaxMP: 200,
  MaxMPAdd: 1200,
  MaxMPUp: 20,
  Popsinger: 4,
  Stamina: 2400,
  StaminaUp: 120,
  StrAtkAdd: 1200,
  StrParryAdd: 1200,
  Strength: 2800,
  StrengthUp: 140,
}

describe('limitBonuses (decision 11)', () => {
  it('sums limits 1 + 41, two souls and prayer 3', () => {
    const bonuses = limitBonuses(
      [1, 41],
      [
        { type: 1, level: 1, limit: 1 }, // Firm L1: defense 13 (valueByLevel[1])
        { type: 3, level: 1, limit: 41 }, // Deft L1: dodge 7.8
        { type: 9, level: 5, limit: 2 }, // socketed in an inactive limit: ignored
      ],
      [
        { limit: 1, attribute: 'strength', level: 3 }, // 8 x 3 points x100
        { limit: 2, attribute: 'agility', level: 9 }, // inactive: ignored
      ],
    )
    expect(bonuses).toEqual({
      // limit 1 base 2300 + bonus 3000, limit 41 base 12000, prayer 2400
      strength: 19_700,
      agility: 1100 + 9000,
      stamina: 2300 + 7000,
      skillAdd5: 2,
      tough: 43,
      skillAdd3: 6,
      hit: 158,
      neglectDefense: 158,
      defense: 13,
      dodge: 7,
    })
  })

  it('sums first, then truncates', () => {
    const souls = [
      { type: 3, level: 1, limit: 1 },
      { type: 3, level: 1, limit: 41 },
    ]
    expect(limitBonuses([1, 41], souls).dodge).toBe(15) // 7.8 + 7.8 = 15.6, not 7 + 7
  })

  it('gives nothing without active limits', () => {
    expect(limitBonuses([], [{ type: 1, level: 1, limit: 1 }])).toEqual({})
  })
})

describe('bloodlines on a level-60 fighter (stat scale check)', () => {
  it('pins the totals of Naruto with limits 1, 9 and 41 active', () => {
    const bare = deriveStats(naruto, 60)
    const withLimits = deriveStats(naruto, 60, limitBonuses([1, 9, 41]))
    expect(bare).toMatchObject({ strength: 11_200, agility: 9600, stamina: 9600, maxHp: 1512 })
    expect(withLimits).toMatchObject({
      strength: 30_300,
      agility: 22_100,
      stamina: 23_900,
      maxHp: 1666,
      atkTime: 877,
      dodge: 14,
      parry: 69,
      hit: 158,
      defense: 77,
      tough: 43,
      neglectDefense: 158,
      skillAdd: [0, 0, 0, 6, 0, 2, 0, 0, 3, 0],
    })
    // Limits stay a fraction of the level-60 base, not a multiple of it.
    expect(withLimits.maxHp / bare.maxHp).toBeLessThan(1.5)
  })
})
