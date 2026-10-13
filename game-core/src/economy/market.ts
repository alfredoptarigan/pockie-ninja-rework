// Market rules (docs/original-data/trade-market.md, MartSystem + MartServer; M4 decision 8).
// Pure functions: the server checks them inside its transactions.

/** GameDefine.UseMart_LevelLimit: the Market opens at level 25. */
export const MARKET_LEVEL = 25
/** Active listings per ninja (MartSystem 166). */
export const MARKET_MAX_LISTINGS = 5
/** MartDepotRec rows checked before a buy or a take-down adds one. */
export const MARKET_WAREHOUSE_ROWS = 15
/** Listing durations offered by UI_MartSellSet. */
export const MARKET_HOURS = [8, 12, 24] as const
export type MarketHours = (typeof MARKET_HOURS)[number]
/** Per-unit price limit in each currency (Mart_Sysinfo_013). */
export const MARKET_MAX_UNIT_PRICE = 1_000_000
/** CapitalSystem cap per currency. */
export const CURRENCY_CAP = 100_000_000
/** Browse page size (MarcketBuyShowPage). */
export const MARKET_PAGE_SIZE = 8

/** `floor((12.5 + 0.25 × level) × hours)` Stone, in integer math: (50 + level) × hours / 4. */
export const listingFee = (level: number, hours: number) => Math.floor(((50 + level) * hours) / 4)

/** What the seller's wallet gets for `total` in one currency: 90%, at least 1 when charged. */
export const sellerPayout = (total: number) =>
  total > 0 ? Math.max(1, Math.floor((total * 9) / 10)) : 0

/** How much of the wallet a claim moves: up to the currency cap, the rest stays (fixes M12). */
export const claimableWallet = (balance: number, wallet: number) =>
  Math.max(0, Math.min(wallet, CURRENCY_CAP - balance))

export interface MarketItemState {
  /** item.ini CanTrade: bit 2 = tradable between players. */
  canTrade: number
  bound: boolean
  equipped: boolean
  inBag: boolean
  /** Browse category (marketCategoryKey); undefined when the item has none. */
  category: string | undefined
  equipment: boolean
  /** Identified (rolled) properties. */
  propCount: number
}

export type ListingRefusal =
  'not_tradable' | 'bound' | 'equipped' | 'not_in_bag' | 'needs_properties' | 'no_category'

/** OnTestAdd / CanSale, plus the bag check the original server skipped (M8). */
export function listingRefusal(item: MarketItemState): ListingRefusal | null {
  if ((item.canTrade & 2) === 0) return 'not_tradable'
  if (item.bound) return 'bound'
  if (item.equipped) return 'equipped'
  if (!item.inBag) return 'not_in_bag'
  if (item.equipment && (item.propCount < 2 || item.propCount > 4)) return 'needs_properties'
  if (item.category === undefined) return 'no_category'
  return null
}

const validPrice = (price: number) =>
  Number.isInteger(price) && price >= 1 && price <= MARKET_MAX_UNIT_PRICE

/** Per-unit prices: at least one currency, each 1..1,000,000; null = not offered. */
export function priceRefusal(stone: number | null, gold: number | null): 'invalid_price' | null {
  if (stone === null && gold === null) return 'invalid_price'
  if (stone !== null && !validPrice(stone)) return 'invalid_price'
  if (gold !== null && !validPrice(gold)) return 'invalid_price'
  return null
}
