import { describe, expect, it } from 'vitest'
import { footprint, layoutBag } from './bag-layout'

const cells = (w: number, h: number) => ({ w, h })

describe('footprint', () => {
  it('turns an icon size into 27px bag cells, like Reborn', () => {
    expect(footprint({ width: 24, height: 24 })).toEqual(cells(1, 1))
    expect(footprint({ width: 51, height: 51 })).toEqual(cells(2, 2))
    expect(footprint({ width: 46, height: 46 })).toEqual(cells(2, 2))
    expect(footprint({ width: 51, height: 78 })).toEqual(cells(2, 3))
  })

  it('gives items without an icon a 2x2 cell', () => {
    expect(footprint(undefined)).toEqual(cells(2, 2))
  })
})

describe('layoutBag', () => {
  it('places items first-fit, row by row, as the Reborn bag shows them', () => {
    // The Reborn test account's page I, in bag order (measured 2026-10-14).
    const items = [
      ['coat', 2, 2],
      ['sword', 2, 3],
      ['hat1', 2, 2],
      ['hat2', 2, 2],
      ['hat3', 2, 2],
      ['club', 2, 3],
      ['hat4', 2, 2],
      ['hat5', 2, 2],
      ['hat6', 2, 2],
      ['sword2', 2, 3],
      ['hat7', 2, 2],
      ['hat8', 2, 2],
      ['armour', 2, 2],
      ['ring1', 1, 1],
      ['ring2', 1, 1],
    ] as const
    const [page] = layoutBag(items, ([, w, h]) => cells(w, h))
    expect(page!.map(({ item, x, y }) => [item[0], x, y])).toEqual([
      ['coat', 0, 0],
      ['sword', 2, 0],
      ['hat1', 4, 0],
      ['hat2', 6, 0],
      ['hat3', 8, 0],
      ['club', 0, 2],
      ['hat4', 4, 2],
      ['hat5', 6, 2],
      ['hat6', 8, 2],
      ['sword2', 2, 3],
      ['hat7', 4, 4],
      ['hat8', 6, 4],
      ['armour', 8, 4],
      ['ring1', 0, 5],
      ['ring2', 1, 5],
    ])
  })

  it('moves an item that no longer fits to the next page', () => {
    const items = Array.from({ length: 16 }, (_, i) => i)
    const pages = layoutBag(items, () => cells(2, 2))
    expect(pages.map((page) => page.length)).toEqual([15, 1])
    expect(pages[1]![0]).toMatchObject({ item: 15, x: 0, y: 0 })
  })

  it('fills a gap on an earlier page before using a later one', () => {
    const pages = layoutBag([cells(10, 5), cells(10, 2), cells(1, 1)], (size) => size)
    expect(pages.map((page) => page.length)).toEqual([2, 1])
    expect(pages[0]![1]).toMatchObject({ x: 0, y: 5 })
  })

  it('returns one empty page for an empty bag', () => {
    expect(layoutBag([], () => cells(1, 1))).toEqual([[]])
  })
})
