// Scroll Dungeons rules: the daily boss rotation and the scroll roll with its pity.
import { createRandom, type Random } from '@pockie/game-core'
import { DUNGEON_RULES, type DungeonDrop } from '../../../../shared/src/schemas/dungeons.js'
import { BASE_CHANCE } from './bosses.js'

/** Pity steps (wins without a scroll) that reach the 10% cap from the 2% base. */
export const MAX_PITY = (DUNGEON_RULES.maxChance - BASE_CHANCE) / DUNGEON_RULES.pityStep

/** Today's bosses: the same for everyone on a UTC day (seeded by the date). */
export function todaysBosses(day: string): number[] {
  const random = createRandom(Number(day.replaceAll('-', '')))
  const pool = Array.from({ length: DUNGEON_RULES.bossCount }, (_, i) => i)
  return Array.from(
    { length: DUNGEON_RULES.bossesPerDay },
    () => pool.splice(random.int(pool.length), 1)[0]!,
  )
}

/** Timed scroll chance in percent after `pity` wins without a scroll. */
export const chanceOf = (base: number, pity: number) =>
  Math.min(base + pity * DUNGEON_RULES.pityStep, DUNGEON_RULES.maxChance)

/**
 * A won fight's roll: each drop rolls its timed scroll at the pity chance and, independently, its
 * permanent scroll at 0.1%. Any scroll resets the boss's pity; none adds a step (capped).
 */
export function rollDrops(drops: readonly DungeonDrop[], pity: number, random: Random) {
  const items = drops.flatMap((drop) => {
    const timed = random.next() * 100 < chanceOf(drop.chance, pity)
    const permanent = random.next() * 100 < DUNGEON_RULES.permanentChance
    return [...(timed ? [drop.itemId] : []), ...(permanent ? [drop.permanentItemId] : [])]
  })
  return { items, pity: items.length > 0 ? 0 : Math.min(pity + 1, MAX_PITY) }
}
