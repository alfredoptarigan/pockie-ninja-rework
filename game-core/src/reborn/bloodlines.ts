// Bloodline stat aggregation (M5 decisions 11, 15, 16). Constants:
// server/data/game/reborn/{bloodlines,souls}.json, already mapped to our fields and scale.
import bloodlines from '../../../server/data/game/reborn/bloodlines.json'
import souls from '../../../server/data/game/reborn/souls.json'
import type { Bonuses } from '../stats.js'

export const BLOODLINES = bloodlines
export const SOULS = souls

type Field = keyof Bonuses
type Attribute = 'strength' | 'agility' | 'stamina'

export interface SocketedSoul {
  type: number
  level: number
  /** Limit the soul is socketed in; null when it sits in the inventory. */
  limit: number | null
}

export interface Prayer {
  limit: number
  attribute: Attribute
  level: number
}

const limits = new Map(bloodlines.limits.map((l) => [l.id, l]))
const soulTypes = new Map(souls.types.map((t) => [t.id, t]))

/**
 * Bonuses of the active limits: base Str/Agi/Sta, bonus stats, socketed soul values and the
 * prayer bonus. Everything is summed first, then truncated, like equipment.
 */
export function limitBonuses(
  activeLimits: readonly number[],
  socketed: readonly SocketedSoul[] = [],
  prayers: readonly Prayer[] = [],
): Partial<Bonuses> {
  const active = new Set(activeLimits)
  const sum: Partial<Record<Field, number>> = {}
  const add = (field: string, value: number) => {
    sum[field as Field] = (sum[field as Field] ?? 0) + value
  }
  for (const id of active) {
    const limit = limits.get(id)
    if (!limit) continue
    for (const [field, value] of Object.entries(limit.base)) add(field, value)
    for (const bonus of limit.bonus) add(bonus.field, bonus.value)
  }
  for (const soul of socketed) {
    const type = soulTypes.get(soul.type)
    const value = type?.valueByLevel[soul.level]
    if (soul.limit !== null && active.has(soul.limit) && value !== undefined)
      add(type!.field, value)
  }
  for (const prayer of prayers) {
    if (active.has(prayer.limit)) add(prayer.attribute, souls.prayer.bonusPerLevel * prayer.level)
  }
  return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.trunc(v)]))
}
