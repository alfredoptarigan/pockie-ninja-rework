import { describe, expect, it } from 'vitest'
import { characterCosmetics } from './character-preview'

describe('character cosmetics', () => {
  it('resolves the wing sprite and aura item without loading unrelated art', () => {
    const { wing, aura } = characterCosmetics({ wingSprite: 'wing_duotian_3', aura: '218200' })
    expect(wing?.atlas).toBe('/assets/reborn/entities/wings/wing_duotian_3/avatar.json')
    expect(wing?.offset).toEqual([-38, -8])
    expect(aura?.atlas).toBe('/assets/reborn/entities/auras/ki_lightning/aura.json')
  })
  it('keeps the existing character window unchanged without equipped cosmetics', () => {
    expect(characterCosmetics({})).toEqual({ wing: undefined, aura: undefined })
    expect(characterCosmetics({ wing: 'missing', aura: 'missing' })).toEqual({
      wing: undefined,
      aura: undefined,
    })
  })
})
