import { describe, expect, it } from 'vitest'
import { createRandom, type Random } from '../random.js'
import { flip, newBoard, rollPetReward } from './pet-tracing.js'

describe('Pet Tracing', () => {
  it('replays seeded boards and every board can be solved in nine flips', () => {
    const cells = new Set<number>()
    for (let seed = 0; seed < 100; seed++) {
      let board = newBoard(createRandom(seed))
      expect(board).toEqual(newBoard(createRandom(seed)))
      cells.add(board.petCell)
      for (let cell = 0; cell < 9; cell++) {
        const result = flip(board, cell)
        board = result.board
        if (result.found) {
          expect(cell).toBe(board.petCell)
          break
        }
      }
      expect(board.opened).toContain(board.petCell)
    }
    expect(cells.size).toBe(9)
  })

  it.each([
    [0, 'SE'],
    [1, 'S'],
    [2, 'SW'],
    [3, 'E'],
    [5, 'W'],
    [6, 'NE'],
    [7, 'N'],
    [8, 'NW'],
  ] as const)('points cell %i toward the pet with %s and pays one Feather', (cell, arrow) => {
    const board = { petCell: 4, opened: [] }
    expect(flip(board, cell)).toEqual({
      board: { petCell: 4, opened: [cell] },
      found: false,
      arrow,
      feathers: 1,
    })
    expect(board.opened).toEqual([])
  })

  it('pays ten Feathers on finding the pet and refuses further flips', () => {
    const result = flip({ petCell: 4, opened: [0] }, 4)
    expect(result).toEqual({
      board: { petCell: 4, opened: [0, 4] },
      found: true,
      arrow: null,
      feathers: 10,
    })
    expect(() => flip(result.board, 1)).toThrow(RangeError)
  })

  it('following arrows reaches every hidden pet without revisiting a card', () => {
    for (let petCell = 0; petCell < 9; petCell++) {
      for (let start = 0; start < 9; start++) {
        let board = { petCell, opened: [] as number[] }
        let cell = start
        for (let step = 0; step < 3; step++) {
          const result = flip(board, cell)
          board = result.board
          if (result.found) break
          const arrow = result.arrow!
          cell += arrow.includes('N') ? -3 : arrow.includes('S') ? 3 : 0
          cell += arrow.includes('W') ? -1 : arrow.includes('E') ? 1 : 0
        }
        expect(board.opened).toContain(petCell)
      }
    }
  })

  it('refuses duplicate and invalid cells without changing the board', () => {
    const board = { petCell: 4, opened: [0] }
    for (const cell of [0, -1, 9, 1.5, NaN]) {
      expect(() => flip(board, cell)).toThrow(RangeError)
    }
    expect(board).toEqual({ petCell: 4, opened: [0] })
  })

  it('rolls a pet strictly below the five percent boundary', () => {
    const random = (value: number): Random => ({
      next: () => value,
      int: () => 1,
      between: () => 0,
    })
    expect(rollPetReward(random(0.049999), ['a', 'b'])).toBe('b')
    expect(rollPetReward(random(0.05), ['a', 'b'])).toBeNull()
    expect(rollPetReward(random(0), [])).toBeNull()
  })

  it('replays seeded pet rewards and reaches both outcomes', () => {
    const results = new Set<string | null>()
    for (let seed = 0; seed < 1000; seed++) {
      const result = rollPetReward(createRandom(seed), ['a', 'b'])
      expect(result).toBe(rollPetReward(createRandom(seed), ['a', 'b']))
      results.add(result)
    }
    expect(results).toEqual(new Set([null, 'a', 'b']))
  })
})
