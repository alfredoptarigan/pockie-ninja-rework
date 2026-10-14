import type { Random } from '../random.js'

export type PetTracingArrow = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

/** Server-only state: never send petCell to a player before their find. */
export interface PetTracingBoard {
  petCell: number
  opened: number[]
}

export interface PetTracingFlip {
  board: PetTracingBoard
  found: boolean
  arrow: PetTracingArrow | null
  feathers: number
}

export function newBoard(random: Random): PetTracingBoard {
  return { petCell: random.int(9), opened: [] }
}

/** Returns new state; the caller creates the next board after granting a find. */
export function flip(board: PetTracingBoard, cell: number): PetTracingFlip {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    throw new RangeError('Cell must be an integer from 0 to 8')
  }
  if (board.opened.includes(board.petCell)) throw new RangeError('Board already completed')
  if (board.opened.includes(cell)) throw new RangeError('Cell already opened')
  const found = cell === board.petCell
  const vertical = Math.sign(Math.floor(board.petCell / 3) - Math.floor(cell / 3))
  const horizontal = Math.sign((board.petCell % 3) - (cell % 3))
  const arrow = found
    ? null
    : (`${vertical < 0 ? 'N' : vertical > 0 ? 'S' : ''}${horizontal < 0 ? 'W' : horizontal > 0 ? 'E' : ''}` as PetTracingArrow)
  return {
    board: { petCell: board.petCell, opened: [...board.opened, cell] },
    found,
    arrow,
    feathers: found ? 10 : 1,
  }
}

/** The server supplies only nature 1-3 species from its validated catalog. */
export function rollPetReward(random: Random, eligibleItemIds: readonly string[]): string | null {
  if (eligibleItemIds.length === 0 || random.next() >= 0.05) return null
  return eligibleItemIds[random.int(eligibleItemIds.length)]!
}
