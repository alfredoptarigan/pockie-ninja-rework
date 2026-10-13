// PackSystem: two initially active 60-cell pages. See docs/original-data/bag.md.
import { and, eq, isNull } from 'drizzle-orm'
import { inventoryItems } from '../db/schema.js'
import { HttpError } from '../http.js'
import { item } from './data.js'
import type { GrantedItem } from './gear.js'
import type { Tx } from './progress.js'

export const BAG_CELLS = 120
export const itemCells = (itemId: string) => Number(item(itemId)?.ItemShapeType ?? 1)
export const itemStackSize = (itemId: string) =>
  itemCells(itemId) === 1 ? Number(item(itemId)?.ItemMaxFoldNum ?? 1) : 1

export interface BagOptions {
  reserve?: number
  separate?: boolean
  message?: string
}

/** Simulates the same stack placement as grantItems; equipped items occupy no bag cells. */
export async function bagFits(
  tx: Tx,
  characterId: string,
  awards: readonly GrantedItem[],
  { reserve = 0, separate = false }: BagOptions = {},
) {
  const bag = await tx
    .select({
      itemId: inventoryItems.itemId,
      bound: inventoryItems.bound,
      count: inventoryItems.count,
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.characterId, characterId), isNull(inventoryItems.equippedSlot)))
  const rows = bag.map((row) => ({ ...row }))
  let used = rows.reduce((sum, row) => sum + itemCells(row.itemId), 0)
  for (const award of awards) {
    const max = itemStackSize(award.itemId)
    const stack =
      !separate &&
      rows.find(
        (row) => row.itemId === award.itemId && row.bound === award.bound && row.count < max,
      )
    if (stack) stack.count++
    else {
      used += itemCells(award.itemId)
      rows.push({ itemId: award.itemId, bound: award.bound, count: 1 })
    }
  }
  return used + reserve <= BAG_CELLS
}

export async function requireBagRoom(
  tx: Tx,
  characterId: string,
  awards: readonly GrantedItem[],
  opts: BagOptions = {},
) {
  if (!(await bagFits(tx, characterId, awards, opts)))
    throw new HttpError(400, 'bag_full', opts.message ?? 'Your bag is full.')
}
