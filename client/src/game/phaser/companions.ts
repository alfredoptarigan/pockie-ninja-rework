// Replay-local Reborn assets. Merely importing a manifest never loads a texture.
import petsJson from '../../generated/reborn-pets.json'
import wingsJson from '../../generated/reborn-wings.json'
import aurasJson from '../../generated/reborn-auras.json'
import type { Replay, FightEvent } from '../types'

export interface AtlasAsset {
  atlas?: string
  icon?: string
  offset?: [number, number]
  animations?: Record<string, [number, number]>
  motionEvents?: Record<string, { frames: number; impactFrame: number }>
  anchor?: [number, number]
  fps?: number
}
export interface CompanionLook {
  pet?: { avatar: number; species: string }
  wingSprite?: string
  wing?: string
  aura?: string
}
export type VisualReplay = Omit<Replay, 'fighters' | 'events'> & {
  fighters: (Replay['fighters'][number] & CompanionLook & { look?: CompanionLook })[]
  events: (FightEvent & { isPet?: boolean })[]
}
const pets = petsJson as unknown as Record<string, AtlasAsset>
const wings = wingsJson as unknown as Record<string, AtlasAsset>
const auras = aurasJson as unknown as Record<string, AtlasAsset>
export const petAsset = (avatar: number | undefined) =>
  avatar === undefined ? undefined : pets[String(avatar)]
export const wingAsset = (key: string | undefined) => (key ? wings[key] : undefined)
export const auraAsset = (key: string | undefined) => (key ? auras[key] : undefined)
export const visualLook = (
  fighter: VisualReplay['fighters'][number],
  look?: CompanionLook,
): CompanionLook => ({
  ...look,
  ...fighter.look,
  pet: fighter.pet ?? fighter.look?.pet ?? look?.pet,
  wingSprite:
    fighter.wingSprite ??
    fighter.look?.wingSprite ??
    fighter.wing ??
    fighter.look?.wing ??
    look?.wingSprite ??
    look?.wing,
  aura: fighter.aura ?? fighter.look?.aura ?? look?.aura,
})
export const PET_FRAME_MS = 1000 / (12 * 1.4)
export const petAttackMotion = (asset: AtlasAsset | undefined) =>
  asset?.motionEvents?.['17'] ? '17' : '52'
export function petTiming(avatar: number | undefined) {
  const asset = petAsset(avatar)
  const motion = petAttackMotion(asset)
  const timing = asset?.motionEvents?.[motion]
  return {
    motion,
    impact: Math.max(0, (timing?.impactFrame ?? 6) - 1) * PET_FRAME_MS,
    duration: (timing?.frames ?? 12) * PET_FRAME_MS,
  }
}
/** Reborn art faces left; the attacker is mirrored. */
export const artSign = (side: 'attackers' | 'defenders') => (side === 'attackers' ? -1 : 1)
/** The original's pets stand at (160, 505) and (840, 505): 140 px behind and 50 px below their fighter. */
export const petX = (x: number, side: 'attackers' | 'defenders') => x + 140 * artSign(side)
export const PET_DY = 50
export function layerPosition(
  x: number,
  y: number,
  side: 'attackers' | 'defenders',
  offset: [number, number] = [0, 0],
) {
  return { x: x + offset[0] * artSign(side), y: y + offset[1], scaleX: artSign(side) }
}
