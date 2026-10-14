import { describe, expect, it } from 'vitest'
import { firstFit, fits, footprint, occupancy, USABLE_PAGES, type Placed } from './bag-grid.js'

const one = { w: 1, h: 1 }
const square = { w: 2, h: 2 }
const tall = { w: 2, h: 3 }
const fullPage = (page: number): Placed[] =>
  Array.from({ length: 60 }, (_, slot) => ({ page, slot, ...one }))

describe('bag grid', () => {
  it('derives footprints from ItemShapeType', () => {
    expect(footprint('i160001')).toEqual(one) // shape 1
    expect(footprint('i150102')).toEqual(square) // shape 4
    expect(footprint('i270100')).toEqual(tall) // shape 6: 2 wide, 3 tall
    expect(footprint('i999999999')).toEqual(one) // unknown item
  })

  it('has as many usable pages as BAG_CELLS covers', () => {
    expect(USABLE_PAGES).toBe(2)
  })

  it('marks the cells an item covers on its own page only', () => {
    const grid = occupancy(
      [
        { page: 0, slot: 11, ...tall },
        { page: 1, slot: 0, ...one },
      ],
      0,
    )
    expect(grid.filter(Boolean)).toHaveLength(6)
    expect([11, 12, 21, 22, 31, 32].every((cell) => grid[cell])).toBe(true)
    expect(grid[0]).toBe(false)
  })

  it('refuses rectangles that leave the page or overlap', () => {
    const grid = occupancy([{ page: 0, slot: 0, ...one }], 0)
    expect(fits(grid, 0, one)).toBe(false)
    expect(fits(grid, 1, square)).toBe(true)
    expect(fits(grid, 9, square)).toBe(false) // right edge
    expect(fits(grid, 48, tall)).toBe(false) // bottom edge (row 4 + 3 > 6)
    expect(fits(grid, 38, tall)).toBe(true) // rows 3-5
    expect(fits(grid, 28, tall)).toBe(true)
    expect(fits(grid, 60, one)).toBe(false)
    expect(fits(grid, -1, one)).toBe(false)
  })

  it('finds the first free spot page by page, row-major', () => {
    expect(firstFit([], tall)).toEqual({ page: 0, slot: 0 })
    expect(firstFit([{ page: 0, slot: 0, ...one }], square)).toEqual({ page: 0, slot: 1 })
    expect(firstFit(fullPage(0), one)).toEqual({ page: 1, slot: 0 })
    expect(firstFit([...fullPage(0), ...fullPage(1)], one)).toBeNull()
    expect(firstFit([...fullPage(0), ...fullPage(1)], one, USABLE_PAGES, 10)).toEqual({
      page: 2,
      slot: 0,
    })
  })
})
