import { describe, expect, it } from 'vitest'
import { villageScene } from '../../test/game'
import type { SceneView } from '../types'
import { pictureLayout } from './picture-layout'

const field: SceneView = {
  ...villageScene,
  sceneId: 2101,
  npcs: [
    { id: 'n21001', nameKey: 'lg_name_n21001', x: 660, y: 906, scale: 100 },
    { id: 'n21002', nameKey: 'lg_name_n21002', x: 908, y: 950, scale: -100 },
  ],
  monsters: [
    { id: 'n33017', nameKey: 'lg_name_n33017', level: 2 },
    { id: 'n33006', nameKey: 'lg_name_n33006', level: 4 },
  ],
}

describe('pictureLayout', () => {
  it('maps village buildings to the NPC behind them', () => {
    const layout = pictureLayout(villageScene)!
    expect(layout.width).toBe(1920)
    expect(layout.under[0]).toMatch(/scenes\/111\/background/)
    const hall = layout.hotspots.find((h) => h.clip === 'clip_hall')!
    expect(hall.npc?.id).toBe('n11001')
    expect(hall.label).toBe('Fire Village Elder in the Hall')
    expect(hall.title).toBe('Hall')
    expect(layout.hotspots.find((h) => h.clip === 'clip_pet')!.title).toBe('Pet Kennel')
    // Buildings whose NPC is not in the scene are drawn without an action.
    expect(layout.hotspots.find((h) => h.clip === 'clip_arena')?.npc).toBeUndefined()
    // Building NPCs are not drawn a second time as figures.
    expect(layout.figures).toEqual([])
  })

  it('maps Angel City buildings from the clip each NPC names', () => {
    const layout = pictureLayout({
      ...villageScene,
      sceneId: 161,
      npcs: [
        { id: 'n16003', nameKey: 'lg_name_n16003', x: 0, y: 0, scale: 100, clip: 'clip_foundry' },
        { id: 'n16004', nameKey: 'lg_name_n16004', x: 0, y: 0, scale: 100, clip: null },
      ],
    })!
    expect(layout.hotspots.find((h) => h.clip === 'clip_foundry')?.npc?.id).toBe('n16003')
  })

  it('places standing NPCs at their coordinates', () => {
    const layout = pictureLayout(field)!
    expect(layout.figures.map((f) => f.key)).toEqual(['npc:n21001', 'npc:n21002'])
    const genin = layout.figures.find((f) => f.key === 'npc:n21001')!
    expect(genin).toMatchObject({ x: 660, y: 906, scale: 1, flip: false })
    expect(layout.figures.find((f) => f.key === 'npc:n21002')!.flip).toBe(true)
  })

  it('opens the Explore window from the field’s explore tree', () => {
    const layout = pictureLayout({ ...field, exploreSpots: ['21011', '21012'] }, 'OutCity_1110')!
    expect(layout.explore).toMatchObject({
      title: 'Explore',
      spot: { file: expect.stringMatching(/clip-OutCity_1110/) },
    })
    expect(pictureLayout(field)!.explore).toBeUndefined()
    expect(pictureLayout(field, 'NoSuchClip')!.explore).toBeUndefined()
    expect(pictureLayout(villageScene)!.explore).toBeUndefined()
  })

  it('has no picture for scenes without art', () => {
    expect(pictureLayout({ ...villageScene, sceneId: 5001 })).toBeUndefined()
  })
})
