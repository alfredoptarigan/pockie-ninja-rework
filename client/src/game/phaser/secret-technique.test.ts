import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FightEvent, Replay } from '../types'
import {
  atlasFrames,
  loadSecretArt,
  replaySecretTechniques,
  resolveSecretTechnique,
  SECRET_FPS,
  SECRET_FRAME_MS,
  secretOverlay,
  shiftAt,
  type SecretArt,
  type SecretTechnique,
} from './secret-technique'
import { buildTimeline, HOME, latestAt, secretLayers, STAGE } from './timeline'

const technique = (extra: Partial<SecretTechnique> = {}): SecretTechnique => ({
  clothing: 1,
  damageFrame: 10,
  motionFrame: 4,
  offset: [-1000, -600],
  transforms: { '1': [1, 0, 0, 1, 30, 0], '3': [1, 0, 0, 1, -20, 5] },
  atlas: '/t/main.json',
  pages: ['/t/main.1.webp'],
  concurrent: { atlas: '/t/back.json', pages: ['/t/back.1.webp'] },
  concurrentOffset: [-50, -20],
  concurrentOrigin: 'source',
  ...extra,
})
const names = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
const secret = (extra: Partial<SecretTechnique> = {}): SecretArt => ({
  key: '19010',
  technique: technique(extra),
  frames: names(20),
  concurrentFrames: names(24),
})

const fighter = (index: number, side: 'attackers' | 'defenders', hp: number) => ({
  index,
  side,
  name: `F${index}`,
  level: 1,
  maxHp: 100,
  startHp: 100,
  hp,
})
const replayOf = (events: FightEvent[]): Replay => ({
  seed: 1,
  winner: 'attackers',
  fighters: [fighter(0, 'attackers', 100), fighter(1, 'defenders', 40)],
  events,
})
const ultimate: FightEvent = {
  actor: 0,
  event: 14,
  target: 1,
  skillId: 19010,
  damage: 60,
  hit: true,
}

describe('resolveSecretTechnique', () => {
  it('plays the outfit base atlas for 19xx and the ru variant with its back layer for id x 10', () => {
    expect(resolveSecretTechnique(1, 1901)?.technique.atlas).toBe(
      '/assets/reborn/entities/avatars/1/secret_technique.json',
    )
    const ru = resolveSecretTechnique(1, 19010)
    expect(ru?.key).toBe('19010')
    expect(ru?.technique.atlas).toContain('secret_technique-ru-19010-v1.json')
    expect(ru?.technique.concurrent?.atlas).toContain('secret_technique-ru-19010-back-v1.json')
  })

  it('has no art for other outfits, monsters and normal skills', () => {
    expect(resolveSecretTechnique(2, 1901)).toBeUndefined()
    expect(resolveSecretTechnique(undefined, 1901)).toBeUndefined()
    expect(resolveSecretTechnique(1, 1)).toBeUndefined()
    expect(resolveSecretTechnique(1, undefined)).toBeUndefined()
  })
})

describe('atlas loading', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sorts frame names numerically across pages', () => {
    const atlas = {
      textures: [
        { frames: [{ filename: '10' }, { filename: '9' }] },
        { frames: [{ filename: '100' }] },
      ],
    }
    expect(atlasFrames(atlas)).toEqual(['9', '10', '100'])
  })

  it('falls back (no art) when an atlas fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    )
    expect(await loadSecretArt('19010', technique({ atlas: '/fail/a.json' }))).toBeUndefined()
  })

  it('falls back when the back layer is missing or the timing passes the last frame', async () => {
    const atlas = { textures: [{ frames: names(12).map((filename) => ({ filename })) }] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({ ok: !url.includes('missing'), json: async () => atlas })),
    )
    const t = (extra: Partial<SecretTechnique>) =>
      technique({ atlas: `/ok/${Math.random()}.json`, ...extra })
    expect(
      await loadSecretArt('1', t({ concurrent: { atlas: '/missing.json', pages: [] } })),
    ).toBeUndefined()
    expect(await loadSecretArt('1', t({ damageFrame: 13 }))).toBeUndefined()
    const art = await loadSecretArt('1', t({ concurrent: { atlas: '/ok/b.json', pages: [] } }))
    expect(art?.frames).toHaveLength(12)
    expect(art?.concurrentFrames).toHaveLength(12)
  })
})

describe('overlay placement', () => {
  it('places the defender at its offset and mirrors the attacker around the stage center', () => {
    const art = secret()
    const right = secretOverlay(art, 'defenders', HOME.defenders, STAGE.groundY, STAGE.width)
    const left = secretOverlay(art, 'attackers', HOME.attackers, STAGE.groundY, STAGE.width)
    expect(right.layers[0]).toMatchObject({ x: 700 - 1000, y: 455 - 600, scaleX: 1, front: true })
    expect(left.layers[0]).toMatchObject({ x: 300 + 1000, y: 455 - 600, scaleX: -1 })
    expect(STAGE.width - left.layers[0]!.x).toBe(right.layers[0]!.x)
    // The back layer from the caster (`source`), behind the bodies unless `front`.
    expect(right.layers[1]).toMatchObject({ x: 650, y: 435, scaleX: 1, front: false })
    expect(left.layers[1]).toMatchObject({ x: 350, y: 435, scaleX: -1 })
  })

  it('anchors a stage-origin back layer at the caster side edge', () => {
    const art = secret({ concurrentOrigin: undefined, concurrentOffset: undefined })
    const left = secretOverlay(art, 'attackers', 300, 455, 1000)
    const right = secretOverlay(art, 'defenders', 700, 455, 1000)
    expect(left.layers[1]).toMatchObject({ x: 1000, y: 0, scaleX: -1 })
    expect(right.layers[1]).toMatchObject({ x: 0, y: 0, scaleX: 1 })
  })
})

describe('secret technique timeline', () => {
  const build = (events: FightEvent[], art: SecretArt | null = secret()) =>
    buildTimeline(replayOf(events), {
      art: [undefined, undefined],
      skillMotions: null,
      secretArt: (fighter, skillId) =>
        fighter === 0 && skillId === 19010 ? (art ?? undefined) : undefined,
    })

  it('lands the hit at damageFrame of the atlas (Reborn frame k shows at (k - 1) / fps)', () => {
    const timeline = build([ultimate])
    const start = timeline.poses[0]!.find((p) => p.secret)!.at
    const damage = timeline.texts.find((t) => t.fighter === 1 && t.kind === 'damage')!
    expect(damage.at - start).toBeCloseTo(((10 - 1) / SECRET_FPS) * 1000)
    expect(timeline.bars.find((b) => b.fighter === 1 && b.hp === 40)!.at).toBe(damage.at)
  })

  it('moves the target from motionFrame by the transforms, mirrored by its side', () => {
    const timeline = build([ultimate])
    const start = timeline.poses[0]!.find((p) => p.secret)!.at
    const lock = latestAt(timeline.poses[1]!, start + 3 * SECRET_FRAME_MS + 1)!
    expect(lock.freeze).toBe(true)
    expect(lock.shift?.at).toBeCloseTo(start + 3 * SECRET_FRAME_MS)
    // The target is a defender: Reborn's unflipped side keeps tx as is.
    expect(shiftAt(lock.shift!, lock.shift!.at)).toMatchObject({ dx: 30, dy: 0, visible: true })
    expect(shiftAt(lock.shift!, lock.shift!.at + 2 * SECRET_FRAME_MS)).toMatchObject({
      dx: -20,
      dy: 5,
    })
    expect(shiftAt(lock.shift!, lock.shift!.at + 3 * SECRET_FRAME_MS)).toBeUndefined()
    expect(shiftAt({ ...lock.shift!, sign: -1 }, lock.shift!.at)?.dx).toBe(-30)
  })

  it('keeps the target in its lock pose until the motion ends when death waits for it', () => {
    const timeline = build([ultimate], secret({ holdDeathUntilReaction: true }))
    const motions = timeline.poses[1]!.map((p) => p.motion)
    expect(timeline.poses[1]!.filter((p) => p.freeze)).toHaveLength(1)
    // Lock (hurt) then stand after the 3 transform frames; no extra hurt pose at impact.
    expect(motions.slice(1)).toEqual(['63', '999'])
  })

  it('falls back to the normal strike when the art is missing', () => {
    const timeline = build([ultimate], null)
    expect(timeline.poses[0]!.some((p) => p.secret)).toBe(false)
    expect(timeline.poses[1]!.some((p) => p.shift)).toBe(false)
    expect(timeline.texts.some((t) => t.fighter === 1 && t.text === '-60')).toBe(true)
  })

  it('preloads only the ultimates cast in the replay', () => {
    const normal: FightEvent = { actor: 0, event: 14, target: 1, skillId: 1, damage: 5, hit: true }
    const events = [
      normal,
      ultimate,
      { ...ultimate },
      { ...normal, actor: 1, target: 0, skillId: 1904 },
    ]
    // Fighter 0 wears outfit 1, fighter 1 is a monster.
    const found = replaySecretTechniques(events, (i) => (i === 0 ? 1 : undefined))
    expect([...found.keys()]).toEqual(['19010'])
    expect(secretLayers(build(events)).map((l) => l.texture)).toEqual([
      'reborn-secret-19010',
      'reborn-secret-19010-back',
    ])
    expect(secretLayers(build([normal]))).toEqual([])
  })
})
