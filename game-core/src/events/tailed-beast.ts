// Tailed Beast rules (M5 decision 27). Constants: server/data/game/reborn/events.json
// `tailedBeast`. The server owns the shared HP pool and the money; these are the pure parts.
import data from '../../../server/data/game/reborn/events.json'
import { refuse } from '../gates/errors.js'

const config = data.tailedBeast
export const BEAST_COUNT = 9
export type BeastMode = 0 | 1 | 2

/** UTC weekday, Monday = 1 ... Sunday = 7 (weeks start Monday 00:00 UTC, decision 23). */
export const weekday = (at: Date) => ((at.getUTCDay() + 6) % 7) + 1

/** Day d has beasts ((2d-2) mod 9) + 1 and ((2d-1) mod 9) + 1. */
export const todaysBeasts = (day: number): [number, number] => [
  ((2 * day - 2) % BEAST_COUNT) + 1,
  ((2 * day - 1) % BEAST_COUNT) + 1,
]

/** The client formula: 25 + 5(id-1) + 25 mode. */
export const beastLevel = (beast: number, mode: number) =>
  config.level.base + config.level.perBeast * (beast - 1) + config.level.perMode * mode

/** The row whose level is closest to `level`; on a tie the higher level, then the later row. */
export function closestByLevel<T extends { level: number }>(rows: readonly T[], level: number) {
  return rows.reduce((best, row) => {
    const gap = Math.abs(row.level - level) - Math.abs(best.level - level)
    return gap < 0 || (gap === 0 && row.level >= best.level) ? row : best
  })
}

export const ticketCost = (mode: number) => config.ticketCost[mode]!
export const TICKETS_PER_DAY = config.ticketsPerDay

/** Tickets used today after a fight in `mode`; refuses when the free tickets left cannot pay. */
export function spendTickets(usedToday: number, mode: number) {
  const used = usedToday + ticketCost(mode)
  if (used > TICKETS_PER_DAY)
    refuse('no_tickets', 'You do not have enough tickets left today. They reset at 00:00 UTC.')
  return used
}

/** Honor = floor(damage / 100,000); Essence gained = Honor gained. */
export const honorFor = (damage: number) => Math.floor(damage / config.honorPerDamage)

/** A fight-count box opens once, at its threshold (5, 10, 20). */
export const claimableBox = (fights: number, claimed: readonly number[], threshold: number) =>
  config.boxes.some((box) => box.fights === threshold) &&
  fights >= threshold &&
  !claimed.includes(threshold)
