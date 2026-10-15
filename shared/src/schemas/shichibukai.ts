// Shichibukai ("Sea of Fallen Waters", Reborn scene 9100; main.js @3707500-3780000): a dice board
// expedition over 9 floors in 4 difficulties. GET /api/game/shichibukai and its start, roll, card,
// boss, next floor, buy roll, quit and exchange actions. Reborn keeps the attempts, event odds,
// rewards, boss stats, card prizes and the exchange list on its server; ours are
// SHICHIBUKAI_PLACEHOLDERS (server/src/modules/shichibukai/config.ts).
import { z } from 'zod'
import type { BagItemInfo } from './bag.js'
import type { Character } from './game.js'

/**
 * Reborn's client rules: the village icon needs level 30; 9 floors x 4 difficulties (Easy, Hard,
 * Epic, Nightmare) with 0-5 stars each; floor f of difficulty d opens once floor f - 1 of d and
 * floor f of d - 1 have a star; a roll moves 1-6 tiles; Buy Dice (Moon Eye) picks the face for
 * `moonEyeGold` Gold; out of rolls, one more roll costs 10 Gold, 500 Gift Certificates or 300k
 * Stone; a card set is 5 cards with up to 3 peeks costing 50k, 100k, then 150k Stone; the boss
 * fight is at 50%, 100% or 150% power, and "the stronger the foe, the more stars and points".
 */
export const SHICHIBUKAI_RULES = {
  minLevel: 30,
  floors: 9,
  difficulties: 4,
  maxStars: 5,
  moonEyeGold: 10,
  rollPrices: { gold: 10, gc: 500, stones: 300_000 },
  cards: 5,
  peeks: 3,
  peekStone: 50_000,
  powers: [50, 100, 150],
} as const

export const DIFFICULTY_NAMES = ['Easy', 'Hard', 'Epic', 'Nightmare'] as const

/** Tile events (Reborn's H_ table); 9 is the boss. */
export const TILE_EVENTS = {
  0: 'Empty',
  1: 'Blessing',
  2: 'Curse',
  3: 'Points',
  4: 'Marauder',
  5: 'Chest',
  6: 'Energy',
  7: 'Snare',
  8: 'Whirlpool',
  9: 'Boss',
} as const
export type TileEvent = keyof typeof TILE_EVENTS

/** Stars key: `${difficulty}-${floor}` (Reborn's key). */
export const starKey = (difficulty: number, floor: number) => `${difficulty}-${floor}`

/** Reborn's unlock rule over the best stars per difficulty and floor. */
export function floorUnlocked(stars: Record<string, number>, floor: number, difficulty: number) {
  const has = (d: number, f: number) => (stars[starKey(d, f)] ?? 0) >= 1
  return (
    (floor <= 1 || has(difficulty, floor - 1)) && (difficulty <= 1 || has(difficulty - 1, floor))
  )
}

const floor = z.number().int().min(1).max(SHICHIBUKAI_RULES.floors)
const difficulty = z.number().int().min(1).max(SHICHIBUKAI_RULES.difficulties)
const cardIndex = z
  .number()
  .int()
  .min(0)
  .max(SHICHIBUKAI_RULES.cards - 1)

export const shichibukaiStartSchema = z.object({ floor, difficulty }).strict()
export const shichibukaiRollSchema = z
  .object({ face: z.number().int().min(1).max(6).optional() })
  .strict()
export const shichibukaiCardSchema = z.object({ index: cardIndex }).strict()
export const shichibukaiBossSchema = z
  .object({ power: z.union([z.literal(50), z.literal(100), z.literal(150)]) })
  .strict()
export const shichibukaiBuyRollSchema = z
  .object({ currency: z.enum(['gold', 'gc', 'stones']) })
  .strict()
export const shichibukaiExchangeSchema = z.object({ id: z.number().int().min(0) }).strict()

export interface ShichibukaiCell {
  index: number
  /** Reborn's "lane-step" grid tag. */
  tag: string
  event: TileEvent
}

export interface ShichibukaiCardView {
  reason: 'chest' | 'monster'
  /** Peeked cards by index (item id). */
  peeked: Record<number, string>
  /** The flipped card, or null before the pick. */
  flipped: number | null
  /** All five once a card is flipped. */
  items: string[] | null
  /** Stone the next peek costs, or null when no peek is left. */
  peekCost: number | null
}

export interface ShichibukaiRunView {
  floor: number
  difficulty: number
  pos: number
  visited: number[]
  rollsLeft: number
  throws: number
  atBoss: boolean
  /** The floor's boss is beaten: Continue to the next floor or Collect. */
  cleared: boolean
  bossesKilled: number
  runPoints: number
  hpPct: number
  mpPct: number
  card: ShichibukaiCardView | null
  board: { cells: ShichibukaiCell[]; edges: [number, number][]; bossIndex: number }
  boss: { name: string; pose: number }
}

export interface ShichibukaiExchangeEntry {
  id: number
  itemId: string
  info: BagItemInfo
  points: number
}

export interface ShichibukaiView {
  attempts: number
  maxAttempts: number
  /** Exchange points. */
  points: number
  stars: Record<string, number>
  run: ShichibukaiRunView | null
  exchange: ShichibukaiExchangeEntry[]
  /** Boss pose per floor 1-9 (the Choose Expedition portraits). */
  floorBosses: { name: string; pose: number }[]
  resetAt: string
}

export interface ShichibukaiStep {
  index: number
  event: TileEvent
  /** What happened, e.g. "+30% HP" or "Teleported". */
  text: string
}

export interface ShichibukaiRollResult {
  dice: number
  /** Tiles walked, from the start tile to the landing tile. */
  path: number[]
  steps: ShichibukaiStep[]
  shichibukai: ShichibukaiView
  character: Character
}

export interface ShichibukaiBossResult<R = unknown> {
  replay: R
  victory: boolean
  look: { clothing: number }
  rewards: { exp: number; points: number; stars: number; throws: number } | null
  shichibukai: ShichibukaiView
  character: Character
}

export interface ShichibukaiActionResult {
  shichibukai: ShichibukaiView
  character: Character
  /** An item granted by a claimed card or an exchange. */
  item?: { itemId: string; info: BagItemInfo }
}
