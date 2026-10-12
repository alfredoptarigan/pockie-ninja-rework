import { describe, expect, it } from 'vitest'
import { villageScene } from '../../test/game'
import type { SceneView } from '../types'
import { fitName, pictureLayout } from './picture-layout'

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

  it('anchors the Drops panel of each portrait under its cell, as stage fractions', () => {
    const layout = pictureLayout(field)!
    const [sunflower] = layout.portraits
    expect(sunflower!.dropsAt.x).toBeCloseTo(sunflower!.x / layout.width)
    expect(sunflower!.dropsAt.y).toBeCloseTo((50 + 120 + 64) / layout.height)
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

describe('fitName', () => {
  // About half an em per character.
  const measure = (text: string, size: number) => text.length * size * 0.5

  it('keeps short names on one line at the full size', () => {
    expect(fitName('Sunflower', 108, measure)).toEqual({ size: 22, lines: ['Sunflower'] })
  })

  it('shrinks a name that almost fits instead of cutting it', () => {
    expect(fitName('Scorching Demon', 130, measure)).toEqual({
      size: 17,
      lines: ['Scorching Demon'],
    })
  })

  it('wraps long names on two lines', () => {
    expect(fitName('Warrior of Darkness', 108, measure)).toEqual({
      size: 19,
      lines: ['Warrior of', 'Darkness'],
    })
    expect(fitName('Thunderbolt Warrior', 108, measure)).toEqual({
      size: 19,
      lines: ['Thunderbolt', 'Warrior'],
    })
  })

  it('never drops part of the name', () => {
    const fit = fitName('Extraordinarily Unpronounceable Name', 60, measure)
    expect(fit.lines.join(' ')).toBe('Extraordinarily Unpronounceable Name')
  })
})
