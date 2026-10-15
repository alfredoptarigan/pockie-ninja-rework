import { describe, expect, it } from 'vitest'
import { outfitOf, outfitRequiredLevel } from './outfit.js'

describe('outfitRequiredLevel', () => {
  it("follows Reborn's ceil((level - 1) * r / 31), r by the outfit value", () => {
    expect(outfitRequiredLevel(1, 42)).toBe(0)
    expect(outfitRequiredLevel(32, 27)).toBe(0)
    expect(outfitRequiredLevel(32, 35)).toBe(20)
    expect(outfitRequiredLevel(32, 60)).toBe(60)
    expect(outfitRequiredLevel(32, 42)).toBe(50)
    expect(outfitRequiredLevel(2, 35)).toBe(1)
    expect(outfitRequiredLevel(16, 0)).toBe(25)
  })
})

describe('outfitOf', () => {
  it('reads clothing, AvatarID, "+N" and the required level of an AvatarItem', () => {
    expect(outfitOf('i2931010')).toEqual({ clothing: 1, avatarId: 3101, plus: 32, level: 50 })
    expect(outfitOf('i270100')).toBeUndefined()
  })
})
