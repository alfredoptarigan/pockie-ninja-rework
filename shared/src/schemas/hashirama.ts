// Valley of the End: Hashirama vs Madara (Reborn scene 9500, main.js `Fj`) and its Fortune Wheel
// (`fj`). An admin starts a 48-hour server-wide battle; each ninja picks a side for good and attacks
// the other side's leader; the side that dealt more damage wins. Winners and each side's top 3 get
// free Fortune Wheel spins, spendable for 24 hours after the battle.
import { z } from 'zod'
import type { Character } from './game.js'

export const HASHIRAMA_SIDES = ['madara', 'hashirama'] as const
export type HashiramaSide = (typeof HASHIRAMA_SIDES)[number]
export type HashiramaWinner = HashiramaSide | 'tie' | 'none'

/** Reborn's admin hint: a 48-hour battle, spins spendable for 24 hours after it. */
export const HASHIRAMA_RULES = { battleHours: 48, spendHours: 24 } as const

export interface HashiramaRow {
  name: string
  damage: number
}

export interface HashiramaEventView {
  running: boolean
  /** The battle is over and the damage was counted (payouts made). */
  finished: boolean
  phase: 'running' | 'counting' | 'finished' | 'closed'
  endsAt: string
  closesAt: string
  winner: HashiramaWinner | null
}

export interface HashiramaView {
  /** False under the level or while no battle is open (Reborn: "not open yet"). */
  eligible: boolean
  event: HashiramaEventView | null
  totals: Record<HashiramaSide, number>
  leaderboards: Record<HashiramaSide, HashiramaRow[]>
  me: { side: HashiramaSide; damage: number; rank: number | null } | null
  myPayout: { spins: number } | null
  freeSpins: number
  rewards: { winnerSpins: number; topSpins: [number, number, number] }
  /** Milliseconds until the next attack is allowed (0 = now). */
  retryInMs: number
}

export interface HashiramaAccess {
  open: boolean
  closesAt: string | null
}

export const hashiramaJoinSchema = z.object({ side: z.enum(HASHIRAMA_SIDES) }).strict()
export const hashiramaStartSchema = z
  .object({ hours: z.number().positive().max(HASHIRAMA_RULES.battleHours).optional() })
  .strict()

export interface HashiramaAttackResult<R = unknown> {
  replay: R
  damage: number
  look: { clothing: number }
  hashirama: HashiramaView
  character: Character
}

// Fortune Wheel ------------------------------------------------------------------------------

export const FORTUNE_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type FortuneRarity = (typeof FORTUNE_RARITIES)[number]

export interface FortuneReward {
  id: string
  /** Our item id; absent for the mystery pool's spins and Bankai Coins. */
  itemId?: string
  kind: 'item' | 'spins' | 'bankaiCoins'
  amount: number
  rarity: FortuneRarity
  limit: { won: number; max: number } | null
}

export interface FortunePool {
  id: string
  label: string
  /** Only one reward of a unique pool may sit on the wheel. */
  unique: boolean
  rewards: FortuneReward[]
}

export interface FortuneSegment {
  kind: 'choice' | 'grand' | 'mystery'
  /** The chosen or grand reward; null on mystery slices and empty choice slots. */
  reward: FortuneReward | null
  /** Chance in percent. */
  chance: number
}

export interface FortuneResult {
  token: number
  winningIndex: number
  reward: FortuneReward
  bonus: boolean
}

export interface FortuneWheelView {
  freeSpins: number
  bonusReady: boolean
  goldSpinCost: number
  paidSpins: number
  bonusEvery: number
  segments: FortuneSegment[]
  pools: FortunePool[]
  mysteryPool: FortuneReward[]
  selection: (string | null)[]
  lastResult: FortuneResult | null
  nextSpinToken: number
  /** False once the event closed: spins can no longer be spent. */
  open: boolean
}

export const fortuneConfigureSchema = z
  .object({ selection: z.array(z.string().max(40).nullable()).length(3) })
  .strict()
export const fortuneSpinSchema = z
  .object({ token: z.number().int().min(0), payWith: z.literal('gold').optional() })
  .strict()

export interface FortuneSpinResult {
  result: FortuneResult
  wheel: FortuneWheelView
  character: Character
}
