// Reborn bag geometry: 10 pages of 10x6 tiles; an item covers a w x h rectangle from its top-left
// tile. Pure functions; the database side lives in bag.ts (placeBag).
import { BAG_PAGE_COLUMNS, BAG_PAGE_COUNT, BAG_PAGE_ROWS, BAG_PAGE_SLOTS } from '@pockie/shared'
import { item } from './data.js'

/** PackSystem: two initially active 60-cell pages (docs/original-data/bag.md). */
export const BAG_CELLS = 120
/** Pages items may be moved to; later pages only hold overflow. */
export const USABLE_PAGES = BAG_CELLS / BAG_PAGE_SLOTS

export interface Size {
  w: number
  h: number
}
export interface Spot {
  page: number
  slot: number
}
export type Placed = Spot & Size

const ONE: Size = { w: 1, h: 1 }
const FOOTPRINTS: Record<number, Size> = { 1: ONE, 4: { w: 2, h: 2 }, 6: { w: 2, h: 3 } }

/** Footprint by ItemShapeType: 4 = 2x2, 6 = 2 wide and 3 tall, anything else 1x1. */
export const footprint = (itemId: string): Size =>
  FOOTPRINTS[Number(item(itemId)?.ItemShapeType)] ?? ONE

/** Tiles of `page` covered by `items` (true = taken). */
export function occupancy(items: readonly Placed[], page: number) {
  const grid = Array<boolean>(BAG_PAGE_SLOTS).fill(false)
  for (const placed of items.filter((p) => p.page === page)) {
    for (let dy = 0; dy < placed.h; dy++)
      for (let dx = 0; dx < placed.w; dx++) grid[placed.slot + dy * BAG_PAGE_COLUMNS + dx] = true
  }
  return grid
}

/** Whether a `size` rectangle with its top-left at `slot` stays on the page and covers free tiles. */
export function fits(occupied: readonly boolean[], slot: number, { w, h }: Size) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= BAG_PAGE_SLOTS) return false
  const column = slot % BAG_PAGE_COLUMNS
  const row = Math.floor(slot / BAG_PAGE_COLUMNS)
  if (column + w > BAG_PAGE_COLUMNS || row + h > BAG_PAGE_ROWS) return false
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) if (occupied[slot + dy * BAG_PAGE_COLUMNS + dx]) return false
  return true
}

/** The first spot (page by page, row-major) in pages [fromPage, toPage) where `size` fits. */
export function firstFit(
  items: readonly Placed[],
  size: Size,
  fromPage = 0,
  toPage = USABLE_PAGES,
): Spot | null {
  for (let page = fromPage; page < Math.min(toPage, BAG_PAGE_COUNT); page++) {
    const grid = occupancy(items, page)
    for (let slot = 0; slot < BAG_PAGE_SLOTS; slot++)
      if (fits(grid, slot, size)) return { page, slot }
  }
  return null
}

/** First fit on the usable pages, else on the overflow pages. */
export const firstFitAnywhere = (items: readonly Placed[], size: Size) =>
  firstFit(items, size) ?? firstFit(items, size, USABLE_PAGES, BAG_PAGE_COUNT)
