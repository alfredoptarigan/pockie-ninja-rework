// Bloodline limits (M5 decisions 11-14): GET /api/game/bloodlines and its two actions.
import { z } from 'zod'
import type { Character } from './game.js'

export const bloodlineParamsSchema = z.object({ id: z.coerce.number().int().min(1).max(44) })
export const bloodlineActiveBodySchema = z.object({ active: z.boolean() })

export interface BloodlineStat {
  /** Our Bonuses field, for example `strength` (x100 internal) or `skillAdd3`. */
  field: string
  /** Reborn's label for the stat. */
  label: string
  value: number
}

export interface BloodlineLimit {
  limitId: number
  nameKey: string
  npcId: number
  npcNameKey: string
  requiredLevel: number
  /** The item handed in at the Ninja House, for example "i148023". */
  unlockItem: string
  itemsHeld: number
  amity: number
  amityNeeded: number
  unlocked: boolean
  active: boolean
  /** Base Str/Agi/Sta (x100 internal) followed by the three bonus stats. */
  stats: BloodlineStat[]
}

export interface BloodlinesView {
  turnInsUsed: number
  turnInsPerDay: number
  itemsPerTurnIn: number
  amityPerTurnIn: number
  maxActive: number
  /** Start of the next UTC day, when turn-ins reset. */
  resetAt: string
  /** Sum of the active limits (with souls and prayer), in Bonuses terms. */
  bonuses: BloodlineStat[]
  limits: BloodlineLimit[]
}

export interface BloodlineTurnInResult extends BloodlinesView {
  character: Character
}
