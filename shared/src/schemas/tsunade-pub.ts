// Tsunade Pub (Reborn chunk 221, prize roulette): GET /api/game/tsunade-pub and its actions.
import { z } from 'zod'
import type { BagItemInfo } from './bag.js'
import type { Character } from './game.js'

/**
 * Rules from Reborn's client guide (reborn-lazy-features.md, "Tsunade Pub"): 5 free spins a day,
 * 10 Gold per bought spin, a bonus roll every 5 spins, a legendary at 100 spins, 15% Valhalla
 * gear, 50% unbound, 16 wheel slots, 10x8 prize pages. Free spins reset at 00:00 UTC (our daily
 * reset; Reborn says "midnight").
 */
export const TSUNADE_PUB_RULES = {
  freeSpinsPerDay: 5,
  spinCost: 10,
  bonusEvery: 5,
  guaranteedEvery: 100,
  valhallaChance: 15,
  unboundChance: 50,
  boardSlots: 16,
  pageColumns: 10,
  pageRows: 8,
} as const

export const PUB_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type PubRarity = (typeof PUB_RARITIES)[number]

const index = z.number().int().min(0).max(9999)

/** Collect one prize (`index`) or, without it, every prize that fits in the bag. */
export const pubCollectSchema = z.object({ index: index.optional() }).strict()
/** Sell prizes for Stone (Reborn sells one page). */
export const pubSellSchema = z.object({ indexes: z.array(index).min(1).max(200) }).strict()

export type PubCollectInput = z.input<typeof pubCollectSchema>
export type PubSellInput = z.input<typeof pubSellSchema>

/** A wheel slot or a won prize. */
export interface PubPrize {
  itemId: string
  amount: number
  rarity: PubRarity
  /** Won prizes only: half of them are unbound. */
  bound?: boolean
  /** Valhalla gear: equipment that lands with all its refinement lines rolled. */
  valhalla?: boolean
}

export interface PubPrizeView extends PubPrize {
  info: BagItemInfo
  /** Stone this prize sells for. */
  sellValue: number
}

export interface TsunadePubView {
  /** The 16 wheel slots, clockwise from the top left. */
  board: PubPrizeView[]
  /** Unclaimed prizes, oldest first (indexes are what collect and sell take). */
  won: PubPrizeView[]
  freeAttempts: number
  rewardAttempts: number
  paidAttempts: number
  rollsUntilBonus: number
  rollsUntilGuaranteed: number
  /** Next 00:00 UTC, when the free spins come back. */
  resetAt: string
}

export interface PubSpinResult {
  /** The wheel the spin landed on (the winning slot holds `prize`). */
  currentBoard: PubPrizeView[]
  winningIndex: number
  prize: PubPrizeView
  /** Valhalla gear won on top of the prize, if any. */
  extra: PubPrizeView | null
  pub: TsunadePubView
  character: Character
}

export interface PubActionResult {
  pub: TsunadePubView
  character: Character
  /** Collect: prizes moved to the bag. Sell: Stone earned. */
  collected?: number
  earned?: number
}
