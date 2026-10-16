// Las Noches manual EXP pots, lives, and binary combat probes for timestamp-driven auto runs.
import { refuse } from './errors.js'

export interface SingleGateConfig {
  MaxEntryCnt: number
  BuyReliveCnt: number
  BuyReliveMoney: number
  BuyReliveAddMoney: number
  EntryParam0: number
  NewMaxGate: number
}
export interface FloorRow {
  exp: number
  npc: string
}

export const LAS_NOCHES_MIN_LEVEL = 13
/** SingleFloorCfg [0]: floor 1 costs 1000 Stone. */
export const FIRST_FLOOR_STONE = 1000
const HALF_STONE_PER_FLOOR = 27.03
const FREE_LIVES = 2

export interface LasNochesRun {
  /** Floor to fight next (1-based). */
  floor: number
  pot: number
  lives: number
  livesBought: number
}
export type StartMode = 'first' | 'half'

/** Floor 1 for 1000 Stone, or `(int)(0.5 * best)` for `(int)(27.03 * (floor - 1) + 1000)`. */
export function startOptions(best: number, config: Pick<SingleGateConfig, 'EntryParam0'>) {
  const floor = Math.trunc(config.EntryParam0 * best)
  return {
    first: { floor: 1, stone: FIRST_FLOOR_STONE },
    half:
      floor >= 1
        ? {
            floor,
            stone: Math.trunc(HALF_STONE_PER_FLOOR * (floor - 1) + FIRST_FLOOR_STONE),
          }
        : null,
  }
}

export function startLasNoches(
  mode: StartMode,
  best: number,
  config: Pick<SingleGateConfig, 'EntryParam0'>,
): LasNochesRun {
  const option = startOptions(best, config)[mode]
  if (!option) refuse('no_best_floor', 'Clear a few floors before starting halfway.')
  return { floor: option!.floor, pot: 0, lives: FREE_LIVES, livesBought: 0 }
}

/** The floor's EXP goes into the pot; clearing NewMaxGate ends the run. */
export function winFloor(
  run: LasNochesRun,
  best: number,
  floors: Record<string, FloorRow>,
  config: Pick<SingleGateConfig, 'NewMaxGate'>,
) {
  const exp = floors[String(run.floor - 1)]?.exp ?? 0
  const ended = run.floor >= config.NewMaxGate
  return {
    run: { ...run, floor: ended ? run.floor : run.floor + 1, pot: run.pot + exp },
    best: Math.max(best, run.floor),
    ended,
  }
}

/** Lose one life and half the bank; the last life wipes the bank. Claim acknowledges the run. */
export function loseFloor(run: LasNochesRun) {
  const lives = Math.max(0, run.lives - 1)
  return {
    run: { ...run, lives, pot: lives > 0 ? Math.trunc(run.pot / 2) : 0 },
    ended: lives === 0,
  }
}

export const lifePrice = (
  bought: number,
  config: Pick<SingleGateConfig, 'BuyReliveMoney' | 'BuyReliveAddMoney'>,
) => config.BuyReliveMoney + config.BuyReliveAddMoney * bought

export function buyLife(
  run: LasNochesRun,
  config: Pick<SingleGateConfig, 'BuyReliveCnt'>,
): LasNochesRun {
  if (run.livesBought >= config.BuyReliveCnt) refuse('life_limit', 'You cannot buy more lives.')
  return { ...run, lives: run.lives + 1, livesBought: run.livesBought + 1 }
}

/** Probe full-health battles to find the reachable auto floor (SingleGateSystem.OnAutoFight). */
export async function lasNochesAutoReach(
  start: number,
  max: number,
  wins: (floor: number) => Promise<boolean>,
) {
  if (await wins(max)) return max
  if (!(await wins(start))) return start - 1
  let low = start,
    high = max
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2)
    if (await wins(mid)) low = mid
    else high = mid
  }
  return low
}

export const LAS_NOCHES_AUTO_COSTS = [28, 58, 91] as const
export const LAS_NOCHES_AUTO_MAX_FLOOR = 160
export const LAS_NOCHES_AUTO_TICK_MS = 30000
