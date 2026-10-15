// Reborn's ninjutsu effect sprites (tools/assets/reborn-skill-effects.ts): every ninjutsu plays its
// own atlas next to the caster's motion. The sprite's top-left sits at the caster (the target with
// onTarget, the stage corner with global) plus `offset` scaled by the caster's facing; the outcome
// lands on frame `attackFrame` (1-based), else when the effect ends. `next` chains another effect
// and `spawns` start one at a frame. With `move` the caster first walks 330 px in 9 frames.
import effectsJson from '../../generated/reborn-skill-effects.json'
import { SECRET_FRAME_MS } from './secret-technique'

export interface SkillEffect {
  name: string
  offset: [number, number]
  attackFrame?: number
  spawns?: { frame: number; skill: number }[]
  depth?: 'behind' | 'character' | 'front'
  move?: boolean
  onTarget?: boolean
  global?: boolean
  onPet?: boolean
  jutsu?: boolean
  next?: number
  characterAnimation?: string
  targetAnimation?: string
  atlas?: string
  pages?: string[]
  frames?: string[]
}

type Playable = SkillEffect & { atlas: string; frames: string[] }

const effects = effectsJson as unknown as Record<string, SkillEffect>

/** Same rate as the secret techniques: 12 x 1.4 fps. */
export const EFFECT_FRAME_MS = SECRET_FRAME_MS
/** Reborn's move_motion: 9 frames, 330 px toward the opponent. */
export const MOVE_MS = 9 * EFFECT_FRAME_MS
export const MOVE_DISTANCE = 330
/** The shared hand-seal effect of `jutsu` skills. */
export const JUTSU_EFFECT = 9999
/** Played from other art: the avatar's own attack frames and its ultimate. */
const OWN_ART = new Set([1, 2, 10000])

/** An effect with its own atlas (not the pet's or the avatar's art). */
export function skillEffect(skillId: number | undefined): Playable | undefined {
  if (skillId === undefined || OWN_ART.has(skillId)) return undefined
  const effect = effects[String(skillId)]
  return effect?.atlas && effect.frames?.length && !effect.onPet ? (effect as Playable) : undefined
}

/** One effect sprite on the stage, sampled by the battle clock. */
export interface EffectPlay {
  at: number
  atlas: string
  frames: string[]
  /** Top-left of the (untrimmed) frame. */
  x: number
  y: number
  /** -1: mirrored (Reborn's offense side, our attackers). */
  scaleX: number
  behind: boolean
}

/** Frame index shown `elapsed` ms after the effect started (undefined once it is over). */
export function effectFrameAt(effect: Pick<EffectPlay, 'frames'>, elapsed: number) {
  if (elapsed < 0) return undefined
  const index = Math.floor(elapsed / EFFECT_FRAME_MS + 1e-9)
  return index < effect.frames.length ? index : undefined
}

export const effectMs = (effect: Pick<Playable, 'frames'>) => effect.frames.length * EFFECT_FRAME_MS
