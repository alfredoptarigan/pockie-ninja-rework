import { describe, expect, it } from 'vitest'
import type Phaser from 'phaser'
import { BattleVisuals } from './battle-visuals'
import { auraAsset, petAsset, wingAsset, type VisualReplay } from './companions'
import type { Timeline } from './timeline'

function fixture() {
  const loaded: string[] = []
  const sprites: Record<string, unknown>[] = []
  const aura = auraAsset('ki_lightning')!.atlas!
  const scene = {
    load: { multiatlas: (key: string) => loaded.push(key), json: () => {} },
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
        ]) {
          sprite[method] = (...args: unknown[]) => {
            sprite[method.slice(3)] = args
            return sprite
          }
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
        pet: { avatar: 10003 },
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
  it('draws no pet when its icon-only entry has no atlas', () => {
    const f = fixture()
    f.replay.fighters[0]!.pet = { avatar: 10052 }
    f.replay.fighters[0]!.look = {}
    const visuals = new BattleVisuals(f.scene, f.replay, f.timeline)
    visuals.preload()
    visuals.render(0)
    expect(f.loaded).toEqual([])
    expect(f.sprites).toEqual([])
  })
})
