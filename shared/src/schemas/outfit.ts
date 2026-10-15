// Outfits as items: Manage Outfit (Visual Outfit) and the Wardrobe (reborn-windows-M-Z-hud.md).
import { z } from 'zod'
import type { BagActionResult, InventoryItemView } from './bag.js'

/** Reborn's Wardrobe: 4 pages of 5 slots. */
export const WARDROBE_PAGES = 4
export const WARDROBE_PAGE_SLOTS = 5
export const WARDROBE_SLOTS = WARDROBE_PAGES * WARDROBE_PAGE_SLOTS
/** Manage Outfit: setting a Visual Outfit costs this much gold; removing it is free. */
export const VISUAL_OUTFIT_GOLD = 250

const wardrobeSlot = z
  .number()
  .int()
  .min(0)
  .max(WARDROBE_SLOTS - 1)

/** POST /api/game/outfit/visual */
export const visualOutfitSchema = z.object({ inventoryId: z.uuid() }).strict()
/** POST /api/game/wardrobe/store (Reborn's moveItemToWardrobe). */
export const wardrobeStoreSchema = z.object({ inventoryId: z.uuid(), slot: wardrobeSlot }).strict()
/** POST /api/game/wardrobe/take (Reborn's moveItemFromWardrobe / clearWardrobe). */
export const wardrobeTakeSchema = z.object({ slot: wardrobeSlot }).strict()

/** An outfit stored in the Wardrobe. */
export interface WardrobeItemView extends InventoryItemView {
  wardrobeSlot: number
}

/** GET /api/game/wardrobe */
export interface WardrobeView {
  items: WardrobeItemView[]
}

/** What the Wardrobe actions return: the character, the bag and the Wardrobe. */
export interface WardrobeActionResult extends BagActionResult {
  wardrobe: WardrobeItemView[]
}
