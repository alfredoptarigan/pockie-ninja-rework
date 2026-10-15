// Sannin Test ("Sannin Test - Six Dice", Reborn scene 9200 and its Sannin Examiner NPC 26012;
// main.js @3503000-3511400): GET /api/game/sannin-test and its roll, change luck, perfect dice,
// claim and promotion battle. Reborn keeps the dice counts, rewards and title path on its server;
// ours are SANNIN_PLACEHOLDERS (server/src/modules/sannin-test/config.ts).
import type { Character } from './game.js'

/**
 * Reborn's client rules: the village icon needs level 60; six dice, face 1 is the "Ninja die";
 * Change Luck needs a free change and fewer than six Ninja dice; Perfect turns five Ninja dice into
 * six for `makeSixCost` Gold (Reborn's client default 100); a pending result must be claimed before
 * the next roll or a promotion battle; Growing Points are spent only on a promotion victory.
 */
export const SANNIN_RULES = {
  minLevel: 60,
  dice: 6,
  ninjaFace: 1,
} as const

export interface SanninPending {
  /** Six faces 1-6; 1 is a Ninja die. */
  dice: number[]
  ninjaCount: number
}

export interface SanninRankBonus {
  /** Growing Points the promotion battle into this rank needs (0 for rank 0). */
  requiredPoints: number
  /** Permanent Max HP of a ninja at this rank. */
  hp: number
}

export interface SanninTestView {
  state: {
    rank: number
    growthPoints: number
    /** Dice rolls left today (resets at 00:00 UTC). */
    remainingDice: number
    /** Free Change Luck uses left today. */
    remainingFreeChanges: number
    totalRolls: number
    pending: SanninPending | null
  }
  /** Index = rank; rank 0 is the start. */
  rankBonuses: SanninRankBonus[]
  /** What claiming the pending result gives. */
  pendingReward: { experience: number; growthPoints: number } | null
  makeSixCost: number
  gold: number
  resetAt: string
}

export interface SanninClaimResult {
  sanninTest: SanninTestView
  experience: number
  growthPoints: number
  character: Character
}

export interface SanninPromotionResult<R = unknown> {
  replay: R
  victory: boolean
  /** The rank the battle was for. */
  targetRank: number
  /** How the examiner is drawn in the replay. */
  look: { clothing: number }
  sanninTest: SanninTestView
  character: Character
}
