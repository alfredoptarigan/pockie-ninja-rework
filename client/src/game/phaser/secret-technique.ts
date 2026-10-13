// Reborn's secret technique (outfit ultimate) art, played over the stage instead of the caster's
// body. Rules copied from Reborn's main.js (SkillFactory SECRET_TECHNIQUE and its target motion):
// the caster hides, the atlas plays at `offset` from the caster scaled by its facing, the hit
// lands on frame `damageFrame`, and from `motionFrame` the target holds its hurt pose while the
// per-frame `transforms` move it. Reborn's offense side (our attackers) is the mirrored one.
import techniquesJson from '../../generated/reborn-secret-techniques.json'
import { fetchJsonOnce } from './motion'

type Matrix = [number, number, number, number, number, number]

/** One entry of reborn-secret-techniques.json (keyed by skill id). */
export interface SecretTechnique {
  clothing: number
  /** 1-based atlas frame on which the damage lands. */
  damageFrame: number
  /** 1-based frame on which the target starts its reaction; -1: no target motion. */
  motionFrame: number
  offset: [number, number]
  /** Target transforms [a, b, c, d, tx, ty] by frame, counted from `motionFrame`. */
  transforms: Record<string, Matrix> | []
  atlas: string
  pages: string[]
  concurrent?: { atlas: string; pages: string[] }
  concurrentOffset?: [number, number]
  /** `source`: placed at the caster; otherwise at the caster's stage edge. */
  concurrentOrigin?: 'source'
  concurrentDepth?: 'front'
  targetAnimation?: string
  /** Target visibility by frame, counted like `transforms`. */
  targetVisibility?: Record<string, boolean>
  holdDeathUntilReaction?: boolean
}

const techniques = techniquesJson as unknown as Record<string, SecretTechnique>

/** Reborn plays these at its battle frame rate, 12 x 1.4 (non-VIP). */
export const SECRET_FPS = 12 * 1.4
export const SECRET_FRAME_MS = 1000 / SECRET_FPS
/** Frames fully shown after `elapsed` ms (tolerates float error at frame boundaries). */
const framesIn = (elapsed: number) => Math.floor(elapsed / SECRET_FRAME_MS + 1e-9)

/**
 * The art of an ultimate cast by an outfit: 19xx/22xx plays the outfit's `secret_technique`, the
 * new ultimate (id x 10) its `secret_technique-ru-<id>-v1` with the `-back` layer. Other skills,
 * other outfits and monsters (no clothing) have none.
 */
export function resolveSecretTechnique(clothing: number | undefined, skillId: number | undefined) {
  if (clothing === undefined || skillId === undefined) return undefined
  const key = String(skillId)
  const technique = Object.hasOwn(techniques, key) ? techniques[key] : undefined
  return technique?.clothing === clothing ? { key, technique } : undefined
}

/** A technique whose atlases loaded, with its frame names in play order. */
export interface SecretArt {
  key: string
  technique: SecretTechnique
  frames: string[]
  concurrentFrames?: string[]
}

interface AtlasJson {
  textures?: { frames?: { filename: string }[] }[]
}

/** Frame names sorted numerically, as Reborn builds the animation. */
export function atlasFrames(atlas: AtlasJson) {
  return (atlas.textures ?? [])
    .flatMap((page) => page.frames ?? [])
    .map((f) => f.filename)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/**
 * Fetches a technique's atlases. Like Reborn, a missing or empty atlas (or a layer) or timing past
 * the last frame means no art: the strike falls back to the normal motion.
 */
export async function loadSecretArt(key: string, technique: SecretTechnique) {
  const [main, back] = await Promise.all([
    fetchJsonOnce<AtlasJson>(technique.atlas),
    technique.concurrent ? fetchJsonOnce<AtlasJson>(technique.concurrent.atlas) : undefined,
  ])
  const frames = main ? atlasFrames(main) : []
  const concurrentFrames = back ? atlasFrames(back) : undefined
  if (frames.length === 0) return undefined
  if (technique.concurrent && !concurrentFrames?.length) return undefined
  if (technique.damageFrame > frames.length || technique.motionFrame > frames.length)
    return undefined
  return { key, technique, frames, concurrentFrames } satisfies SecretArt
}

/** Distinct ultimates cast in a replay by fighters with secret-technique art. */
export function replaySecretTechniques(
  events: { actor: number; skillId?: number }[],
  clothingOf: (fighter: number) => number | undefined,
) {
  const found = new Map<string, SecretTechnique>()
  for (const ev of events) {
    const resolved = resolveSecretTechnique(clothingOf(ev.actor), ev.skillId)
    if (resolved) found.set(resolved.key, resolved.technique)
  }
  return found
}

/** A sprite layer of the overlay: atlas texture, stage spot, scaleX (-1 mirrors), frames. */
export interface OverlayLayer {
  texture: string
  atlas: string
  x: number
  y: number
  scaleX: number
  frames: string[]
  front: boolean
}

export interface SecretOverlay {
  layers: OverlayLayer[]
}

/** Reborn's facing sign: its offense (our attackers, left) is flipped. */
export const rebornSign = (side: 'attackers' | 'defenders') => (side === 'attackers' ? -1 : 1)

/** Where the layers go for a caster standing at (x, y) on `side`. */
export function secretOverlay(
  art: SecretArt,
  side: 'attackers' | 'defenders',
  x: number,
  y: number,
  stageWidth: number,
): SecretOverlay {
  const { technique } = art
  const sign = rebornSign(side)
  const layers: OverlayLayer[] = [
    {
      texture: `reborn-secret-${art.key}`,
      atlas: technique.atlas,
      x: x + technique.offset[0] * sign,
      y: y + technique.offset[1],
      scaleX: sign,
      frames: art.frames,
      front: true,
    },
  ]
  if (technique.concurrent && art.concurrentFrames) {
    // ponytail: Reborn falls back to the avatar's animation offset when concurrentOffset is
    // absent; the manifest does not carry it yet, so those layers sit at [0, 0].
    const [dx, dy] = technique.concurrentOffset ?? [0, 0]
    const source = technique.concurrentOrigin === 'source'
    const originX = source ? x : side === 'attackers' ? stageWidth : 0
    const scaleX = source ? sign : side === 'attackers' ? -1 : 1
    layers.push({
      texture: `reborn-secret-${art.key}-back`,
      atlas: technique.concurrent.atlas,
      x: originX + dx * scaleX,
      y: (source ? y : 0) + dy,
      scaleX,
      frames: art.concurrentFrames,
      front: technique.concurrentDepth === 'front',
    })
  }
  return { layers }
}

/** Frame of a layer at `elapsed` ms, or undefined once it has played. */
export function overlayFrame(layer: OverlayLayer, elapsed: number) {
  if (elapsed < 0) return undefined
  return layer.frames[framesIn(elapsed)]
}

/** The target's motion from `motionFrame`: transforms and visibility by relative frame. */
export interface TargetShift {
  at: number
  transforms: Record<string, Matrix>
  visibility?: Record<string, boolean>
  sign: number
  frames: number
}

/** Offset, rotation and visibility of a shifted target at time t (undefined: not moving). */
export function shiftAt(shift: TargetShift, t: number) {
  const frame = framesIn(t - shift.at) + 1
  if (frame < 1 || frame > shift.frames) return undefined
  const latest = <T>(byFrame: Record<string, T> | undefined) => {
    let found: T | undefined
    let best = 0
    for (const [k, v] of Object.entries(byFrame ?? {})) {
      const n = Number(k)
      if (n <= frame && n > best) {
        best = n
        found = v
      }
    }
    return found
  }
  const m = latest(shift.transforms)
  // ponytail: Reborn skews the body quad by the full matrix; a sprite only takes its rotation.
  return {
    dx: m ? m[4] * shift.sign : 0,
    dy: m ? m[5] : 0,
    rotation: m ? Math.atan2(m[1], m[0]) : 0,
    visible: latest(shift.visibility) ?? true,
  }
}

/** Number of transform frames (the last key), 0 when there are none. */
export const shiftFrames = (technique: SecretTechnique) =>
  Math.max(0, ...Object.keys(technique.transforms).map(Number))
