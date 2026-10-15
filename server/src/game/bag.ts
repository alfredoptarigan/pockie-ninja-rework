// PackSystem: two initially active 60-cell pages. See docs/original-data/bag.md.
import type { BagItemInfo, InventoryItemView } from '@pockie/shared'
import { and, asc, eq, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import { characters, inventoryItems } from '../db/schema.js'
import { HttpError } from '../http.js'
import {
  BAG_CELLS,
  firstFitAnywhere,
  fits,
  footprint,
  occupancy,
  type Placed,
  type Spot,
} from './bag-grid.js'
import { avatarStats, item, itemNameKey } from './data.js'
import type { GrantedItem } from './gear.js'
import { OUTFIT_SLOT, outfitOf } from './outfit.js'
import type { Tx } from './progress.js'

/** Inventory ownership includes market storage; bag reads must use these predicates. */
export const bagItemsWhere = (characterId: string) =>
  and(eq(inventoryItems.characterId, characterId), eq(inventoryItems.location, 'bag'))
export const unequippedBagItemsWhere = (characterId: string) =>
  and(bagItemsWhere(characterId), isNull(inventoryItems.equippedSlot))
/**
 * What the character wears: the rows worn in its active equipment set (Reborn loadouts). Rows
 * worn in the other sets stay out of the bag but count for nothing.
 */
export const wornItemsWhere = (characterId: string) =>
  and(
    bagItemsWhere(characterId),
    isNotNull(inventoryItems.equippedSlot),
    eq(
      inventoryItems.equippedSet,
      sql`(select ${characters.activeSet} from ${characters} where ${characters.id} = ${characterId})`,
    ),
  )
/** wornItemsWhere for a row already loaded. */
export const isWornIn = (row: Pick<ItemRow, 'equippedSlot' | 'equippedSet'>, activeSet: number) =>
  row.equippedSlot !== null && row.equippedSet === activeSet

export { BAG_CELLS }
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
    .where(unequippedBagItemsWhere(characterId))
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

type ItemRow = typeof inventoryItems.$inferSelect

/** Whether the outfit's weapon class may use the item (UsePopsinger bit mask, -1 any). */
export function fitsOutfit(def: NonNullable<ReturnType<typeof item>>, avatarId: number) {
  const allowed = Number(def.UsePopsinger)
  return allowed === -1 || (allowed & avatarStats(avatarId).Popsinger) !== 0
}

export function itemInfo(itemId: string): BagItemInfo {
  const def = item(itemId)
  const itemClass = String(def?.class ?? '')
  const outfit = outfitOf(itemId)
  const equip = itemClass === 'EquipItem'
  const usable = Number(def?.CanUse) === 1 && !outfit
  return {
    kind: equip || outfit ? 'equip' : usable ? 'use' : 'other',
    equipSlot: outfit ? OUTFIT_SLOT : equip ? String(def!.EquipType) : null,
    level: outfit ? outfit.level : Number(def?.UseLevel ?? 0),
    ...(outfit && { outfit: { clothing: outfit.clothing, plus: outfit.plus } }),
    sellPrice: (Number(def?.CanTrade ?? 0) & 1) !== 0 ? Number(def?.Price ?? 0) : null,
    stack: itemStackSize(itemId),
    ...footprint(itemId),
    class: itemClass,
  }
}

/** The stored top-left tile of a row, or null when it has none. */
export const spotOf = (row: Pick<ItemRow, 'bagPage' | 'bagSlot'>): Spot | null =>
  row.bagPage === null || row.bagSlot === null ? null : { page: row.bagPage, slot: row.bagSlot }

/** The rectangles of the given rows that have a position. */
export const rectsOf = (rows: readonly ItemRow[]): Placed[] =>
  rows.flatMap((row) => {
    const spot = spotOf(row)
    return spot ? [{ ...spot, ...footprint(row.itemId) }] : []
  })

/** Unequipped bag rows, oldest first (the stable placement order). */
export const unequippedBagRows = (tx: Tx, characterId: string, except: string[] = []) =>
  tx
    .select()
    .from(inventoryItems)
    .where(
      and(
        unequippedBagItemsWhere(characterId),
        except.length ? notInArray(inventoryItems.id, except) : undefined,
      ),
    )
    .orderBy(asc(inventoryItems.createdAt), asc(inventoryItems.id))

export const setSpot = (tx: Tx, id: string, spot: Spot | null) =>
  tx
    .update(inventoryItems)
    .set({ bagPage: spot?.page ?? null, bagSlot: spot?.slot ?? null })
    .where(eq(inventoryItems.id, id))

/** Puts `row` with its top-left at `spot` when that is free of every other item; returns success. */
export async function placeAt(tx: Tx, characterId: string, row: ItemRow, spot: Spot) {
  const others = rectsOf(await unequippedBagRows(tx, characterId, [row.id]))
  if (!fits(occupancy(others, spot.page), spot.slot, footprint(row.itemId))) return false
  await setSpot(tx, row.id, spot)
  return true
}

/**
 * Gives every unplaced unequipped bag row a position, first-fit on the usable pages, else on the
 * first overflow page with room. Grants insert unplaced rows, so every bag read calls this.
 * The caller holds the character lock so two placements cannot pick the same tiles.
 */
export async function placeBag(tx: Tx, characterId: string) {
  const rows = await unequippedBagRows(tx, characterId)
  const placed = rectsOf(rows)
  for (const row of rows.filter((r) => !spotOf(r))) {
    const size = footprint(row.itemId)
    // ponytail: with all 10 pages full the row stays unplaced until something frees room.
    const spot = firstFitAnywhere(placed, size)
    if (!spot) continue
    placed.push({ ...spot, ...size })
    await setSpot(tx, row.id, spot)
  }
}

/** GET /api/game/inventory rows (bag and equipped), after placing new items. */
export async function inventoryView(
  tx: Tx,
  character: { id: string; avatarId: number },
): Promise<{ items: InventoryItemView[] }> {
  await placeBag(tx, character.id)
  const rows = await tx
    .select()
    .from(inventoryItems)
    .where(bagItemsWhere(character.id))
    .orderBy(asc(inventoryItems.createdAt), asc(inventoryItems.id))
  return { items: rows.map((row) => itemView(row, character.avatarId)) }
}

/** One inventory row as the client sees it; `avatarId` is the wearer's (fitsOutfit). */
export function itemView(row: ItemRow, avatarId: number): InventoryItemView {
  const def = item(row.itemId)
  return {
    id: row.id,
    itemId: row.itemId,
    count: row.count,
    bound: row.bound,
    equippedSlot: row.equippedSlot,
    equippedSet: row.equippedSlot ? row.equippedSet : null,
    nameKey: itemNameKey(row.itemId),
    ...(def?.class === 'EquipItem' ? { fitsOutfit: fitsOutfit(def, avatarId) } : {}),
    page: row.bagPage,
    slot: row.bagSlot,
    locked: row.locked,
    info: itemInfo(row.itemId),
  }
}
