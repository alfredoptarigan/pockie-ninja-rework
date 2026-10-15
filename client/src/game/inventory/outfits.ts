// Outfits as items (Reborn's Outfit slot): names "<outfit> +N", icons by clothing, the worn outfit
// and the clothing to draw (the Visual Outfit when one is set).
import type { Character } from '@pockie/shared'
import { outfitName, plainText } from '../text'
import type { InventoryItem } from '../types'

export const outfitIcon = (clothing: number) =>
  `/assets/reborn/icons/items/avatars/${clothing}.webp`

/** An item's display name; outfits read "<name> +N" like Reborn's. */
export const itemName = (item: InventoryItem, fallback = 'Unknown item') =>
  item.info?.outfit
    ? `${outfitName(item.info.outfit.clothing)} +${item.info.outfit.plus}`
    : plainText(item.nameKey, fallback)

/** The outfit worn in `activeSet`, else set I's (Reborn's fallback). */
export const wornOutfit = (items: InventoryItem[], activeSet = 1) => {
  const outfits = items.filter((item) => item.equippedSlot === 'Outfit')
  const inSet = (set: number) => outfits.find((item) => (item.equippedSet ?? 1) === set)
  return inSet(activeSet) ?? inSet(1)
}

/** The clothing a ninja is drawn in: the Visual Outfit, else the worn one. */
export const lookOf = (character: Pick<Character, 'clothing' | 'visualClothing'>) =>
  character.visualClothing ?? character.clothing
