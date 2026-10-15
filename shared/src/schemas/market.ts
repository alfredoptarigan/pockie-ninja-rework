// Market API (docs/original-data/trade-market.md). Rules live in game-core/src/economy/market.ts.
import { z } from 'zod'
import type { BagItemInfo } from './bag.js'
import type { GearView } from './forge.js'

const MAX_PRICE = 1_000_000
const price = z.number().int().min(1).max(MAX_PRICE).nullable().default(null)

export const marketListSchema = z
  .object({
    inventoryId: z.uuid(),
    count: z.number().int().min(1).max(10_000),
    priceStone: price,
    priceGold: price,
    hours: z.union([z.literal(8), z.literal(12), z.literal(24)]),
  })
  .strict()
  .refine((input) => input.priceStone !== null || input.priceGold !== null, {
    message: 'Set a Stone or a Gold price.',
    path: ['priceStone'],
  })

export const marketBuySchema = z
  .object({ listingId: z.uuid(), count: z.number().int().min(1).max(10_000) })
  .strict()
export const marketCancelSchema = z.object({ listingId: z.uuid() }).strict()
/** Without `inventoryId` every warehouse row that fits in the bag is claimed. */
export const marketClaimItemSchema = z.object({ inventoryId: z.uuid().optional() }).strict()
export const marketClaimWalletSchema = z.object({}).strict()

export type MarketListInput = z.input<typeof marketListSchema>
export type MarketBuyInput = z.infer<typeof marketBuySchema>

/** Instance state of a listed or warehoused item (kept from the seller's row). */
export interface MarketItem {
  inventoryId: string
  itemId: string
  count: number
  bound: boolean
  enhanceLevel: number
  identifyCount: number
  props: { propId: number; value: number }[]
  /** Item table facts (type, level) for the board filters and the tooltip. */
  info: BagItemInfo
  /** Equipment only: what the tooltip shows of the gear. */
  gear?: GearView
}

export interface MarketListing extends MarketItem {
  id: string
  sellerName: string
  /** Per-unit prices; null = not offered in that currency. The buyer pays every price set. */
  priceStone: number | null
  priceGold: number | null
  expiresAt: string
  mine: boolean
}

/** Every live listing; the client groups, filters and sorts them (Reborn's Market tab). */
export interface MarketBoardView {
  listings: MarketListing[]
}

/** One completed buy (an audit row): totals the buyer paid and the tax kept from the seller. */
export interface MarketSale {
  id: string
  itemId: string
  count: number
  stone: number
  gold: number
  taxStone: number
  taxGold: number
  at: string
  info: BagItemInfo
}

/** Reborn's Recent tab: the last sales on the whole Market. */
export interface MarketRecentView {
  sales: MarketSale[]
}

/** Reborn's History tab: the caller's sales and purchases, newest first. */
export interface MarketHistoryView {
  sales: MarketSale[]
  purchases: MarketSale[]
}

export interface MarketOwnListing extends MarketListing {
  hours: number
  fee: number
  expired: boolean
}

export interface MarketSellable extends MarketItem {
  category: string
}

export interface MarketMineView {
  listings: MarketOwnListing[]
  maxListings: number
  /** Listing fee in Stone per duration (8, 12, 24 h) at the ninja's level. */
  fees: Record<'8' | '12' | '24', number>
  sellable: MarketSellable[]
}

export interface MarketWarehouseRow extends MarketItem {
  /** 0 bought, 1 own listing returned (expired or taken down). */
  source: 0 | 1
  createdAt: string
}

export interface MarketWarehouseView {
  items: MarketWarehouseRow[]
  capacity: number
  wallet: { stone: number; gold: number }
}

/**
 * System mail templates (category 'market', sendSystemMail). Amounts are totals for the sale;
 * `stone`/`gold` in a sold mail are the seller's payout after the 10% tax.
 * - market_sold:     { buyer, itemId, count, left, stone, gold } (part of a listing sold)
 * - market_sold_out: { buyer, itemId, count, stone, gold } (the last units sold)
 * - market_bought:   { seller, itemId, count, stone, gold } (paid by the buyer; item in warehouse)
 * - market_expired:  { itemId, count } (unsold units back in the seller's warehouse)
 */
export const MARKET_MAIL = {
  sold: 'market_sold',
  soldOut: 'market_sold_out',
  bought: 'market_bought',
  expired: 'market_expired',
} as const
