import { OUTFIT_STARS } from '@pockie/shared'
import { describe, expect, it } from 'vitest'
import {
  avatarRecast,
  avatarSkillIds,
  avatarStats,
  creationOutfits,
  rebornOutfits,
} from './data.js'
import { outfitBonuses, outfitIsv, outfitOf, outfitRequiredLevel } from './outfit.js'

it("shares Reborn's imported avatarStars with the client", () => {
  expect(rebornOutfits().stars).toEqual(OUTFIT_STARS)
})

describe('outfitRequiredLevel', () => {
  it("follows Reborn's tooltip: 1 up to +1, else ceil((plus - 1) * r / 31), r by the value", () => {
    expect(outfitRequiredLevel(0, 42)).toBe(1)
    expect(outfitRequiredLevel(1, 42)).toBe(1)
    expect(outfitRequiredLevel(32, 27)).toBe(1)
    expect(outfitRequiredLevel(32, 35)).toBe(20)
    expect(outfitRequiredLevel(32, 60)).toBe(60)
    expect(outfitRequiredLevel(32, 42)).toBe(50)
    expect(outfitRequiredLevel(31, 42)).toBe(49)
    expect(outfitRequiredLevel(2, 35)).toBe(1)
    expect(outfitRequiredLevel(16, 0)).toBe(25)
  })
})

describe('outfitOf', () => {
  it('reads clothing, AvatarID, Reborn\'s "+N" (AvatarLevel - 1), value and required level', () => {
    expect(outfitOf('i290001')).toEqual({ clothing: 1, avatarId: 1, plus: 0, value: 42, level: 1 })
    expect(outfitOf('i2931010')).toEqual({
      clothing: 1,
      avatarId: 3101,
      plus: 31,
      value: 42,
      level: 49,
    })
    expect(outfitOf('i270100')).toBeUndefined()
  })

  it("takes Reborn's outfit value over ours (Witch is 0 in item.ini, 42 in Reborn)", () => {
    expect(outfitOf('i290002')?.value).toBe(42)
    expect(outfitOf('i290003')?.value).toBe(27)
  })
})

describe('outfitIsv', () => {
  it("is Reborn's ISV, a recast within [ISV, 1.1 ISV], and the recast cap", () => {
    expect(outfitIsv('i290001')).toEqual({ isv: [120, 120, 120], max: [132, 132, 132] })
    expect(outfitIsv('i290001', [150, 100, 125])).toEqual({
      isv: [132, 120, 125],
      max: [132, 132, 132],
    })
    expect(outfitIsv('i250101')).toBeUndefined()
  })
})

describe('outfitBonuses', () => {
  // Ichigo +0: Reborn ISV 1.2 each, imprint 2002 Fire Master (SkillAdd0, +15%).
  const ichigo = { itemId: 'i290001', stars: 0 }

  it('adds nothing for a plain outfit: the avatar row already holds Reborn ISV', () => {
    expect(outfitBonuses(ichigo, 10)).toEqual({ strength: 0, agility: 0, stamina: 0 })
  })

  it('adds (20 + 8 * plus + level) * (recast ISV - ISV)', () => {
    expect(outfitBonuses({ ...ichigo, isv: [132, 120, 121] }, 10)).toEqual({
      strength: 360,
      agility: 0,
      stamina: 30,
    })
    // +1 (i290101): 8 more levels of ISV.
    expect(outfitBonuses({ itemId: 'i290101', stars: 0, isv: [132, 120, 120] }, 10)).toMatchObject({
      strength: 38 * 12,
    })
  })

  it("applies Reborn's stars: +5% ISV, +1 to +N, +5 points to the imprint", () => {
    // 1 star: 20 * 1.26 + 10 * 1.26 = 37.8 against 36.
    expect(outfitBonuses({ ...ichigo, stars: 1 }, 10)).toEqual({
      strength: 180,
      agility: 180,
      stamina: 180,
    })
    // 3 stars: also +1 -> (20 + 8 + 10) * 1.26 = 47.88.
    expect(outfitBonuses({ ...ichigo, stars: 3 }, 10)).toMatchObject({ strength: 4788 - 3600 })
    expect(outfitBonuses({ ...ichigo, stars: 3 }, 10)).not.toHaveProperty('skillAdd0')
    // 4 stars: Fire Master 15% -> 20%.
    expect(outfitBonuses({ ...ichigo, stars: 4 }, 10)).toMatchObject({ skillAdd0: 500 })
  })
})

describe("the outfit's Weapon Type (Reborn serverConfig.avatars weaponType)", () => {
  const weaponClass = (avatarId: number) => avatarStats(avatarId).Popsinger

  it("is Reborn's at every +N, as the UsePopsinger mask (1 Blunt, 2 Sharp, 4 Fists, 7 Any)", () => {
    // Clothing 3 fought with Fists in 2011; Reborn makes it Sharp.
    expect(weaponClass(3)).toBe(2)
    expect(weaponClass(3003)).toBe(2)
    // Clothing 65 has no weaponType in Reborn, which its client reads as Any.
    expect(weaponClass(65)).toBe(7)
  })

  it('keeps the 2011 class of an outfit Reborn does not ship', () => {
    expect(weaponClass(25)).toBe(2)
  })

  it('drives the creation screen and the Weapon Type line', () => {
    expect(creationOutfits().find((o) => o.clothing === 39)?.weaponClass).toBe(2)
    expect(creationOutfits().find((o) => o.clothing === 65)?.weaponClass).toBe(7)
  })
})

describe('avatarSkillIds', () => {
  it('reads the skills of every +N, including the i29<AvatarID>0 ids from +18 up', () => {
    // i2931010: Ichigo +31 (AvatarID 3101); Reborn's imprint 2002.
    expect(avatarSkillIds(3101)).toEqual([1901, 7777, 8888, 2002])
    expect(avatarSkillIds(1)).toEqual([1901, 7777, 8888, 2002])
  })
})

describe("Reborn's +32 (serverConfig synthesisLevelUpRates[0] has 32 steps; 2011 stops at +31)", () => {
  it('adds a +32 to every outfit, numbered on from 2011 (EquipCompose.ini targets these ids)', () => {
    expect(outfitOf('i2932010')).toEqual({
      clothing: 1,
      avatarId: 3201,
      plus: 32,
      value: 42,
      level: 50,
    })
    expect(outfitOf('i2933000')).toMatchObject({ clothing: 100, avatarId: 3300, plus: 32 })
    expect(outfitOf('i2946600')).toMatchObject({ clothing: 120, avatarId: 4660, plus: 32 })
  })

  it('has the +32 stats (20 + 8 * 32) * ISV and the +31 skills, recast and Weapon Type', () => {
    expect(avatarStats(3201)).toMatchObject({ Strength: 276 * 120, StrengthUp: 120, Popsinger: 2 })
    expect(avatarSkillIds(3201)).toEqual(avatarSkillIds(3101))
    expect(avatarRecast('i2932010')).toEqual(avatarRecast('i2931010'))
  })
})
