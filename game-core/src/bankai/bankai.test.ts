import { describe, expect, it } from 'vitest'
import {
  bankaiForms,
  canUnlockWeapon,
  crystalFoodXp,
  crystalName,
  crystalStatValue,
  crystalXpNeeded,
  feedCrystal,
  inventorySlotCost,
  requiredWeaponExp,
  ringSlotUnlocked,
  upgradeWeapon,
  weaponBonuses,
  WEAPON_MAX_LEVEL,
} from './bankai.js'

describe('crystals (Reborn bankai slice, main.js @1281706)', () => {
  it('values a stat as (base + (level - 1) * inc) * 0.5', () => {
    expect(crystalStatValue('green', 'strength', 1)).toBe(4)
    expect(crystalStatValue('green', 'strength', 3)).toBe(8)
    expect(crystalStatValue('orange', 'defense', 2)).toBe(60.5)
  })

  it('names a crystal by quality and stat', () => {
    expect(crystalName('blue', 'speed')).toBe('Soft Wind')
    expect(crystalName('black', 'maxHp')).toBe('Black Eden')
  })

  it('needs the next XP step, 0 at the guide max level (10, or 20 for black and orange)', () => {
    expect(crystalXpNeeded('green', 1)).toBe(300)
    expect(crystalXpNeeded('green', 9)).toBe(38400)
    expect(crystalXpNeeded('green', 10)).toBe(0)
    expect(crystalXpNeeded('black', 10)).toBe(900000)
    expect(crystalXpNeeded('orange', 20)).toBe(0)
  })

  it('feeds base XP plus every level step it climbed', () => {
    expect(crystalFoodXp('green', 1)).toBe(25)
    expect(crystalFoodXp('green', 2)).toBe(25 + 0 + 300)
    expect(crystalFoodXp('blue', 3)).toBe(50 + 0 + 600 + 900)
  })

  it('levels a fed crystal and stops at its max level', () => {
    expect(feedCrystal({ quality: 'green', level: 1, exp: 0 }, 299)).toEqual({ level: 1, exp: 299 })
    expect(feedCrystal({ quality: 'green', level: 1, exp: 100 }, 700)).toEqual({
      level: 3,
      exp: 50,
    })
    expect(feedCrystal({ quality: 'green', level: 9, exp: 0 }, 10 ** 9)).toEqual({
      level: 10,
      exp: 0,
    })
  })
})

describe('weapons', () => {
  it('needs 3000 + 1500 * (level - 1) EXP and stops at the data cap', () => {
    expect(requiredWeaponExp(1)).toBe(3000)
    expect(requiredWeaponExp(14)).toBe(22500)
    expect(requiredWeaponExp(WEAPON_MAX_LEVEL)).toBe(0)
  })

  it('moves pool EXP into the weapon, one level at most per upgrade', () => {
    expect(upgradeWeapon({ level: 1, exp: 0 }, 1000)).toEqual({ level: 1, exp: 1000, spent: 1000 })
    expect(upgradeWeapon({ level: 1, exp: 2500 }, 9999)).toEqual({ level: 2, exp: 0, spent: 500 })
    expect(upgradeWeapon({ level: WEAPON_MAX_LEVEL, exp: 0 }, 9999)).toEqual({
      level: WEAPON_MAX_LEVEL,
      exp: 0,
      spent: 0,
    })
  })

  it('unlocks Zangetsu at character level 40, then each weapon at the previous Lv10', () => {
    expect(canUnlockWeapon('zangetsu', 39, {})).toBe(false)
    expect(canUnlockWeapon('zangetsu', 40, {})).toBe(true)
    expect(canUnlockWeapon('senbonzakura', 90, { zangetsu: 9 })).toBe(false)
    expect(canUnlockWeapon('senbonzakura', 90, { zangetsu: 10 })).toBe(true)
    expect(canUnlockWeapon('iceRing', 90, { zangetsu: 15, senbonzakura: 10 })).toBe(true)
  })

  it('opens forms at levels 1, 5 and 10 and ring slots at [1,2,3,4,5,6,8,10]', () => {
    expect([0, 1, 4, 5, 9, 10].map(bankaiForms)).toEqual([0, 1, 1, 2, 2, 3])
    expect(ringSlotUnlocked(6, 1)).toBe(false)
    expect(ringSlotUnlocked(6, 8)).toBe(true)
    expect(ringSlotUnlocked(7, 9)).toBe(false)
  })

  it('grants the per-level bonuses (computeBonuses), Ice Ring in tenths of a percent', () => {
    expect(weaponBonuses('zangetsu', 0)).toEqual([])
    expect(weaponBonuses('zangetsu', 1)).toEqual([
      { stat: 'strength', value: 40 },
      { stat: 'agility', value: 40 },
      { stat: 'stamina', value: 40 },
    ])
    expect(weaponBonuses('senbonzakura', 15)).toEqual([
      { stat: 'defenseBreak', value: 400 },
      { stat: 'dodge', value: 300 },
      { stat: 'critical', value: 300 },
    ])
    expect(weaponBonuses('iceRing', 2)).toEqual([
      { stat: 'attackPct', value: 12 },
      { stat: 'hpPct', value: 12 },
      { stat: 'speedPct', value: 12 },
    ])
  })
})

describe('crystal inventory slots', () => {
  it('costs 50 x slot coupons, 10 gold or 5000 x slot stones', () => {
    expect(inventorySlotCost(8)).toEqual({ coupons: 400, gold: 10, stones: 40000 })
  })
})
