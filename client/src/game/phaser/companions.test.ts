import { describe, expect, it } from 'vitest'
import {
  auraAsset,
  wingAsset,
  petAsset,
  petTiming,
  layerPosition,
  petX,
  PET_FRAME_MS,
  type VisualReplay,
} from './companions'
import { effectAsset } from './effects-map'
import { glyphLayout, numberGlyphs } from './numbers'
import { buildTimeline } from './timeline'
const replay = (): VisualReplay => ({
  seed: 1,
  winner: 'attackers',
  events: [],
  fighters: [
    { index: 0, side: 'attackers', name: 'A', level: 1, maxHp: 100, startHp: 100, hp: 100 },
    { index: 1, side: 'defenders', name: 'B', level: 1, maxHp: 100, startHp: 100, hp: 80 },
  ],
})
const build = (r: VisualReplay) => buildTimeline(r, { art: [], skillMotions: null })
describe('Reborn replay companions', () => {
  it('resolves selected assets and ignores unmapped buffs', () => {
    expect(petAsset(10003)?.atlas).toContain('/pets/10003/')
    expect(wingAsset('wing_duotian_3')?.offset).toEqual([-38, -8])
    expect(auraAsset('ki_lightning')?.atlas).toContain('/auras/ki_lightning/')
    expect(effectAsset(11811)?.atlas).toContain('/effects/poison.json')
    expect(effectAsset(-1)).toBeUndefined()
  })
  it('mirrors pet positions and wing offsets', () => {
    expect(petX(300, 'attackers')).toBe(160)
    expect(petX(700, 'defenders')).toBe(840)
    expect(layerPosition(300, 455, 'attackers', [-38, -8])).toEqual({ x: 338, y: 447, scaleX: -1 })
    expect(layerPosition(700, 455, 'defenders', [-38, -8])).toEqual({ x: 662, y: 447, scaleX: 1 })
  })
  it('schedules the pet instead of its master and hits at impactFrame', () => {
    const r = replay()
    r.fighters[0]!.pet = { species: '320046', avatar: 10003 }
    r.events = [
      { actor: 0, target: 1, event: 14, isPet: true, skillId: 40001, damage: 20, hit: true },
    ]
    const timeline = build(r)
    const timing = petTiming(10003)
    expect(timeline.pets).toEqual([
      { at: 500, fighter: 0, motion: '52', end: 500 + 22 * PET_FRAME_MS },
    ])
    expect(timeline.texts.find((t) => t.kind === 'damage')?.at).toBe(500 + timing.impact)
    expect(timeline.poses[0]?.some((p) => p.skillId === 40001)).toBe(false)
  })
  it('keeps the legacy timeline unchanged without companions', () => {
    const r = replay()
    r.events = [{ actor: 0, target: 1, event: 14, damage: 20, hit: true }]
    expect(build(r)).toMatchSnapshot()
    expect(build(r)).not.toHaveProperty('pets')
  })
  it('lays out all number glyphs and selects healing art', () => {
    expect(numberGlyphs('damage', '-0123456789')).toEqual({
      atlas: 'normal',
      glyphs: [...'0123456789'],
    })
    expect(numberGlyphs('heal', '+120')).toEqual({ atlas: 'heal', glyphs: ['1', '2', '0'] })
    expect(numberGlyphs('mp', '+10 MP')).toBeUndefined()
    expect(glyphLayout([10, 20, 10])).toEqual([-21, -10, 11])
  })
})
