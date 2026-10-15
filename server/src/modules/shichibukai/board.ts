// Shichibukai boards: Reborn's 9 tile graphs (boards.json, its client's `nw`, one per floor) and
// movement over them. A cell's index is its place in the board's node list (0 is the start).
// Reborn's server picks the branch at a fork; ours picks at random among the next tiles that can
// still reach the boss, so a roll never walks into a dead end.
import type { Random } from '@pockie/game-core'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { TileEvent } from '../../../../shared/src/schemas/shichibukai.js'
import { SHICHIBUKAI_PLACEHOLDERS as P } from './config.js'

const boardsSchema = z.array(
  z.object({
    id: z.number().int(),
    begin: z.string(),
    end: z.string(),
    nodes: z.array(
      z.object({ tag: z.string(), affair: z.number().int().nullable(), next: z.array(z.string()) }),
    ),
  }),
)

/** Reborn's affair codes: 1 event tile, 5 chest, 9 boss. */
const AFFAIR = { event: 1, chest: 5, boss: 9 } as const

export interface Board {
  floor: number
  tags: string[]
  affairs: (number | null)[]
  next: number[][]
  bossIndex: number
  /** Cells with a path to the boss. */
  reachesBoss: Set<number>
  /** Fewest moves from the start to the boss. */
  shortest: number
}

function shortestFrom(next: number[][], from: number, to: number) {
  const dist = new Map([[from, 0]])
  const queue = [from]
  for (const cell of queue) {
    for (const n of next[cell]!) {
      if (dist.has(n)) continue
      dist.set(n, dist.get(cell)! + 1)
      queue.push(n)
    }
  }
  return dist.get(to) ?? 0
}

function reachers(next: number[][], target: number) {
  const reached = new Set([target])
  let grew = true
  while (grew) {
    grew = false
    next.forEach((targets, cell) => {
      if (!reached.has(cell) && targets.some((n) => reached.has(n))) {
        reached.add(cell)
        grew = true
      }
    })
  }
  return reached
}

let cached: Board[] | undefined
function boards(): Board[] {
  cached ??= boardsSchema
    .parse(JSON.parse(readFileSync(new URL('./boards.json', import.meta.url), 'utf8')))
    .map((raw) => {
      const tags = raw.nodes.map((node) => node.tag)
      const indexOf = new Map(tags.map((tag, i) => [tag, i]))
      // Reborn's data names a few tiles that do not exist (board 5's 4-7); those links are dropped.
      const next = raw.nodes.map((node) => [
        ...new Set(
          node.next.flatMap((tag) =>
            indexOf.has(tag) && tag !== node.tag ? [indexOf.get(tag)!] : [],
          ),
        ),
      ])
      const bossIndex = indexOf.get(raw.end)!
      return {
        floor: raw.id,
        tags,
        affairs: raw.nodes.map((node) => node.affair),
        next,
        bossIndex,
        reachesBoss: reachers(next, bossIndex),
        shortest: shortestFrom(next, 0, bossIndex),
      }
    })
  return cached
}

export const boardOf = (floor: number) => boards()[floor - 1]!

export const rollsFor = (floor: number) =>
  Math.ceil(boardOf(floor).shortest / P.tilesPerRoll) + P.rollsExtra

function weighted(random: Random): TileEvent {
  const total = P.tileWeights.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random.next() * total
  for (const [event, weight] of P.tileWeights) {
    if (roll < weight) return event
    roll -= weight
  }
  return 0
}

/** A fresh layout of the floor's tile events. */
export function layEvents(floor: number, random: Random): TileEvent[] {
  const board = boardOf(floor)
  return board.affairs.map((affair, index): TileEvent => {
    if (index === board.bossIndex || affair === AFFAIR.boss) return 9
    if (affair === AFFAIR.chest) return 5
    if (affair === AFFAIR.event) return weighted(random)
    return 0
  })
}

/** The tile after `cell` on the way to the boss, or null at the boss or a dead end. */
export function stepFrom(board: Board, cell: number, random: Random): number | null {
  if (cell === board.bossIndex) return null
  const options = board.next[cell]!.filter((n) => board.reachesBoss.has(n))
  return options.length ? options[random.int(options.length)]! : null
}

/** Walks up to `steps` tiles from `from` (stopping on the boss): the tiles, `from` first. */
export function walk(board: Board, from: number, steps: number, random: Random): number[] {
  const path = [from]
  for (let i = 0; i < steps; i++) {
    const next = stepFrom(board, path[path.length - 1]!, random)
    if (next === null) break
    path.push(next)
  }
  return path
}

/** The board's links as [from, to] pairs, for drawing the track. */
export const edgesOf = (board: Board): [number, number][] =>
  board.next.flatMap((targets, cell) => targets.map((n): [number, number] => [cell, n]))
