import { describe, expect, it } from 'vitest'
import type Phaser from 'phaser'
import { BattleVisuals, DEPTH } from './battle-visuals'
import { auraAsset, petAsset, wingAsset, type VisualReplay } from './companions'
import { effectAsset } from './effects-map'
import type { Timeline } from './timeline'

function fixture() {
  const loaded: string[] = []
  const sprites: Record<string, unknown>[] = []
  const aura = auraAsset('ki_lightning')!.atlas!
  const scene = {
    load: {
      multiatlas: (key: string) => loaded.push(key),
      image: (key: string) => loaded.push(key),
      json: () => {},
    },
    textures: {
      exists: (key: string) => loaded.includes(key),
      get: () => ({
        getFrameNames: () => ['999/1', 'back/idle/1', 'front/idle/1'],
        has: () => false,
      }),
    },
    cache: {
      json: {
        get: () => ({
          meta: {
            anchor: { x: 110, y: 220 },
            fps: 16,
            layers: [{ name: 'back' }, { name: 'front' }],
          },
        }),
      },
    },
    add: {
      sprite: (_x: number, _y: number, key: string) => {
        const sprite: Record<string, unknown> = { key, frame: { realWidth: 220, realHeight: 280 } }
        for (const method of [
          'setTexture',
          'setOrigin',
          'setPosition',
          'setScale',
          'setDepth',
          'setVisible',
          'setInteractive',
        ]) {
          sprite[method] = (...args: unknown[]) => {
            sprite[method.slice(3)] = args
            if (method === 'setVisible') sprite.visible = args[0]
            return sprite
          }
        }
        sprite.on = (event: string, handler: unknown) => {
          sprite[event] = handler
          return sprite
        }
        sprites.push(sprite)
        return sprite
      },
    },
  } as unknown as Phaser.Scene
  const replay: VisualReplay = {
    seed: 1,
    events: [],
    winner: 'attackers',
    fighters: [
      {
        index: 0,
        side: 'attackers',
        name: 'A',
        level: 1,
        maxHp: 100,
        startHp: 100,
        hp: 100,
        pet: { avatar: 10003, species: 'pet' },
        look: { wingSprite: 'wing_duotian_3', aura: 'ki_lightning' },
      },
    ],
  }
  const timeline: Timeline = {
    poses: [[{ at: 0, motion: '999', loop: true, from: 300, to: 300, moveMs: 0 }]],
    bars: [],
    texts: [],
    duration: 1000,
    endAt: 1000,
  }
  return { loaded, sprites, scene, replay, timeline, aura }
}
describe('battle cosmetic rendering', () => {
  it('loads only selected replay assets and draws anchored aura behind its master', () => {
    const f = fixture()
    const visuals = new BattleVisuals(f.scene, f.replay, f.timeline)
    visuals.preload()
    expect(f.loaded).toEqual([petAsset(10003)!.atlas, wingAsset('wing_duotian_3')!.atlas, f.aura])
    visuals.render(0)
    const layers = f.sprites.filter((s) => s.key === f.aura)
    expect(layers).toHaveLength(2)
    for (const layer of layers) {
      expect((layer.Depth as number[])[0]).toBeLessThan(0)
      expect(layer.Origin).toEqual([0.5, 220 / 280])
      expect(layer.Position).toEqual([300, 455])
    }
  })
  it('draws the icon of an icon-only pet as a static image beside its master', () => {
    const f = fixture()
    f.replay.fighters[0]!.pet = { avatar: 10052, species: 'pet' }
    f.replay.fighters[0]!.look = {}
    const icon = petAsset(10052)!.icon!
    const visuals = new BattleVisuals(f.scene, f.replay, f.timeline)
    visuals.preload()
    visuals.render(0)
    expect(f.loaded).toEqual([icon])
    expect(f.sprites).toHaveLength(1)
    expect(f.sprites[0]).toMatchObject({ key: icon, Position: [160, 505], Scale: [-1, 1] })
  })
  it('puts global and pet effects in fixed depth bands, not at their master pose', () => {
    const f = fixture()
    f.timeline.poses = [[{ at: 5000, motion: '999', loop: true, from: 300, to: 300, moveMs: 0 }]]
    // Mist covers the whole field; the holy aura plays behind the pet.
    f.timeline.bars = [{ at: 0, fighter: 0, hp: 100, mp: 0, buffs: [11821, 11865] }]
    const visuals = new BattleVisuals(f.scene, f.replay, f.timeline)
    visuals.preload()
    visuals.render(6000)
    const depthOf = (atlas: string) =>
      (f.sprites.find((s) => s.key === atlas)!.Depth as number[])[0]
    expect(depthOf(effectAsset(11821)!.atlas!)).toBe(DEPTH.overlay)
    expect(depthOf(effectAsset(11865)!.atlas!)).toBe(DEPTH.overlayBack)
  })
})

it('lets active status effects be hovered and clears the tooltip when they disappear', () => {
  const f = fixture()
  f.timeline.bars = [
    { at: 0, fighter: 0, hp: 100, mp: 0, buffs: [11802] },
    { at: 500, fighter: 0, hp: 100, mp: 0, buffs: [] },
  ]
  const hovered: unknown[] = []
  const visuals = new BattleVisuals(f.scene, f.replay, f.timeline, [], (status) =>
    hovered.push(status),
  )
  visuals.preload()
  visuals.render(0)
  const effect = f.sprites.find((s) => s.key === effectAsset(11802)!.atlas)!
  expect(effect.Interactive).toEqual([])
  ;(effect.pointerover as (pointer: { x: number; y: number }) => void)({ x: 700, y: 300 })
  expect(hovered.at(-1)).toEqual({ buff: 11802, x: 700, y: 300 })
  visuals.render(500)
  expect(hovered.at(-1)).toBeNull()
  ;(effect.pointerover as (pointer: { x: number; y: number }) => void)({ x: 700, y: 300 })
  expect(hovered.at(-1)).toBeNull()
})
