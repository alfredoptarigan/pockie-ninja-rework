// The 18 arena opponent slots (SendRivalData, RollToCompeteClient) and the duel candidates.
import type { Random } from '../random.js'

export const SLOTS = 18
const ROW = 6
/** Places above the top of the list (down to -10) are the Referee. */
const LOWEST_REFEREE = -10
/** Window A starts 30 places above you; each window is 13 places wide. */
const WINDOW_START = -30
const WINDOW_SIZE = 13
const DUEL_RANGE = 30
const DUEL_PICKS = 6

export type SlotPick =
  | { kind: 'npc'; npcId: string }
  | { kind: 'referee'; place: number }
  | { kind: 'place'; place: number }

/** Tiers 0-1: the 18 normal NPCs of the tier from a random offset (RandInt(0, count-3)), wrapping. */
export function npcSlots(npcs: readonly string[], random: Random): SlotPick[] {
  const offset = random.between(0, Math.max(0, npcs.length - 3))
  return Array.from({ length: SLOTS }, (_, i) => ({
    kind: 'npc' as const,
    npcId: npcs[(offset + i) % npcs.length]!,
  }))
}

/** `count` distinct random entries; all of them when there are fewer than count + 1. */
function pickSome<T>(items: T[], count: number, random: Random) {
  if (items.length <= count) return items
  const left = [...items]
  return Array.from({ length: count }, () => left.splice(random.int(left.length), 1)[0]!)
}

/**
 * Tier 2+: three windows around my place `me` in a list of `total` rows, 6 random places each
 * (never me). Negative places are the Referee; empty slots get tier NPCs.
 */
export function playerSlots(
  me: number,
  total: number,
  npcs: readonly string[],
  random: Random,
): SlotPick[] {
  const fill = npcSlots(npcs, random)
  return [0, 1, 2].flatMap((row) => {
    const start = me + WINDOW_START + row * WINDOW_SIZE
    const places = Array.from({ length: WINDOW_SIZE }, (_, i) => start + i).filter(
      (p) => p >= LOWEST_REFEREE && p < total && p !== me,
    )
    const picked = pickSome(places, ROW, random)
      .sort((a, b) => a - b)
      .map((place): SlotPick => (place < 0 ? { kind: 'referee', place } : { kind: 'place', place }))
    return Array.from({ length: ROW }, (_, i) => picked[i] ?? fill[row * ROW + i]!)
  })
}

/** The Referee's score: S_self x (1 + 0.1 x |place|), truncated. */
export const refereeScore = (score: number, place: number) =>
  Math.trunc(score * (1 + 0.1 * Math.abs(place)))

/** The Referee's stats multiplier: 1 + 0.05 x |place| (up to 1.5). */
export const refereeMul = (place: number) => 1 + 0.05 * Math.abs(place)

/** Ninjutsu Duel "Random" tab: 6 random places within ±30 of mine. */
export function duelWindow(me: number, total: number, random: Random) {
  const places = Array.from({ length: DUEL_RANGE * 2 + 1 }, (_, i) => me - DUEL_RANGE + i).filter(
    (p) => p >= 0 && p < total && p !== me,
  )
  return pickSome(places, DUEL_PICKS, random)
}
