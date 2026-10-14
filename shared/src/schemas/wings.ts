// Wings and auras (M6 decisions 22-25): GET /api/game/wings, enhance and the Wing Collection.
import { z } from 'zod'

const itemId = z.string().regex(/^i\d{6}$/)

export const wingRowParamsSchema = z.object({ itemRowId: z.string().uuid() })
export const wingCollectionParamsSchema = z.object({ itemId })
/** Item ids of the stone and of at most one talisman per family. */
export const wingEnhanceBodySchema = z
  .object({
    stone: itemId,
    luck: itemId.optional(),
    safety: itemId.optional(),
    integrity: itemId.optional(),
  })
  .strict()
export type WingEnhanceBody = z.infer<typeof wingEnhanceBodySchema>

export type WingKind = 'wing' | 'aura'
export type WingOutcomeName = 'success' | 'fail' | 'decrease' | 'reset' | 'destroy'
export type TalismanFamily = 'luck' | 'safety' | 'integrity'

export interface WingStat {
  /** Our Bonuses field, for example `hp` or `strength` (x100 internal). */
  field: string
  /** English label, for example "Max HP"; a trailing % marks a percent. */
  label: string
  value: number
}

export interface OwnedWing {
  /** Inventory row id. */
  id: string
  itemId: string
  nameKey: string
  kind: WingKind
  level: number
  equipped: boolean
  stats: WingStat[]
  /** Stats one level up; null at the top level. */
  next: WingStat[] | null
}

export interface WingStone {
  itemId: string
  nameKey: string
  levelJump: number
  count: number
}

export interface WingTalisman {
  itemId: string
  nameKey: string
  family: TalismanFamily
  /** Luck: success bonus %; Safety and Integrity: reduction %. */
  value: number
  count: number
}

export interface WingCollectionEntry {
  itemId: string
  nameKey: string
  kind: WingKind
  /** Plume Shards paid on registering. */
  reward: number
  registered: boolean
  /** In the bag (worn or not), so it can be registered. */
  owned: boolean
}

export interface WingsView {
  maxLevel: number
  equipped: OwnedWing | null
  owned: OwnedWing[]
  stones: WingStone[]
  talismans: WingTalisman[]
  rewardItemId: string
  collection: WingCollectionEntry[]
}

export interface WingEnhanceResult extends WingsView {
  outcome: WingOutcomeName
  /** The new level; null when the wing was destroyed. */
  level: number | null
}

export interface WingCollectionResult extends WingsView {
  reward: number
}
