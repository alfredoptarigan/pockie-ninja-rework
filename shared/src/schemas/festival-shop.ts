// Festival Shop (Reborn's Xmas event "Christmas Shop", `christmasShopItems` / `christmasShopBuy`):
// GET /api/game/festival-shop and POST /api/game/festival-shop/buy.
import { z } from 'zod'
import type { BagItemInfo } from './bag.js'
import type { Character } from './game.js'

export const festivalShopBuySchema = z.object({ index: z.number().int().min(0).max(999) }).strict()
export type FestivalShopBuyInput = z.input<typeof festivalShopBuySchema>

export interface FestivalOfferView {
  /** Position in the catalogue: what the buy takes (Reborn's `itemIndex`). */
  index: number
  itemId: string
  info: BagItemInfo
  amount: number
  /** Festival Tokens. */
  cost: number
  limit: number
  purchased: number
}

export interface FestivalShopView {
  tokens: number
  offers: FestivalOfferView[]
}

export interface FestivalShopBuyResult {
  shop: FestivalShopView
  character: Character
}
