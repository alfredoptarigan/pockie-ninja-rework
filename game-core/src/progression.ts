import type { Random } from './random.js'

/**
 * Adds EXP and levels up (LevelSystem.java). EXP is per level: reaching level L+1 costs
 * levelExp[L+1] and the remainder carries over.
 */
export function gainExp(
  level: number,
  exp: number,
  gained: number,
  levelExp: Record<string, number>,
  maxLevel: number,
) {
  let current = level
  let pool = exp + gained
  while (current < maxLevel) {
    const cost = levelExp[String(current + 1)]
    if (cost === undefined || pool < cost) break
    pool -= cost
    current++
  }
  return { level: current, exp: pool, levelsGained: current - level }
}

export interface DropLib {
  ItemDropType: number
  DropCount: number
}

export interface DropEntry {
  ItemConfig: string
  Probability: number
  BindingStatus: number
}

const INDEPENDENT_ROLL_RANGE = 1_000_000

/**
 * DropSystem.java: type 1 gives every entry when there are at most DropCount of them, otherwise
 * DropCount weighted picks without replacement; type 2 rolls each entry out of 1,000,000.
 * Entries with probability <= 0 never drop.
 */
export function rollDrops(lib: DropLib, entries: DropEntry[], random: Random) {
  const pool = entries.filter((entry) => entry.Probability > 0)
  const toDrop = (entry: DropEntry) => ({
    itemId: entry.ItemConfig,
    bound: entry.BindingStatus === 1,
  })

  if (lib.ItemDropType === 2) {
    return pool
      .filter((entry) => random.int(INDEPENDENT_ROLL_RANGE) < entry.Probability)
      .map(toDrop)
  }
  if (pool.length <= lib.DropCount) return pool.map(toDrop)

  const picked: DropEntry[] = []
  let remaining = [...pool]
  for (let i = 0; i < lib.DropCount; i++) {
    const total = remaining.reduce((sum, entry) => sum + entry.Probability, 0)
    let roll = random.int(total)
    const choice = remaining.find((entry) => (roll -= entry.Probability) < 0)!
    picked.push(choice)
    remaining = remaining.filter((entry) => entry !== choice)
  }
  return picked.map(toDrop)
}
