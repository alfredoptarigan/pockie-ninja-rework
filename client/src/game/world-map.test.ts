import { describe, expect, it } from 'vitest'
import { gameWorldMap } from '../generated/game-extra'
import { locationAt, percentBox, toPainting } from './world-map'

const rect = (x: number, y: number, width: number, height: number, depth: number) => ({
  x,
  y,
  width,
  height,
  depth,
})

describe('locationAt', () => {
  // Listed low depth last, so the result cannot come from listing order.
  const locations = { '1': rect(50, 50, 100, 100, 9), '2': rect(0, 0, 100, 100, 3) }

  it('tests the higher depth first where rectangles overlap', () => {
    expect(locationAt(locations, 75, 75)).toBe(1)
    expect(locationAt({ '2': locations['2'], '1': locations['1'] }, 75, 75)).toBe(1)
  })

  it('finds the only rectangle under a point, or nothing', () => {
    expect(locationAt(locations, 10, 10)).toBe(2)
    expect(locationAt(locations, 140, 140)).toBe(1)
    expect(locationAt(locations, 300, 10)).toBeUndefined()
  })

  it('follows the Flash display order on the exported map', () => {
    // Water Village (depth 10) and Verdant Alley (depth 12) overlap here.
    expect(locationAt(gameWorldMap.locations, 650, 320)).toBe(2201)
    expect(locationAt(gameWorldMap.locations, 700, 340)).toBe(121)
  })
})

describe('scaling', () => {
  it('maps a pointer on the drawn map back to painting coordinates', () => {
    const half = { left: 100, top: 50, width: 384, height: 213 }
    expect(toPainting(100 + 192, 50 + 100, half)).toEqual({ x: 384, y: 200 })
    const double = { left: 0, top: 0, width: 1536, height: 852 }
    expect(toPainting(300, 400, double)).toEqual({ x: 150, y: 200 })
  })

  it('places rectangles as percentages, so they scale with the art', () => {
    expect(percentBox(rect(192, 106.5, 384, 213, 1))).toEqual({
      left: '25%',
      top: '25%',
      width: '50%',
      height: '50%',
    })
  })

  it('agrees with the hit test at any drawn size', () => {
    const box = { left: 20, top: 30, width: 500, height: 500 * (426 / 768) }
    const { x, y, width, height } = gameWorldMap.locations['2101']!
    const centre = toPainting(
      box.left + ((x + width / 2) / 768) * box.width,
      box.top + ((y + height / 2) / 426) * box.height,
      box,
    )
    expect(locationAt(gameWorldMap.locations, centre.x, centre.y)).toBe(2101)
  })
})
