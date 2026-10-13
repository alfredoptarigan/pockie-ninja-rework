// Limit item source (M5 decision 14): the Slot Machine is our pub fight. Reborn's bands
// (SM Lv16/26/31/41/61/71) are compared with the pub-fight scene's level (2601 = 16, 2605 = 26,
// 2602 = 31, 2604 = 41, 2704 = 61, 2802 = 71).
import type { Random } from '@pockie/game-core'

/** Chance (percent) that a pub-fight win gives 1 limit item. */
export const LIMIT_ITEM_WIN_PERCENT = 30
/** Items of one kind a matched combo pull adds. */
export const LIMIT_ITEM_COMBO_COUNT = 4

/** Limit item -> lowest pub-fight scene level that drops it (Reborn's "SM LvN+"). */
export const LIMIT_ITEM_BANDS: Record<string, number> = {
  i148023: 16,
  i148024: 16,
  i148025: 26,
  i148026: 26,
  i148027: 31,
  i148028: 31,
  i148029: 31,
  i148030: 31,
  i148031: 41,
  i148032: 41,
  i148033: 41,
  i148034: 41,
  i148035: 61,
  i148036: 61,
  i148037: 61,
  i148038: 71,
  i148039: 71,
  i148040: 71,
}

const eligible = (sceneLevel: number) =>
  Object.keys(LIMIT_ITEM_BANDS).filter((id) => LIMIT_ITEM_BANDS[id]! <= sceneLevel)

/**
 * Limit items for a pub-fight win (30%: 1 item) or, with `combo`, a matched combo pull (4 of one
 * item). Bound like other fight loot.
 */
export function limitItemDrops(
  sceneLevel: number,
  random: Random,
  { combo = false }: { combo?: boolean } = {},
): { itemId: string; bound: boolean }[] {
  const items = eligible(sceneLevel)
  if (items.length === 0) return []
  if (!combo && random.int(100) >= LIMIT_ITEM_WIN_PERCENT) return []
  const itemId = items[random.int(items.length)]!
  return Array.from({ length: combo ? LIMIT_ITEM_COMBO_COUNT : 1 }, () => ({ itemId, bound: true }))
}
