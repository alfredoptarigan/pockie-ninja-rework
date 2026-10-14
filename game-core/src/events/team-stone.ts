// Team Stone (M5 decision 28): the score rule, leagues, fighter power and the matchmaking plan.
// Pure; the server applies them (server/src/modules/team-stone/).

/** Score moves 18..22: +20/-20 even, +22/-18 vs a 20% stronger team, +18/-22 vs 20% weaker. */
const EVEN_DELTA = 20
const SWING = 2
const RATIO_SPAN = 0.2

/**
 * Score change of a team with power `own` against `enemy`: linear in enemy/own between 0.8 and
 * 1.2, flat outside; rounded to whole points.
 */
export function scoreDelta(own: number, enemy: number, won: boolean) {
  const ratio = own > 0 ? enemy / own : 1
  const t = Math.max(-1, Math.min(1, (ratio - 1) / RATIO_SPAN))
  const gain = Math.round(EVEN_DELTA + SWING * t)
  return won ? gain : -(2 * EVEN_DELTA - gain)
}

/** Index of the highest league whose `minScore` the score meets (`minScores` ascending). */
export function leagueIndex(minScores: readonly number[], score: number) {
  let index = 0
  for (const [i, min] of minScores.entries()) if (score >= min) index = i
  return index
}

/** HP plus 10x the average attack; our measure (Reborn's formula was not captured). */
export const fighterPower = (fighter: { maxHp: number; minAttack: number; maxAttack: number }) =>
  Math.trunc(fighter.maxHp + 5 * (fighter.minAttack + fighter.maxAttack))

/**
 * Bot-fill delay of a queue entry, min..max seconds, derived from its queue time so every job run
 * sees the same delay.
 */
export const fillDelayMs = (queuedAt: number, [min, max]: readonly [number, number]) =>
  min * 1000 + (Math.abs(Math.trunc(queuedAt)) % ((max - min) * 1000 + 1))

export interface QueuedNinja {
  id: string
  score: number
  /** Epoch ms. */
  queuedAt: number
}

export interface MatchPlan {
  /** Queued ninjas per side, in fight order. */
  sides: [string[], string[]]
  /** Arena snapshots each side still needs. */
  bots: [number, number]
  /** Average score of the queued ninjas (bots are picked near it). */
  score: number
}

const TEAM = 3
const MATCH = 2 * TEAM

/**
 * Plans matches from the waiting queue: the longest-waiting ninja takes the 5 closest scores; with
 * fewer than 5 left, they are matched with whoever is there once their fill delay has passed and
 * bots fill the rest. Every ninja appears in at most one plan.
 */
export function planMatches(
  waiting: readonly QueuedNinja[],
  now: number,
  fillSeconds: readonly [number, number],
): MatchPlan[] {
  const left = [...waiting].sort((a, b) => a.queuedAt - b.queuedAt || a.id.localeCompare(b.id))
  const plans: MatchPlan[] = []
  for (let i = 0; i < left.length;) {
    const head = left[i]!
    const others = left
      .filter((n) => n !== head)
      .sort((a, b) => Math.abs(a.score - head.score) - Math.abs(b.score - head.score))
    const full = others.length >= MATCH - 1
    if (!full && now - head.queuedAt < fillDelayMs(head.queuedAt, fillSeconds)) {
      i++
      continue
    }
    const group = [head, ...others.slice(0, MATCH - 1)]
    const sides = full ? splitEven(group) : [group.slice(0, TEAM), group.slice(TEAM)]
    plans.push({
      sides: [sides[0]!.map((n) => n.id), sides[1]!.map((n) => n.id)],
      bots: [TEAM - sides[0]!.length, TEAM - sides[1]!.length],
      score: Math.round(group.reduce((sum, n) => sum + n.score, 0) / group.length),
    })
    for (const n of group) left.splice(left.indexOf(n), 1)
    i = 0
  }
  return plans
}

/** Six ninjas by score desc into 1st, 4th, 5th against 2nd, 3rd, 6th. */
function splitEven(group: QueuedNinja[]) {
  const s = [...group].sort((a, b) => b.score - a.score)
  return [
    [s[0]!, s[3]!, s[4]!],
    [s[1]!, s[2]!, s[5]!],
  ]
}
