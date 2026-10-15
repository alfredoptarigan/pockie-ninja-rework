// Player-to-player Trade rules (Reborn's "Trade with" window, reborn-windows-M-Z-hud.md; the 2011
// ExchangeSystem in docs/original-data/trade-market.md part 1). Pure functions: the server checks
// them inside its transactions, the client uses them for its hints.

/**
 * Every Trade value in one place.
 *
 * SPEC = read from Reborn's client. PLACEHOLDER = Reborn keeps the value on its server; ours is a
 * guess the product owner must confirm.
 */
export const TRADE_CONFIG = {
  /** SPEC: "Both players must be at least level 30 to trade." (client `Ys=30`). */
  minLevel: 30,
  /** SPEC: each offer box is a 6 x 6 grid. */
  maxItems: 36,
  /**
   * PLACEHOLDER: the fee kept from a currency the partner receives. Reborn's server sends
   * `currencyTaxRate` for Stone and Gift Certificates (client fallback 10%) and a separate Gold
   * tax; ours: 10% on Stone and Gift Certificates, no Gold tax.
   */
  taxRate: { stone: 0.1, gold: 0, giftCoupon: 0.1 },
  /** PLACEHOLDER: Reborn shows no expiry; an unanswered request is dropped after 60 s. */
  requestTtlMs: 60_000,
} as const

export const TRADE_CURRENCIES = ['stone', 'gold', 'giftCoupon'] as const
export type TradeCurrency = (typeof TRADE_CURRENCIES)[number]
export type TradeAmounts = Record<TradeCurrency, number>

export const NO_AMOUNTS: TradeAmounts = { stone: 0, gold: 0, giftCoupon: 0 }

export const canTradeAt = (level: number) => level >= TRADE_CONFIG.minLevel

/** What the partner receives of `amount` and the fee kept (Reborn's `Zs`: floor, never above). */
export function tradeFee(currency: TradeCurrency, amount: number) {
  const fee = Math.min(amount, Math.floor(amount * TRADE_CONFIG.taxRate[currency]))
  return { fee, net: amount - fee }
}

/** The net of every currency offered. */
export const netAmounts = (offered: TradeAmounts): TradeAmounts => ({
  stone: tradeFee('stone', offered.stone).net,
  gold: tradeFee('gold', offered.gold).net,
  giftCoupon: tradeFee('giftCoupon', offered.giftCoupon).net,
})

export interface TradeItemState {
  /** item.ini CanTrade: bit 2 = tradable between players. */
  canTrade: number
  /** Quest items (TaskItem) never leave their owner, as in 2011. */
  questItem: boolean
  bound: boolean
  locked: boolean
  equipped: boolean
  inBag: boolean
}

export type TradeRefusal = 'not_tradable' | 'bound' | 'locked' | 'equipped' | 'not_in_bag'

export const TRADE_REFUSALS: Record<TradeRefusal, string> = {
  not_tradable: 'That item cannot be traded.',
  bound: 'Bound items cannot be traded',
  locked: 'Unlock the item first.',
  equipped: 'Take the item off before you trade it.',
  not_in_bag: 'Move the item to your inventory first',
}

/** Why an item cannot be offered (null = it can); fixes 2011's unchecked CanTrade (T5). */
export function tradeRefusal(item: TradeItemState): TradeRefusal | null {
  if (!item.inBag) return 'not_in_bag'
  if (item.equipped) return 'equipped'
  if (item.bound) return 'bound'
  if ((item.canTrade & 2) === 0 || item.questItem) return 'not_tradable'
  if (item.locked) return 'locked'
  return null
}
