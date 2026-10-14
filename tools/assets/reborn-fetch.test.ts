import { describe, expect, it } from 'vitest'
import { audioPaths, enumerateM6 } from './reborn-fetch.ts'

describe('M6 reference enumeration', () => {
  it('follows item sprite metadata and loader pets, separating aura icons', () => {
    const targets = enumerateM6(
      '',
      { WING: { Line: { 10000: [] } } },
      {
        pet: ['pets/42'],
        wing: ['wings/icon', 0, 0, 0, 0, 0, 0, { stat: 10000, wingSprite: 'feather' }],
        aura: ['wings/glow', 0, 0, 0, 0, 0, 0, { stat: 10000, battleAura: 'glow' }],
        empty: [null],
      },
      { 'combat/pets': [43] },
    )
    expect(targets).toContainEqual({
      group: 'pets',
      id: '43',
      path: 'entities/pets/43/avatar.json',
      atlas: true,
    })
    expect(targets).toContainEqual({
      group: 'wings',
      id: 'feather',
      path: 'entities/wings/feather/avatar.json',
      atlas: true,
    })
    expect(targets.find((t) => t.path === 'icons/items/wings/glow.png')?.group).toBe('auras')
  })
  it('deduplicates playlist and bundle audio and preserves nested directories', () => {
    expect(
      audioPaths(
        { scenes: { city: ['music/a.mp3', 'music/a.mp3'] }, sfx: ['assets/audio/hit.wav'] },
        '"audio/hit.wav"',
      ),
    ).toEqual(['audio/hit.wav', 'audio/music/a.mp3'])
  })
  it('includes all card sets and aura atlas profiles without executing JavaScript', () => {
    const targets = enumerateM6(
      '"Akatsuki/1.jpg":"Deidara",id:"glow",nameKey:"ui__battle_aura_glow",descriptionKey:"desc",atlasFile:"aura.json"',
      {},
      {},
      {},
    )
    expect(
      targets.some((t) => t.path === 'icons/items/cards/Akatsuki/1.jpg' && t.id === 'Deidara'),
    ).toBe(true)
    expect(targets.some((t) => t.path === 'entities/auras/glow/aura.json' && t.atlas)).toBe(true)
  })
})
