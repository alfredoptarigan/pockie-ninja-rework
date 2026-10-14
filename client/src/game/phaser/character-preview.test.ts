import { describe, expect, it } from 'vitest'
import { characterCosmetics, sortedFrames } from './character-preview'

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

describe('preview frames', () => {
  it('sorts frames numerically once per atlas and prefix', () => {
    const frame = (filename: string) => ({
      filename,
      frame: { x: 0, y: 0, w: 1, h: 1 },
      sourceSize: { w: 1, h: 1 },
      spriteSourceSize: { x: 0, y: 0 },
    })
    const atlas = {
      textures: [
        { image: 'a', frames: [frame('999/10'), frame('999/2'), frame('back/1')] },
        { image: 'b', frames: [frame('999/1')] },
      ],
    }
    const frames = sortedFrames(atlas, '999/')
    expect(frames.map((f) => [f.frame.filename, f.pageIndex])).toEqual([
      ['999/1', 1],
      ['999/2', 0],
      ['999/10', 0],
    ])
    expect(sortedFrames(atlas, '999/')).toBe(frames)
  })
})
