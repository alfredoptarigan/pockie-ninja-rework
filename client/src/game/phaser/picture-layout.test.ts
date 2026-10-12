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

  it('places standing NPCs at their coordinates and the monsters in a portrait row', () => {
    const layout = pictureLayout(field)!
    expect(layout.figures.map((f) => f.key)).toEqual(['npc:n21001', 'npc:n21002'])
    const genin = layout.figures.find((f) => f.key === 'npc:n21001')!
    expect(genin).toMatchObject({ x: 660, y: 906, scale: 1, flip: false })
    expect(layout.figures.find((f) => f.key === 'npc:n21002')!.flip).toBe(true)
    // Monsters: portraits in a row, centred at the top.
    const [sunflower, bee] = layout.portraits
    expect(sunflower).toMatchObject({ name: 'Sunflower', monster: { id: 'n33017' } })
    expect(sunflower!.portrait).toMatch(/portraits\/N33017/)
    expect(sunflower!.y).toBe(bee!.y)
    expect((sunflower!.x + bee!.x) / 2).toBe(layout.width / 2)
  })

  it('gives each portrait its drops with English names and icons', () => {
    const drops = [
      { itemId: 'i250101', nameKey: 'lg_Equip_Blunt1' },
      { itemId: 'i999999', nameKey: 'lg_i999999' },
    ]
    const [sunflower, bee] = pictureLayout({
      ...field,
      monsters: [{ ...field.monsters[0]!, drops }, field.monsters[1]!],
    })!.portraits
    expect(sunflower!.drops).toEqual([
      { itemId: 'i250101', name: 'Dogsmasher', icon: '/assets/game/items/icon_weapon_blunt1.webp' },
      { itemId: 'i999999', name: 'Unknown item', icon: undefined },
    ])
    expect(bee!.drops).toEqual([])
  })

  it('opens the Explore window from the field’s explore tree', () => {
    const layout = pictureLayout({ ...field, exploreSpots: ['21011', '21012'] })!
    expect(layout.explore).toMatchObject({
      title: 'Explore',
      spot: { file: expect.stringMatching(/clip-OutCity_1110/) },
    })
    expect(pictureLayout(field)!.explore).toBeUndefined()
    expect(pictureLayout(villageScene)!.explore).toBeUndefined()
  })

  it('has no picture for scenes without art', () => {
    expect(pictureLayout({ ...villageScene, sceneId: 171 })).toBeUndefined()
  })
})
