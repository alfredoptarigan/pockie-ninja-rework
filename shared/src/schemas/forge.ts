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

/** POST /api/game/forge/gems/insert (Reborn's gemInsert): the gear row and the gem row. */
export const gemInsertSchema = z.object({ itemId, gemId: itemId }).strict()
/** POST /api/game/forge/gems/hole (gemCreateHole): the gear row and the Slot Talisman's item id. */
export const gemHoleSchema = z.object({ itemId, talisman: z.string().regex(/^i\d{6}$/) }).strict()
/** POST /api/game/forge/enchant (enchantAttempt): the gear row and the Enchanting Stone row. */
export const enchantSchema = z.object({ itemId, stoneId: itemId }).strict()

export type ForgePayment = z.infer<typeof forgePaymentSchema>
export type GemInsertInput = z.input<typeof gemInsertSchema>
export type GemHoleInput = z.input<typeof gemHoleSchema>
export type EnchantInput = z.input<typeof enchantSchema>
export type ForgePaidInput = z.input<typeof forgePaidSchema>
export type InscribeInput = z.input<typeof inscribeSchema>

/** A rolled identify property with its player property name (IdentifyPropRec). */
export interface GearProp {
  propId: number
  name: string
  value: number
  /** The line's roll range and tier (its level within the property family, as Reborn shows it). */
  min: number
  max: number
  tier: number
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
  /** UseLevel, EquipType ("Weapon", "Hat"...) and, for weapons, the job that can wield it. */
  level: number
  equipType: string
  weaponType?: 'Sharp' | 'Blunt' | 'Fists' | 'Any'
  /** Innate lines (OtherPropName / OtherPropValue): Reborn's SPECIAL ATTRIBUTES. */
  special: { name: string; value: number }[]
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
  /**
   * Gem sockets (HoleCount, JewelItemRec): the socketed gem and the stat it adds, or null for an
   * open socket. Reborn's SOCKETED GEMS.
   */
  sockets: (SocketedGem | null)[]
  /** Most sockets Create Hole can open (MaxHoleCount). */
  maxSockets: number
  /** The Enchanting Stone applied (AddMagicID) and its lines: Reborn's ENCHANTMENTS. */
  enchant?: { itemId: string; nameKey: string; lines: { name: string; value: number }[] }
  appraiseCost: number
  repairCost: number
}

export interface SocketedGem {
  itemId: string
  nameKey: string
  /** The stat (`<Name>Equip`) and value it adds. */
  name: string
  value: number
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
