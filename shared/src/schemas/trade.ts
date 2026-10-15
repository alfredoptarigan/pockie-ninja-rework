// Player-to-player Trade API (server/src/modules/trade). Rules and config live in
// game-core/src/economy/trade.ts.
import { z } from 'zod'
import type { MarketItem } from './market.js'

/** CapitalSystem cap per currency (game-core CURRENCY_CAP). */
const MAX_AMOUNT = 100_000_000

export const tradeRequestSchema = z.object({ characterId: z.uuid() }).strict()
export const tradeRequestIdSchema = z.object({ requestId: z.uuid() }).strict()
export const tradeItemSchema = z.object({ inventoryId: z.uuid() }).strict()
export const tradeCurrencySchema = z
  .object({
    currency: z.enum(['stone', 'gold', 'giftCoupon']),
    amount: z.number().int().min(0).max(MAX_AMOUNT),
  })
  .strict()
/** `version` is the trade the player looked at: a newer one refuses the step. */
export const tradeReadySchema = z
  .object({ ready: z.boolean(), version: z.number().int().min(0) })
  .strict()
export const tradeConfirmSchema = z.object({ version: z.number().int().min(0) }).strict()

export type TradeCurrencyInput = z.infer<typeof tradeCurrencySchema>

export interface TradePlayer {
  characterId: string
  name: string
  level: number
}

export interface TradeRequestView {
  id: string
  from: TradePlayer
  to: TradePlayer
  expiresAt: string
}

/** An offered item as it was when offered: what the partner gets, or the trade fails. */
export type TradeItem = MarketItem

export interface TradeSideView extends TradePlayer {
  items: TradeItem[]
  currency: { stone: number; gold: number; giftCoupon: number }
  ready: boolean
  confirmed: boolean
}

export interface TradeView {
  id: string
  /** Goes up on every change of either offer; ready and confirm name the one they saw. */
  version: number
  me: TradeSideView
  partner: TradeSideView
}

export interface TradeState {
  trade: TradeView | null
  /** Requests to me, oldest first. */
  incoming: TradeRequestView[]
  /** My request waiting for an answer. */
  outgoing: TradeRequestView | null
}
