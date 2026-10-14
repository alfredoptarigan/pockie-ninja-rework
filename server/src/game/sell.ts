// Selling bag items to the game for Stone (shop Sell/Sell All and the bag's Multi Sell).
import { and, eq, sql } from 'drizzle-orm'
import { characters, inventoryItems } from '../db/schema.js'
import { HttpError } from '../http.js'
import { item } from './data.js'
import type { Tx } from './progress.js'

type ItemRow = typeof inventoryItems.$inferSelect

/** Unequipped, unlocked bag items whose CanTrade allows selling to a shop (bit 1). */
export const canSell = (row: ItemRow) =>
  row.location === 'bag' &&
  !row.equippedSlot &&
  !row.locked &&
  (Number(item(row.itemId)?.CanTrade ?? 0) & 1) !== 0

/** Takes `count` of each row and pays Price x count Stone; returns the Stone earned. */
export async function sellRows(
  tx: Tx,
  characterId: string,
  sales: readonly { row: ItemRow; count: number }[],
) {
  let earned = 0
  for (const { row, count } of sales) {
    earned += Number(item(row.itemId)?.Price ?? 0) * count
    const unchanged = and(eq(inventoryItems.id, row.id), eq(inventoryItems.count, row.count))
    const taken =
      count === row.count
        ? await tx.delete(inventoryItems).where(unchanged).returning({ id: inventoryItems.id })
        : await tx
            .update(inventoryItems)
            .set({ count: row.count - count })
            .where(unchanged)
            .returning({ id: inventoryItems.id })
    if (!taken.length) throw new HttpError(409, 'conflict', 'That item changed. Try again.')
  }
  await tx
    .update(characters)
    .set({ stone: sql`${characters.stone} + ${earned}` })
    .where(eq(characters.id, characterId))
  return earned
}
