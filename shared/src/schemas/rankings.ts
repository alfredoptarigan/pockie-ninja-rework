// Rankings window (/api/game/rankings/*): the four live lists of decision 13 (top 100, 10 per
// page, "find me") and the weekly toll gate ranking (top 50 per gate, Monday 00:00 UTC weeks).
import { z } from 'zod'
import type { Character } from './game.js'

export const RANKING_KEYS = ['level', 'stone', 'lasNoches', 'arena'] as const
export type RankingKey = (typeof RANKING_KEYS)[number]

export const RANKING_SIZE = 100
export const RANKING_PAGE_SIZE = 10
export const TOLL_GATE_RANKING_SIZE = 50

export const rankingParamsSchema = z.object({ key: z.enum(RANKING_KEYS) })
/** `find=me` opens the page with your place (page 1 when you are not ranked). */
export const rankingQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(RANKING_SIZE / RANKING_PAGE_SIZE)
      .default(1),
    find: z.literal('me').optional(),
  })
  .strict()
export const tollGateRankingParamsSchema = z.object({ gateId: z.coerce.number().int().positive() })

export type RankingQuery = z.input<typeof rankingQuerySchema>

export interface RankingTree {
  lists: { key: RankingKey; group: string; label: string }[]
  tollGates: { group: string; label: string; gates: { id: number; nameKey: string }[] }
}

export interface RankingRow {
  place: number
  name: string
  level: number
  nation: number
  /** The sorted value as shown: EXP, Stone, best floor, arena score (/ 100). */
  value: number
  /** Arena tier (0-21), arena list only. */
  tier?: number
}

export interface RankingPage {
  key: RankingKey
  page: number
  pages: number
  /** Ranked entries (at most 100). */
  total: number
  rows: RankingRow[]
  /** Your place in the top 100, null = not ranked. */
  myPlace: number | null
}

export interface TollGateRankingRow {
  place: number
  name: string
  level: number
  nation: number
  /** Progress % (0-100). */
  schedule: number
  reachedAt: string
}

export interface TollGateWeek {
  /** The UTC Monday the week starts (YYYY-MM-DD). */
  week: string
  /** Top 50. */
  rows: TollGateRankingRow[]
  myPlace: number | null
}

export interface TollGateReward {
  place: number
  exp: number
  stone: number
}

export interface TollGateRanking {
  gateId: number
  thisWeek: TollGateWeek
  lastWeek: TollGateWeek & {
    /** Your reward for last week's place, null = not ranked. */
    reward: (TollGateReward & { claimed: boolean }) | null
  }
}

export interface TollGateClaimResult {
  reward: TollGateReward & { levelsGained: number }
  ranking: TollGateRanking
  character: Character
}
