// Geometry of the original world map painting (gameWorldMap, tools/assets/EXTRA.md). Places are
// rectangles in painting coordinates; the window draws them as percentages of the drawn art, so
// art and rectangles always scale together.
import { gameWorldMap } from '../generated/game-extra'

export interface MapRect {
  x: number
  y: number
  width: number
  height: number
  depth: number
}

interface Size {
  width: number
  height: number
}

/** Painting coordinates of a pointer over the map drawn in `box` (its client rectangle). */
export function toPainting(
  clientX: number,
  clientY: number,
  box: Size & { left: number; top: number },
  size: Size = gameWorldMap,
) {
  return {
    x: ((clientX - box.left) * size.width) / box.width,
    y: ((clientY - box.top) * size.height) / box.height,
  }
}

/** Scene under a painting point. Overlaps go to the higher depth, as in the Flash display list. */
export function locationAt(locations: Record<string, MapRect>, x: number, y: number) {
  let found: { sceneId: number; depth: number } | undefined
  for (const [id, r] of Object.entries(locations)) {
    const inside = x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height
    if (inside && (!found || r.depth > found.depth)) found = { sceneId: Number(id), depth: r.depth }
  }
  return found?.sceneId
}

const percent = (value: number, of: number) => `${(value / of) * 100}%`

/** CSS box of a painting rectangle, in percent of the drawn painting. */
export const percentBox = (r: MapRect, size: Size = gameWorldMap) => ({
  left: percent(r.x, size.width),
  top: percent(r.y, size.height),
  width: percent(r.width, size.width),
  height: percent(r.height, size.height),
})
