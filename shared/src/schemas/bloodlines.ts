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
  /** Lowest pub-fight scene level that drops the item (Reborn's "Drops: SM LvN+"); null if none. */
  dropLevel: number | null
  itemsHeld: number
  amity: number
  amityNeeded: number
  unlocked: boolean
  active: boolean
  /**
   * Its active slot (0-2), null when inactive. Reborn's `bloodlines.active` is this 3-slot array;
   * slot 0's limit draws its rotating background behind the Inventory pose.
   */
  activeSlot: number | null
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

// Souls and prayer (M5 decisions 15, 16): GET /api/game/bloodlines/souls and its actions. Every
// action answers with the updated SoulsView.
const SOUL_BATCH_MAX = 250
const soulIds = z.array(z.uuid()).min(1).max(SOUL_BATCH_MAX)

export const soulParamsSchema = z.object({ soulId: z.uuid() })
export const soulDiscoverBodySchema = z.object({ count: z.number().int().min(1).max(30) }).strict()
export const soulIdsBodySchema = z.object({ soulIds: soulIds }).strict()
export const soulBindBodySchema = z.object({ limitId: z.number().int().min(1).max(44) }).strict()
export const soulRefineBodySchema = z.object({ targetId: z.uuid(), fuelIds: soulIds }).strict()
export const prayerBodySchema = z
  .object({ attribute: z.number().int().min(1).max(3), soulIds: soulIds })
  .strict()

export interface SoulView {
  id: string
  type: number
  level: number
  /** Limit the soul is socketed in; null when loose. */
  limitId: number | null
  socket: number | null
}

export interface PrayerView {
  limitId: number
  /** 1 Strength, 2 Agility, 3 Stamina. */
  attribute: number
  level: number
  progress: number
  /** Points to the next level; 0 at the max level. */
  needed: number
}

export interface SoulType {
  id: number
  nameKey: string
  field: string
  label: string
  /** Value by soul level (index 0 is unused). */
  valueByLevel: number[]
}

export interface SoulsView {
  souls: SoulView[]
  inventory: number
  socketsPerLimit: number
  discoveredToday: number
  discoverPerDay: number
  /** Character level needed for soul level n at index n - 1. */
  levelLimits: number[]
  types: SoulType[]
  prayers: PrayerView[]
  prayerMaxLevel: number
  /** Points one soul of level n gives at index n - 1. */
  prayerPoints: number[]
  /** Start of the next UTC day, when discoveries reset. */
  resetAt: string
}
