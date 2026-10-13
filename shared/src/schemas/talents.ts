// Reborn talents (M5 decisions 6-8): GET /api/game/talents and its two actions.
import { z } from 'zod'
import type { Character } from './game.js'

export const talentParamsSchema = z.object({ id: z.coerce.number().int().min(1).max(8) })
/** Normal pays the attempt's Stone cost, Gold its Gold cost. */
export const talentUpgradeBodySchema = z.object({ useGold: z.boolean().default(false) })
export const talentActiveBodySchema = z.object({ active: z.boolean() })

export interface TalentEntry {
  talentId: number
  nameKey: string
  level: number
  /** EXP toward the next level. */
  exp: number
  /** EXP the next level needs; null past the last row. */
  expNeeded: number | null
  active: boolean
}
export interface TalentsView {
  unlockLevel: number
  /** Highest talent level the ninja's level allows (level - 50, at least 0). */
  cap: number
  attemptsUsed: number
  attemptsPerDay: number
  /** Cost of the next attempt today; null when none are left. */
  nextCost: { gold: number; stones: number } | null
  maxActive: number
  /** Start of the next UTC day, when attempts reset. */
  resetAt: string
  talents: TalentEntry[]
}
export interface TalentUpgradeResult extends TalentsView {
  upgrade: { talentId: number; exp: number; crit: boolean; levelsGained: number }
  character: Character
}
