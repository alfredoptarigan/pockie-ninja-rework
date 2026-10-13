// Decision 19: 7-day scrolls as a pub-fight combo prize. (Permanent scrolls sit in the
// i159000 pool of treasure-data.json; the Essence shop is the Tailed Beast event's.)
import type { Random } from '@pockie/game-core'
import { rebornScrollSkills } from './data.js'

/** Chance (percent) that a pub-fight combo also awards one 7-day scroll. */
export const SCROLL_COMBO_PERCENT = 5

/** The 12 seven-day scroll items (i540001-i540012). */
export const sevenDayScrolls = () =>
  Object.values(rebornScrollSkills())
    .map((row) => row.sevenDayItem)
    .sort()

/** A combo's extra prize: one random 7-day scroll at 5%, otherwise nothing. Bound like loot. */
export function scrollComboPrizes(random: Random): { itemId: string; bound: boolean }[] {
  if (random.int(100) >= SCROLL_COMBO_PERCENT) return []
  const items = sevenDayScrolls()
  return [{ itemId: items[random.int(items.length)]!, bound: true }]
}
