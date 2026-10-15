// Ninja Mall (Reborn chunk 185 `Mall`, reborn-lazy-features.md "Ninja Mall"): GET /api/game/mall
// and POST /api/game/mall/buy.
import { z } from 'zod'
import type { BagItemInfo } from './bag.js'
import type { Character } from './game.js'

/** Reborn's tab keys, in its order (the 2011 supershoptab tabs). */
export const MALL_GROUPS = ['hot', 'food', 'gem', 'pet', 'vip', 'other'] as const
export type MallGroupKey = (typeof MALL_GROUPS)[number]
export const MALL_GROUP_LABELS: Record<MallGroupKey, string> = {
  hot: 'Hot',
  food: 'Food',
  gem: 'Gem',
  pet: 'Pet',
  vip: 'VIP',
  other: 'Other',
}

export const MALL_CURRENCIES = ['gold', 'coupons'] as const
export type MallCurrency = (typeof MALL_CURRENCIES)[number]

/** The 2011 buy window took up to 8 digits; we cap one purchase at 99 units. */
export const MALL_MAX_QUANTITY = 99

export const mallBuySchema = z
  .object({
    index: z.number().int().min(0).max(9999),
    quantity: z.number().int().min(1).max(MALL_MAX_QUANTITY),
    currency: z.enum(MALL_CURRENCIES),
  })
  .strict()
export type MallBuyInput = z.input<typeof mallBuySchema>

export interface MallItemView {
  /** Position in the catalogue: what mallBuy takes. */
  index: number
  itemId: string
  info: BagItemInfo
  price: number
  currency: MallCurrency
  /** Rows Reborn sells for a second currency (2011 PayType 3: Gold or Gift Certificates). */
  altCurrency?: MallCurrency
  altPrice?: number
  dailyLimit?: number
  purchasedToday?: number
}

export interface MallGroup {
  key: MallGroupKey
  label: string
  items: MallItemView[]
}

export interface MallView {
  groups: MallGroup[]
  /** When daily limits reset (next 00:00 UTC). */
  resetAt: string
}

export interface MallBuyResult {
  mall: MallView
  character: Character
}
