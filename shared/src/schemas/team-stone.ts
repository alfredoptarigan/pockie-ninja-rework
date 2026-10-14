// Team Stone (M5 decision 28): GET /api/game/team-stone, the queue, leaderboard, replays and the
// Battle Coin shop.
import { z } from 'zod'
import type { ArenaLook } from './arena.js'
import type { Character } from './game.js'

export const teamStoneShopBuySchema = z.object({ itemId: z.string().regex(/^i\d+$/) }).strict()
export const teamStoneMatchParamsSchema = z.object({ id: z.uuid() }).strict()

export interface TeamStoneLeague {
  id: string
  nameKey: string
  minScore: number
  battleCoins: number
  /** Extra weekly item of the top leagues. */
  item?: string
  amount?: number
}

export interface TeamStoneMatchEntry {
  id: string
  won: boolean
  delta: number
  /** Names in fight order: own side, then the enemy side. */
  team: string[]
  enemy: string[]
  createdAt: string
}

export interface TeamStoneView {
  minLevel: number
  attemptsPerDay: number
  attemptsUsed: number
  score: number
  battleCoins: number
  league: number
  leagues: TeamStoneLeague[]
  /** At least one fight this week (the weekly pay needs it). */
  playedThisWeek: boolean
  queue: { queuedAt: string } | null
  /** Start of the next UTC day, Monday and month. */
  dayResetAt: string
  weekResetAt: string
  monthResetAt: string
  history: TeamStoneMatchEntry[]
}

export interface TeamStoneLeaderboard {
  rows: { place: number; name: string; level: number; score: number }[]
  myPlace: number | null
}

export interface TeamStoneReplay<R = unknown> {
  replay: R
  /** Looks in fight order: side A, then side B. */
  looks: ArenaLook[]
  /** 0 when the viewer fought on side A. */
  side: 0 | 1
}

export interface TeamStoneShopView {
  battleCoins: number
  offers: { itemId: string; price: number }[]
}

export interface TeamStoneShopResult {
  shop: TeamStoneShopView
  character: Character
}
