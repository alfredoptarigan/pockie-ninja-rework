// Reborn's Portable Function (Inventory "Compose"): Synthesis, Recast and Impress requests and
// views (/api/game/portable-function/*). Inscribe stays under /api/game/forge.
import { z } from 'zod'
import type { BagItemInfo } from './bag.js'

const rowId = z.uuid()

/** Reborn's Recast tab: 0, 1 or 2 locked stats cost 1, 5 or 15 Recast Talismans. */
export const RECAST_TALISMAN_COSTS = [1, 5, 15] as const
export const RECAST_MAX_LOCKS = 2
/** Strength, Agility, Stamina: the order of every ISV triple. */
export const ISV_STATS = ['Strength', 'Agility', 'Stamina'] as const

/** POST /synthesis/preview and /synthesis: the Main Item and the two Catalyst rows. */
export const synthesisSchema = z
  .object({ mainId: rowId, catalystIds: z.tuple([rowId, rowId]) })
  .strict()
/** POST /recast: the outfit row and the stats (0-2) kept as they are. */
export const recastSchema = z
  .object({
    itemId: rowId,
    locked: z
      .array(z.number().int().min(0).max(2))
      .max(RECAST_MAX_LOCKS)
      .refine((stats) => new Set(stats).size === stats.length, 'Lock each stat once.'),
  })
  .strict()
/** POST /impress/preview and /impress: the gear, the Blade and the optional Crystals rows. */
export const impressSchema = z
  .object({ itemId: rowId, bladeId: rowId, crystalId: rowId.optional() })
  .strict()

export type SynthesisInput = z.input<typeof synthesisSchema>
export type RecastInput = z.input<typeof recastSchema>
export type ImpressInput = z.input<typeof impressSchema>

/** What the Synthesis slots make; a refusal comes back as a 400 with its reason. */
export interface SynthesisPreview {
  /** A recipe (its result shown) or a random item (consult the Synthesis Value). */
  kind: 'recipe' | 'random'
  resultItemId: string | null
  resultNameKey: string | null
  /** The recipe result's item facts (an outfit's look and +N), for its cell. */
  resultInfo: BagItemInfo | null
  /** Success chance in percent. */
  rate: number
  /** Random gear: the result's Synthesis Value range and the stat lines it gives. */
  value?: { min: number; max: number; lines: [number, number] }
}

/** An outfit's Individual Stat Values (per-level Up, Strength / Agility / Stamina). */
export interface RecastInfo {
  isv: [number, number, number]
  base: [number, number, number]
  max: [number, number, number]
  /** Recast Talismans in the bag. */
  talismans: number
  /** Whether a free stat can still change. */
  canRecast: boolean
}

export interface ImpressPreview {
  /** Success chance in percent, crystals included. */
  rate: number
  /** Crystals the attempt uses up. */
  crystalsUsed: number
}
