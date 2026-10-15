// Impel Down (Reborn chunk 286, reborn-lazy-features.md "## Impel Down"): GET /api/game/impel-down
// and its fight, next gate and refresh.
import { z } from 'zod'
import type { Character } from './game.js'

/**
 * Reborn's rules (its Info text and client): 6 gates of 25 floors, gate levels 61-111 in steps of
 * 10 (the HUD icon needs 61), 3 lives a day, at most 5 refreshes costing 1000 * (1 + refreshes +
 * gate index) coupons. Lives and refreshes reset at 00:00 UTC, our daily reset (Reborn's reset
 * times are server-side; the refresh count resetting daily is our choice).
 */
export const IMPEL_DOWN_RULES = {
  gates: 6,
  floorsPerGate: 25,
  gateLevels: [61, 71, 81, 91, 101, 111],
  lives: 3,
  maxRefreshes: 5,
  refreshCoupons: 1000,
  /** Every 5th floor has a guaranteed crystal (Reborn's Zanpakuto Info text). */
  guaranteedEvery: 5,
} as const

/** Coupons for the next refresh in gate index `gate`. */
export const refreshCost = (refreshes: number, gate: number) =>
  IMPEL_DOWN_RULES.refreshCoupons * (1 + refreshes + gate)

/** Auto Sell: 0 off, else sells crystals of tier 1 Blue .. 3 Orange and below for Spirit Coins. */
export const impelDownFightSchema = z.object({ autoSell: z.number().int().min(0).max(3) }).strict()

export type ImpelDownFightInput = z.input<typeof impelDownFightSchema>

export interface ImpelDownView {
  /** Gate index 0-5. */
  gate: number
  /** Floor index 0-24 in the gate; 25 at the intersection after floor 25. */
  floor: number
  /** Best number of floors cleared over all gates (weapon slot idx opens at 25 * idx). */
  maxFloor: number
  intersection: boolean
  lives: number
  maxLives: number
  refreshes: number
  /** Coupons the next refresh costs. */
  refreshCost: number
  /** Level the next gate needs, or null in the last gate. */
  nextGateLevel: number | null
  /** The current floor's EXP and crystal drops: [crystal iid, chance in percent]. */
  exp: number
  drops: [iid: number, chance: number][]
  /** Next 00:00 UTC: lives and refreshes reset. */
  resetAt: string
}

export interface ImpelDownCrystalDrop {
  iid: number
  /** Auto Sell (or a full spirit inventory) turned it into Spirit Coins. */
  sold: boolean
  coins: number
}

export interface ImpelDownFightResult<R = unknown> {
  replay: R
  won: boolean
  /** How the floor's enemy is drawn in the replay. */
  look: { clothing: number }
  exp: number
  crystal: ImpelDownCrystalDrop | null
  impelDown: ImpelDownView
  character: Character
}
