// Wing and aura enhancement (M6 decision 24). Pure, with no data imports, so the client can show
// the same odds the server rolls.
import type { Random } from '../random.js'
import { FAILURE_BY_LEVEL, SUCCESS_BY_TARGET, WING_MAX_LEVEL } from './constants.js'

export type WingOutcome = 'success' | 'fail' | 'decrease' | 'reset' | 'destroy'

/** Talisman values: Luck is a success bonus %, Safety and Integrity reduction %. */
export interface WingTalismans {
  luck?: number
  safety?: number
  integrity?: number
}

/** Rolled in this order; fail takes what is left. */
const ORDER: readonly WingOutcome[] = ['success', 'decrease', 'reset', 'destroy', 'fail']

/** Chance of each outcome in %, summing to 100. */
export function enhanceOdds(
  level: number,
  levelJump: number,
  { luck = 0, safety = 0, integrity = 0 }: WingTalismans = {},
): Record<WingOutcome, number> {
  if (level >= WING_MAX_LEVEL) throw new RangeError('The wing is already at the top level.')
  const target = Math.min(level + levelJump, WING_MAX_LEVEL)
  const base = SUCCESS_BY_TARGET.find((band) => target <= band.upTo)!.success
  const success = Math.min(100, base * (1 + luck / 100))
  const failed = (100 - success) / 100
  const band = FAILURE_BY_LEVEL.find((row) => level >= row.from)!
  const decrease = failed * band.decrease * (1 - safety / 100)
  const reset = failed * band.reset * (1 - safety / 100)
  const destroy = failed * band.destroy * (1 - integrity / 100)
  return { success, decrease, reset, destroy, fail: 100 - success - decrease - reset - destroy }
}

/** One attempt: the new level, or null when the wing is destroyed. */
export function enhance(
  level: number,
  stone: { levelJump: number },
  talismans: WingTalismans,
  random: Random,
): { outcome: WingOutcome; level: number | null } {
  const odds = enhanceOdds(level, stone.levelJump, talismans)
  const roll = random.next() * 100
  let edge = 0
  const outcome =
    ORDER.find((name) => {
      edge += odds[name]
      return roll < edge
    }) ?? 'fail'
  const after = {
    success: Math.min(level + stone.levelJump, WING_MAX_LEVEL),
    fail: level,
    decrease: Math.max(0, level - 1),
    reset: 0,
    destroy: null,
  }[outcome]
  return { outcome, level: after }
}
