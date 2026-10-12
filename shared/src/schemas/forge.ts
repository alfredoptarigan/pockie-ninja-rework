import { z } from 'zod'

/** One bag page of the inventory window (btn_Identify sums the page). */
export const FORGE_PAGE_SIZE = 15
/** LowSealMaxNum / HighSealMaxNum on every EquipInscribe.ini row. */
export const INSCRIBE_MAX_SEALS = 3

const itemId = z.uuid()

/** How Enhance and Refine are paid (ConsolidateSystem / IdentifySystem mode 1 or 2). */
export const forgePaymentSchema = z.enum(['gold', 'giftCoupon', 'talisman'])

/** POST /api/game/forge/appraise and /repair: the inventory row. */
export const forgeItemSchema = z.object({ itemId }).strict()
/** POST /api/game/forge/enhance and /refine. */
export const forgePaidSchema = z.object({ itemId, payment: forgePaymentSchema }).strict()
/** POST /api/game/forge/appraise-all: the bag page shown. */
export const appraiseAllSchema = z
  .object({ itemIds: z.array(itemId).min(1).max(FORGE_PAGE_SIZE) })
  .strict()
/** POST /api/game/forge/inscribe (InscribeSystem custom 681 `[sealType, n]`). */
export const inscribeSchema = z
  .object({
    itemId,
    seal: z.enum(['low', 'high']),
    seals: z.number().int().min(0).max(INSCRIBE_MAX_SEALS).default(0),
  })
  .strict()

export type ForgePayment = z.infer<typeof forgePaymentSchema>
export type ForgePaidInput = z.input<typeof forgePaidSchema>
export type InscribeInput = z.input<typeof inscribeSchema>

/** A rolled identify property with its player property name (IdentifyPropRec). */
export interface GearProp {
  propId: number
  name: string
  value: number
}

/**
 * Per-item forge state of an equipment row (GET /api/game/inventory `gear`): what the tooltip,
 * the bag actions and the forge window show. Costs are in Stone.
 */
export interface GearView {
  /** 1 weapon, 2 armour, 3 ring or amulet. */
  baseType: number
  enhanceLevel: number
  enhanceMax: number
  inscribeLevel: number
  durability: number
  maxDurability: number
  /** Can be worn, enhanced and refined (IsEquipIdentifyed). */
  appraised: boolean
  identifyCount: number
  props: GearProp[]
  /** Attack and defence with the enhance level applied. */
  attack: { min: number; max: number }
  defense: number
  /** Flat max HP from armour enhancement. */
  maxHp: number
  /** InscribeRec rows of the current inscription level. */
  inscription: { name: string; value: number }[]
  /** The item's set (SuitID): pieces in it, active pieces worn and its stacked bonuses. */
  set?: {
    id: number
    pieces: number
    worn: number
    bonuses: { pieces: number; name: string; value: number }[]
  }
  appraiseCost: number
  repairCost: number
}

/** Forge tables the window needs (GET /api/game/forge). */
export interface ForgeInfo {
  enhanceCost: number
  refineCost: number
  /** Shown success rate per target level 1-12 (`100 - FailRate`). */
  enhanceRates: Record<string, number>
  inscribeLevels: Record<
    string,
    { BaseOdds: number; FailLevel: number; AddLevel: number; StoneCost: number }
  >
  sealOdds: { low: number; high: number }
  /** Talismans and seals in the bag. */
  talismans: { enhance: number; refine: number; lowSeal: number; highSeal: number }
}
