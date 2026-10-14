// Wing and aura stats (M6 decision 23): WING.Line[line][level], already mapped to our fields.
// counter, vampiricHp and decDamage are percents in the engine (fight.ts, damage.ts), like
// Reborn's, so they stay 1:1; sum first, then truncate (1.2 counts as 1).
import wingLines from '../../../server/data/game/reborn/wing-lines.json'
import wings from '../../../server/data/game/reborn/wings.json'
import type { Bonuses } from '../stats.js'
import { WING_MAX_LEVEL } from './constants.js'

const lines = wingLines as Record<string, { field: string; value: number }[][]>
const byItem = new Map([...wings.wings, ...wings.auras].map((row) => [row.item, row]))

/** Bonuses of a wing or aura at an enhance level; `{}` for any other item. */
export function wingStats(itemId: string, level: number): Partial<Bonuses> {
  const row = byItem.get(itemId)
  const stats = row && lines[String(row.line)]?.[Math.min(level + row.bonus, WING_MAX_LEVEL)]
  if (!stats) return {}
  const sum: Record<string, number> = {}
  for (const { field, value } of stats) sum[field] = (sum[field] ?? 0) + value
  return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.trunc(v)]))
}
