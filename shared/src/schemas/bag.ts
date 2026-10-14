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

export type BagMoveInput = z.infer<typeof bagMoveSchema>
export type BagSortInput = z.infer<typeof bagSortSchema>

/** Item table facts the bag window needs (context menu, tooltip, footprint). */
export interface BagItemInfo {
  /** equip = EquipItem, use = CanUse 1 (not EquipItem/AvatarItem), other = the rest. */
  kind: 'equip' | 'use' | 'other'
  /** EquipType of an EquipItem. */
  equipSlot: string | null
  /** UseLevel. */
  level: number
  /** Price per item when the shop buys it (CanTrade bit 1), else null. */
  sellPrice: number | null
  /** Largest stack. */
  stack: number
  w: number
  h: number
  class: string
}

/** One row of GET /api/game/inventory. */
export interface InventoryItemView {
  id: string
  itemId: string
  count: number
  bound: boolean
  equippedSlot: string | null
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
