// Reborn's bag page: 60 tiles of 27px, 10 per row (docs/original-data/bag.md, PackSystem
// MaxPackBoxCap = 60). An item covers a rectangle of tiles set by its icon: 24px icons one tile,
// 51px icons 2x2, weapons (51x78) 2x3.
// ponytail: positions are laid out on the client, first-fit in bag order; the server keeps no
// tile positions, so dragging items around would need a schema change.

export const BAG_COLUMNS = 10
export const BAG_ROWS = 6
export const TILE = 27

export interface Footprint {
  w: number
  h: number
}

export interface Placed<T> {
  item: T
  x: number
  y: number
  w: number
  h: number
}

/** Tiles an icon covers; items without an icon take the common 2x2. */
export const footprint = (icon: { width: number; height: number } | undefined): Footprint =>
  icon ? { w: Math.ceil(icon.width / TILE), h: Math.ceil(icon.height / TILE) } : { w: 2, h: 2 }

function place(taken: boolean[], { w, h }: Footprint) {
  for (let y = 0; y + h <= BAG_ROWS; y++) {
    for (let x = 0; x + w <= BAG_COLUMNS; x++) {
      let free = true
      for (let dy = 0; dy < h && free; dy++)
        for (let dx = 0; dx < w && free; dx++) free = !taken[(y + dy) * BAG_COLUMNS + x + dx]
      if (free) return { x, y }
    }
  }
  return null
}

/** Pages of placed items: each item goes to the first page and tile where it fits. */
export function layoutBag<T>(items: readonly T[], size: (item: T) => Footprint): Placed<T>[][] {
  const pages: { taken: boolean[]; placed: Placed<T>[] }[] = []
  for (const item of items) {
    const cells = size(item)
    let spot: { x: number; y: number } | null = null
    let page = pages.find((candidate) => (spot = place(candidate.taken, cells)))
    if (!page) {
      page = { taken: [], placed: [] }
      pages.push(page)
      // An item larger than a page still gets a page of its own.
      spot = place(page.taken, cells) ?? { x: 0, y: 0 }
    }
    const { x, y } = spot!
    for (let dy = 0; dy < cells.h; dy++)
      for (let dx = 0; dx < cells.w; dx++) page.taken[(y + dy) * BAG_COLUMNS + x + dx] = true
    page.placed.push({ item, x, y, ...cells })
  }
  return pages.length ? pages.map((page) => page.placed) : [[]]
}
