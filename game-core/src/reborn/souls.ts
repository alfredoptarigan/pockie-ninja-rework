// Bloodline souls and prayer (M5 decisions 13, 15, 16). Constants:
// server/data/game/reborn/souls.json. Soul stat values live in `limitBonuses` (bloodlines.ts).
import data from '../../../server/data/game/reborn/souls.json'
import type { Random } from '../random.js'

export const SOUL_TYPE_COUNT = data.types.length

export interface Soul {
  type: number
  level: number
}

export interface PrayerState {
  level: number
  /** Points toward the next level. */
  progress: number
}

/** Decision 15: discoveries per UTC day. */
export const discoverPerDay = (vip: boolean) =>
  vip ? data.discover.perDayVip : data.discover.perDay

/** Decision 15: uniform type 1-13, level 1/2/3 at 70/25/5 %. */
export function rollSoul(random: Random): Soul {
  const type = 1 + random.int(SOUL_TYPE_COUNT)
  let roll = random.int(100)
  let level = 1
  for (const odds of data.discover.levelOdds) {
    if (roll < odds) break
    roll -= odds
    level++
  }
  return { type, level: Math.min(level, data.discover.levelOdds.length) }
}

/** Character level needed to socket a soul of `level` (decision 13: 91 clamped to 90). */
export const soulLevelGate = (level: number) => data.levelLimits[level - 1] ?? Infinity

/**
 * Levels of the souls produced by synthesizing `levels` in groups of 3 (input order), or null
 * when a group mixes levels, the count is not a positive multiple of 3, or a group is max level.
 */
export function synthesisGroups(levels: readonly number[]): number[] | null {
  const size = data.synthesis.count
  if (levels.length === 0 || levels.length % size !== 0) return null
  const out: number[] = []
  for (let i = 0; i < levels.length; i += size) {
    const group = levels.slice(i, i + size)
    const level = group[0]!
    if (group.some((l) => l !== level) || level >= data.synthesis.maxLevel) return null
    out.push(level + 1)
  }
  return out
}

/** One refine reroll: a uniformly random type other than `current`. */
export function refineType(current: number, random: Random) {
  const type = 1 + random.int(SOUL_TYPE_COUNT - 1)
  return type >= current ? type + 1 : type
}

/** Decision 16: points from `level` to `level + 1`. */
export const prayerNeeded = (level: number) => data.prayer.expBase * 2 ** level

/** Decision 16: prayer points one soul gives. */
export const prayerPoints = (soulLevel: number) =>
  data.prayer.soulExpBase * data.prayer.soulExpFactor ** (soulLevel - 1)

/** Adds `points`, levelling up as often as they reach; the max level keeps no progress. */
export function feedPrayer(state: PrayerState, points: number): PrayerState {
  let { level, progress } = state
  progress += points
  while (level < data.prayer.maxLevel && progress >= prayerNeeded(level)) {
    progress -= prayerNeeded(level)
    level++
  }
  return { level, progress: level >= data.prayer.maxLevel ? 0 : progress }
}
