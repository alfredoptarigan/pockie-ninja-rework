// Reborn bag (Inventory window): 10 tabs of 10x6 tiles; items keep their top-left tile.
import { z } from 'zod'
import type { Character } from './game.js'

export const BAG_PAGE_COUNT = 10
export const BAG_PAGE_COLUMNS = 10
export const BAG_PAGE_ROWS = 6
export const BAG_PAGE_SLOTS = BAG_PAGE_COLUMNS * BAG_PAGE_ROWS

const page = z
  .number()
  .int()
  .min(0)
  .max(BAG_PAGE_COUNT - 1)
const slot = z
  .number()
  .int()
  .min(0)
  .max(BAG_PAGE_SLOTS - 1)
const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length

/** POST /api/game/items/:id/move */
export const bagMoveSchema = z.object({ page, slot }).strict()
/** POST /api/game/items/:id/unequip (optional target tile). */
export const unequipSchema = z
  .object({ page: page.optional(), slot: slot.optional() })
  .strict()
  .refine((body) => (body.page === undefined) === (body.slot === undefined), {
    message: 'Send both page and slot, or neither.',
  })
/** POST /api/game/items/:id/swap */
export const bagSwapSchema = z.object({ targetId: z.uuid() }).strict()
/** POST /api/game/items/:id/split */
export const bagSplitSchema = z.object({ count: z.number().int().min(1).max(10_000) }).strict()
/** POST /api/game/items/:id/use-multiple */
export const useMultipleSchema = z.object({ amount: z.number().int().min(1).max(1000) }).strict()
/** POST /api/game/items/sell (Multi Sell): whole stacks. */
export const bagSellSchema = z
  .object({ inventoryIds: z.array(z.uuid()).min(1).max(600).refine(uniqueIds) })
  .strict()
/** POST /api/game/items/sort (Sort Inventory). */
export const bagSortSchema = z
  .object({ scope: z.enum(['tab', 'all']), page: page.optional(), stack: z.boolean() })
  .strict()
  .refine((body) => body.scope === 'all' || body.page !== undefined, {
    message: 'Choose the tab to sort.',
    path: ['page'],
  })

/** Reborn's equipment sets (loadouts) I-V; IV and V need VIP. */
export const EQUIPMENT_SETS = 5
export const FIRST_VIP_SET = 4
/** POST /api/game/sets/active */
export const activeSetSchema = z
  .object({ set: z.number().int().min(1).max(EQUIPMENT_SETS) })
  .strict()

export type BagMoveInput = z.infer<typeof bagMoveSchema>
export type BagSortInput = z.infer<typeof bagSortSchema>

type Triple = [number, number, number]

/**
 * An outfit's tooltip facts (Reborn's props), each triple Strength, Agility, Stamina in
 * hundredths. A stat at character level L is Reborn's floor(outfitStat(starIsv(isv / 100,
 * stars), starTier(plus, stars), L)), which is also what the server adds to the character.
 */
export interface OutfitInfo {
  clothing: number
  /** Reborn's "+N" (props.level), 0-31. */
  plus: number
  /** Reborn's outfit stars (props.stars), 0-5. */
  stars: number
  /** The weapon class the outfit fights with (Popsinger). */
  weaponType: 'Sharp' | 'Blunt' | 'Fists' | 'Any'
  /** ISV: per-level points of each stat; the recast values when the row was recast. */
  isv: Triple
  /** Reborn's recastMaxIsv: the highest ISV a recast reaches, 1.1 times the outfit's own. */
  maxIsv: Triple
  /** BMV: points of the stat per 1% attack, speed and HP (StrAtkAdd, AgiAtkAdd, MaxHPAdd). */
  bmv: Triple
  /** Reborn's skill imprints: 10000 (Secret Technique) and the element imprint 2000-2092. */
  skills: number[]
}

/** Item table facts the bag window needs (context menu, tooltip, footprint). */
export interface BagItemInfo {
  /** equip = EquipItem or AvatarItem, use = CanUse 1 (not those), other = the rest. */
  kind: 'equip' | 'use' | 'other'
  /** EquipType of an EquipItem; 'Outfit' for an AvatarItem. */
  equipSlot: string | null
  /** UseLevel; an outfit's Reborn requirement (ceil((AvatarLevel - 1) * r / 31)). */
  level: number
  /** AvatarItem only: its clothing, Reborn's "+N" (AvatarLevel) and its tooltip stats. */
  outfit?: OutfitInfo
  /**
   * PetItem only: the species' nature (1 Plant ... 6 Spirits); a pet moved from the Kennel also
   * carries its level and slotted skills (kind 1 Aura, 2 Aid, 3 Passive), like Reborn's props.
   */
  pet?: { nature: number; level?: number; skills?: { skillId: number; kind: number }[] }
  /** Reborn's Synthesis Value (JudgeValueScore) when the item has one. */
  value?: number
  /** Price per item when the shop buys it (CanTrade bit 1), else null. */
  sellPrice: number | null
  /** Largest stack. */
  stack: number
  w: number
  h: number
  class: string
  /** JewelItem: the stat it adds in a socket and the lowest gear level that takes it. */
  gem?: { name: string; value: number; level: number }
  /** MagicItem (Enchanting Stone): its lines, the EquipTypes it fits and the lowest gear level. */
  enchant?: { lines: { name: string; value: number }[]; slots: string[]; level: number }
}

/** One row of GET /api/game/inventory. */
export interface InventoryItemView {
  id: string
  itemId: string
  count: number
  bound: boolean
  equippedSlot: string | null
  /** Equipment set (1-5) the row is worn in; null in the bag. */
  equippedSet: number | null
  nameKey: string
  /** EquipItem only: whether the current outfit may use it. */
  fitsOutfit?: boolean
  /** Bag tab and top-left tile; null while equipped. */
  page: number | null
  slot: number | null
  locked: boolean
  info: BagItemInfo
}

export interface InventoryView {
  items: InventoryItemView[]
}

/** What every bag action returns, so the client updates in one round trip. */
export interface BagActionResult extends InventoryView {
  character: Character
}
