// Impel Down rules: lives and refreshes per UTC day, the crystal roll and Auto Sell.
import type { Random } from '@pockie/game-core'
import { crystalInfo } from '../../../../game-core/src/zanpakuto/zanpakuto.js'
import { IMPEL_DOWN_RULES } from '../../../../shared/src/schemas/impel-down.js'
import { utcDay } from '../gates/common.js'

/** A count kept for one UTC day: zero on any other day. */
export const usedToday = (day: string | null, used: number, now: Date) =>
  day === utcDay(now) ? used : 0

export const floorsCleared = (gate: number, floor: number) =>
  gate * IMPEL_DOWN_RULES.floorsPerGate + floor

/**
 * One roll over a floor's table ([iid, chance %]): the crystal, or null. A guaranteed table rolls
 * within its own total, so rounded chances (3 x 33.33) still always drop.
 */
export function rollCrystal(
  drops: readonly [number, number][],
  guaranteed: boolean,
  random: Random,
): number | null {
  const total = drops.reduce((sum, [, chance]) => sum + chance, 0)
  let roll = random.next() * (guaranteed ? total : 100)
  for (const [iid, chance] of drops) {
    if (roll < chance) return iid
    roll -= chance
  }
  return null
}

/** Auto Sell `tier` (1 Blue, 2 Purple, 3 Orange; 0 off) sells crystals of that tier and below. */
export const autoSells = (iid: number, tier: number) => crystalInfo(iid)!.category < tier
