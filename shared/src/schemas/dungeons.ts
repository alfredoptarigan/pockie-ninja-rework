// Scroll Dungeons ("Ninja Dungeons", Reborn chunk 54): GET /api/game/dungeons and its fight.
import { z } from 'zod'
import type { Character } from './game.js'

/**
 * Rules shared by the server and the window. Reborn's client: level 45, 25 attempts a day (its
 * default; the real value is server-side), 3 of 11 bosses a day, 2% base, +0.5% a win, max 10%,
 * 0.1% permanent.
 */
export const DUNGEON_RULES = {
  minLevel: 45,
  maxAttempts: 25,
  bossCount: 11,
  bossesPerDay: 3,
  pityStep: 0.5,
  maxChance: 10,
  permanentChance: 0.1,
} as const

export const dungeonFightSchema = z
  .object({
    index: z
      .number()
      .int()
      .min(0)
      .max(DUNGEON_RULES.bossCount - 1),
  })
  .strict()

export type DungeonFightInput = z.input<typeof dungeonFightSchema>

export interface DungeonDrop {
  /** Reborn's drop name (the scroll skill). */
  name: string
  /** Base chance in percent of the timed scroll. */
  chance: number
  /** Our 7-day scroll (Reborn: 3-hour). */
  itemId: string
  permanentItemId: string
}

export interface DungeonBoss {
  /** Index into Reborn's boss table (`activeBosses` values). */
  index: number
  name: string
  build: string
  /** Reborn pose image id (`/assets/reborn/poses/<pose>.webp`). */
  pose: number
  drops: DungeonDrop[]
  /** The ninja's pity bonus on this boss's timed scrolls, in percent. */
  pity: number
}

export interface DungeonsView {
  /** Today's bosses (indexes into `bosses`). */
  activeBosses: number[]
  bosses: DungeonBoss[]
  attemptsRemaining: number
  maxAttempts: number
  /** Next 00:00 UTC: attempts reset and the bosses rotate together. */
  resetAt: string
  nextRotation: string
}

export interface DungeonFightResult<R = unknown> {
  replay: R
  won: boolean
  /** How the boss is drawn in the replay (our outfit standing in for Reborn's). */
  look: { clothing: number }
  drops: { itemId: string }[]
  dungeons: DungeonsView
  character: Character
}
