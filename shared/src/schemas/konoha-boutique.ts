// Konoha Boutique (Reborn chunk 358, a 5-reel slot machine; reborn-lazy-features.md "Konoha
// Boutique"): GET /api/game/konoha-boutique and its actions.
import { z } from 'zod'
import type { BagItemInfo } from './bag.js'
import type { Character } from './game.js'

/** The reel symbols, as Reborn's client lists them (ui/UIResource/Boutique/{symbol}.png). */
export const BOUTIQUE_SYMBOLS = [
  'j',
  'q',
  'k',
  'a',
  '9',
  '10',
  'pic1',
  'pic2',
  'pic3',
  'pic4',
  'pic5',
] as const
export type BoutiqueSymbol = (typeof BOUTIQUE_SYMBOLS)[number]

/** Reborn's 25 paylines: the row (0 top, 1 middle, 2 bottom) on reels 1-5, and the line colour. */
export const BOUTIQUE_PAYLINES: readonly (readonly [readonly number[], string])[] = [
  [[0, 0, 0, 0, 0], '#FFD700'],
  [[1, 1, 1, 1, 1], '#FF4500'],
  [[2, 2, 2, 2, 2], '#1E90FF'],
  [[0, 0, 1, 0, 0], '#32CD32'],
  [[2, 2, 1, 2, 2], '#FF1493'],
  [[0, 1, 2, 1, 0], '#00FFFF'],
  [[2, 1, 0, 1, 2], '#FF00FF'],
  [[0, 1, 1, 1, 0], '#7CFC00'],
  [[2, 1, 1, 1, 2], '#FFA500'],
  [[1, 0, 0, 0, 1], '#00BFFF'],
  [[1, 2, 2, 2, 1], '#ADFF2F'],
  [[0, 0, 0, 1, 2], '#FF6347'],
  [[2, 2, 2, 1, 0], '#40E0D0'],
  [[0, 1, 2, 2, 2], '#FF69B4'],
  [[2, 1, 0, 0, 0], '#FFFF00'],
  [[1, 1, 0, 1, 1], '#00FF7F'],
  [[1, 1, 2, 1, 1], '#DC143C'],
  [[0, 0, 1, 2, 2], '#6495ED'],
  [[2, 2, 1, 0, 0], '#00FA9A'],
  [[1, 0, 1, 2, 1], '#FFB6C1'],
  [[1, 2, 1, 0, 1], '#7B68EE'],
  [[0, 1, 0, 1, 0], '#BA55D3'],
  [[2, 1, 2, 1, 2], '#20B2AA'],
  [[0, 2, 1, 2, 0], '#8A2BE2'],
  [[2, 0, 1, 0, 2], '#00FF00'],
]

/**
 * Rules from Reborn's client and guide: 5 reels of 3 rows, pieces indexed row * 5 + reel, bet =
 * multiplier x lines, 3 / 4 / 5 in a row pay x3 / x10 / x50, 500 free coins every 5 minutes up to
 * 5 times a day, pick 3 of 6 chests in the Bonus Round, 6 boxes in Double Chance, 8 rewards a
 * page. The free-coin day resets at 00:00 UTC (Reborn: its server day).
 */
export const BOUTIQUE_RULES = {
  reels: 5,
  rows: 3,
  matchPayouts: { 3: 3, 4: 10, 5: 50 } as Record<number, number>,
  freeCoins: 500,
  freeCoinsEveryMs: 5 * 60_000,
  freeCoinsPerDay: 5,
  chests: 6,
  chestPicks: 3,
  doubleBoxes: 6,
} as const

export const BOUTIQUE_CURRENCIES = ['gold', 'stone', 'giftCoupon'] as const
export type BoutiqueCurrency = (typeof BOUTIQUE_CURRENCIES)[number]

const whole = (max: number) => z.number().int().min(1).max(max)

export const boutiqueSpinSchema = z
  .object({ multiplier: whole(100), lines: whole(BOUTIQUE_PAYLINES.length) })
  .strict()
export const boutiqueBuyCoinsSchema = z
  .object({ currency: z.enum(BOUTIQUE_CURRENCIES), tier: z.number().int().min(0).max(20) })
  .strict()
export const boutiqueExchangeSchema = z
  .object({ rewardId: z.string().regex(/^[a-z0-9-]{1,40}$/) })
  .strict()
/** A chest (0-5); -1 gives up the chests left. */
export const boutiqueChestSchema = z
  .object({
    index: z
      .number()
      .int()
      .min(-1)
      .max(BOUTIQUE_RULES.chests - 1),
  })
  .strict()
export const boutiqueGuessSchema = z
  .object({
    index: z
      .number()
      .int()
      .min(0)
      .max(BOUTIQUE_RULES.doubleBoxes - 1),
  })
  .strict()

export type BoutiqueSpinInput = z.input<typeof boutiqueSpinSchema>
export type BoutiqueBuyCoinsInput = z.input<typeof boutiqueBuyCoinsSchema>

/** levels[n] = [total EXP to reach level n, max multiplier, max lines]. */
export type BoutiqueLevels = Record<number, [exp: number, maxMultiplier: number, maxLines: number]>

export interface BoutiqueReward {
  id: string
  itemId: string
  amount: number
  /** Boutique coins. */
  price: number
  info: BagItemInfo
}

export interface BoutiqueView {
  coins: number
  level: number
  currentExp: number
  levels: BoutiqueLevels
  /** 1 while a Bonus Round waits for its chests. */
  bonusChance: number
  /** Chests opened in the waiting Bonus Round. */
  bonusPicks: { index: number; coins: number }[]
  /** 1 while a Double Chance waits. */
  doubleChance: number
  doubleChanceCoins: number
  doubleChanceNumber: number
  doubleChanceOperator: 'higher' | 'lower'
  lastCoinWon: number
  /** When the next free coins can be claimed. */
  nextFreeCoinTime: string
  freeCoinsClaimed: number
  freeCoinsPerDay: number
  rewards: BoutiqueReward[]
  /** Coins for sale: [cost in the currency, coins] per tier. */
  buyTiers: Record<BoutiqueCurrency, [cost: number, coins: number][]>
}

export interface BoutiqueSpinResult {
  /** 15 symbols, row * 5 + reel. */
  pieces: BoutiqueSymbol[]
  winningLines: number[]
  /** Piece indexes on the winning lines. */
  winningPieces: number[]
  coinsGained: number
  boutique: BoutiqueView
}

export interface BoutiqueChestResult {
  index: number
  coinsWon: number
  boutique: BoutiqueView
}

export interface BoutiqueGuessResult {
  won: boolean
  boxes: number[]
  index: number
  picked: number
  operator: 'higher' | 'lower'
  target: number
  boutique: BoutiqueView
}

export interface BoutiqueActionResult {
  boutique: BoutiqueView
  character: Character
}
