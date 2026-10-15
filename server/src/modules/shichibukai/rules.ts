// Shichibukai rules: the saved run, what a landing tile does, card sets, the floor boss and its
// rewards. Every number comes from SHICHIBUKAI_PLACEHOLDERS; every function returns a new run.
import type { Bonuses, FighterInput, Random } from '@pockie/game-core'
import { z } from 'zod'
import {
  SHICHIBUKAI_RULES as RULES,
  type ShichibukaiStep,
  type TileEvent,
} from '../../../../shared/src/schemas/shichibukai.js'
import { sumBonuses } from '../../game/nonfight-buffs.js'
import { BOSSES, bossFighter, type Boss } from '../dungeons/bosses.js'
import { boardOf, layEvents, rollsFor, stepFrom } from './board.js'
import { SHICHIBUKAI_PLACEHOLDERS as P } from './config.js'

const pct = z.number().min(0).max(100)
const count = z.number().int().min(0)

/** The run as stored in shichibukai_players.run. */
export const runSchema = z.object({
  floor: z.number().int().min(1).max(RULES.floors),
  difficulty: z.number().int().min(1).max(RULES.difficulties),
  events: z.array(z.number().int().min(0).max(9)),
  pos: count,
  visited: z.array(count),
  rollsLeft: count,
  throws: count,
  atBoss: z.boolean(),
  cleared: z.boolean(),
  bossesKilled: count,
  runPoints: count,
  hpPct: pct,
  mpPct: pct,
  card: z
    .object({
      reason: z.enum(['chest', 'monster']),
      items: z.array(z.string()).length(RULES.cards),
      peeked: z.array(count),
      flipped: count.nullable(),
    })
    .nullable(),
})
export type Run = z.infer<typeof runSchema>

const FULL = 100

/** A fresh floor: new tile events, the start tile, the floor's rolls; HP and MP carry over. */
export function enterFloor(
  floor: number,
  difficulty: number,
  random: Random,
  carry: Pick<Run, 'bossesKilled' | 'runPoints' | 'hpPct' | 'mpPct'> = {
    bossesKilled: 0,
    runPoints: 0,
    hpPct: FULL,
    mpPct: FULL,
  },
): Run {
  return {
    floor,
    difficulty,
    events: layEvents(floor, random),
    pos: 0,
    visited: [0],
    rollsLeft: rollsFor(floor),
    throws: 0,
    atBoss: false,
    cleared: false,
    card: null,
    bossesKilled: carry.bossesKilled,
    runPoints: carry.runPoints,
    hpPct: carry.hpPct,
    mpPct: carry.mpPct,
  }
}

/** Five card prizes for the run's floor (repeats allowed). */
export function drawCards(floor: number, random: Random) {
  const pool = P.cardPrizes.filter((prize) => prize.floor <= floor)
  return Array.from({ length: RULES.cards }, () => pool[random.int(pool.length)]!.itemId)
}

/** Stone the next peek costs (50k, 100k, 150k), or null when none is left. */
export const peekCost = (peeks: number) =>
  peeks < RULES.peeks ? RULES.peekStone * (peeks + 1) : null

const clampHp = (value: number) => Math.max(P.minHpPct, Math.min(FULL, value))
const MAX_CHAIN = 3

/**
 * The tile the ninja lands on: unvisited tiles fire their event once. A whirlpool carries the
 * ninja further on and the new tile fires too (at most MAX_CHAIN in a row).
 */
export function land(
  run: Run,
  index: number,
  random: Random,
  depth = 0,
): { run: Run; steps: ShichibukaiStep[] } {
  const board = boardOf(run.floor)
  const fresh = !run.visited.includes(index)
  const at: Run = {
    ...run,
    pos: index,
    visited: fresh ? [...run.visited, index] : run.visited,
    atBoss: index === board.bossIndex,
  }
  const event = (fresh ? run.events[index] : 0) as TileEvent
  const step = (text: string, next: Run) => ({ run: next, steps: [{ index, event, text }] })
  switch (event) {
    case 1:
      return step(`+${P.blessingPct}% HP and MP`, {
        ...at,
        hpPct: Math.min(FULL, at.hpPct + P.blessingPct),
        mpPct: Math.min(FULL, at.mpPct + P.blessingPct),
      })
    case 2:
      return step(`-${P.cursePct}% HP`, { ...at, hpPct: clampHp(at.hpPct - P.cursePct) })
    case 3: {
      const points = P.tilePoints * run.floor * run.difficulty
      return step(`+${points} pts`, { ...at, runPoints: at.runPoints + points })
    }
    case 4:
      return step(`Marauders! -${P.marauderPct}% HP`, {
        ...at,
        hpPct: clampHp(at.hpPct - P.marauderPct),
        card: { reason: 'monster', items: drawCards(run.floor, random), peeked: [], flipped: null },
      })
    case 5:
      return step('Treasure!', {
        ...at,
        card: { reason: 'chest', items: drawCards(run.floor, random), peeked: [], flipped: null },
      })
    case 6:
      return step('+1 roll', { ...at, rollsLeft: at.rollsLeft + 1 })
    case 7:
      return step('-1 roll', { ...at, rollsLeft: Math.max(0, at.rollsLeft - 1) })
    case 8: {
      let target = index
      for (let i = 1 + random.int(P.whirlpoolReach); i > 0; i--)
        target = stepFrom(board, target, random) ?? target
      if (target === index || depth >= MAX_CHAIN) return step('The whirlpool calms', at)
      const then = land(at, target, random, depth + 1)
      return { run: then.run, steps: [{ index, event, text: 'Whirlpool!' }, ...then.steps] }
    }
    default:
      return { run: at, steps: [] }
  }
}

export const bossOf = (floor: number): Boss => BOSSES[(floor - 1) % BOSSES.length]!

export function bossBonuses(floor: number, difficulty: number, power: 50 | 100 | 150) {
  const mul =
    P.bossMul.difficulty[difficulty - 1]! +
    P.bossMul.floorStep * (floor - 1) +
    P.bossMul.power[power]
  return { hpMul: mul, attackMul: mul } satisfies Partial<Bonuses>
}

export const bossLevel = (level: number) => Math.max(RULES.minLevel, level)

/** The floor's boss at `power`, scaled on the challenger's level and gear. */
export function floorBossFighter(
  run: Pick<Run, 'floor' | 'difficulty'>,
  power: 50 | 100 | 150,
  level: number,
  gear: Partial<Bonuses>,
): FighterInput {
  return bossFighter(
    bossOf(run.floor),
    bossLevel(level),
    sumBonuses(gear, bossBonuses(run.floor, run.difficulty, power)),
  )
}

export function bossRewards(run: Run, power: 50 | 100 | 150, level: number) {
  const scale = run.difficulty * (power / 100)
  return {
    exp: Math.round(P.expPerLevel * bossLevel(level) * (1 + (run.floor - 1) / 4) * scale),
    points: Math.round(P.pointsPerFloor * run.floor * scale),
    stars: P.stars[power],
    throws: run.throws,
  }
}
