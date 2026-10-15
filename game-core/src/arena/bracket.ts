// Championship bracket (Reborn scene 6002): 16 slots, Round of 16 (slots 0-1, 2-3, ...),
// Quarterfinals, Semifinals and the Final, each pairing the previous round's winners in order. An
// empty side gives the other a bye; a match with nobody on either side has no winner (-1).

export const BRACKET_SLOTS = 16
export const BRACKET_ROUNDS = 4

/** Matches in round 1-4: 8, 4, 2, 1. */
export const matchesIn = (round: number) => BRACKET_SLOTS >> round

/**
 * The slot pairs of `round`. Round 1 pairs the slots; later rounds pair `previous`, the winning
 * slots of the round before in match order (-1 = no winner).
 */
export function pairings(round: number, previous: readonly number[] = []): [number, number][] {
  if (round === 1)
    return Array.from({ length: matchesIn(1) }, (_, i) => [2 * i, 2 * i + 1] as [number, number])
  if (previous.length !== matchesIn(round - 1))
    throw new Error(`Round ${round} needs ${matchesIn(round - 1)} winners`)
  return Array.from(
    { length: matchesIn(round) },
    (_, i) => [previous[2 * i]!, previous[2 * i + 1]!] as [number, number],
  )
}

/**
 * The winning slot of a match: a bye when one side is empty (not in `filled` or -1), -1 when both
 * are, else `fight()` decides (true = the first slot wins).
 */
export function matchWinner(
  [slot1, slot2]: [number, number],
  filled: ReadonlySet<number>,
  fight: () => boolean,
) {
  const one = slot1 >= 0 && filled.has(slot1)
  const two = slot2 >= 0 && filled.has(slot2)
  if (!one && !two) return -1
  if (!two) return slot1
  if (!one) return slot2
  return fight() ? slot1 : slot2
}

export interface BracketSchedule {
  registrationEndsAt: Date
  /** When round 1-4 is fought (index 0 = round 1). */
  roundsAt: Date[]
  battlingEndsAt: Date
  cooldownEndsAt: Date
}

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
const DAY_MS = 24 * HOUR_MS

/** One bracket per UTC day: registration from 00:00, a round every `roundMinutes`, then cooldown. */
export function bracketSchedule(
  day: string,
  { registrationHours, roundMinutes }: { registrationHours: number; roundMinutes: number },
): BracketSchedule {
  const start = Date.parse(`${day}T00:00:00Z`)
  const registrationEnds = start + registrationHours * HOUR_MS
  const roundsAt = Array.from(
    { length: BRACKET_ROUNDS },
    (_, i) => new Date(registrationEnds + i * roundMinutes * MINUTE_MS),
  )
  return {
    registrationEndsAt: new Date(registrationEnds),
    roundsAt,
    battlingEndsAt: new Date(registrationEnds + BRACKET_ROUNDS * roundMinutes * MINUTE_MS),
    cooldownEndsAt: new Date(start + DAY_MS),
  }
}

/** Rounds whose time has come (0-4). */
export const roundsDue = (roundsAt: readonly Date[], now: Date) =>
  roundsAt.filter((at) => at.getTime() <= now.getTime()).length

export type BracketPhase = 'registration' | 'battling' | 'cooldown'

export function bracketPhase(
  schedule: Pick<BracketSchedule, 'registrationEndsAt' | 'battlingEndsAt'>,
  now: Date,
): BracketPhase {
  if (now < schedule.registrationEndsAt) return 'registration'
  return now < schedule.battlingEndsAt ? 'battling' : 'cooldown'
}
