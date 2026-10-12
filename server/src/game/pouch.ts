// HP and MP pouches (RoleUseSystem.java): reserves that refill HP/MP after won fights and after
// every explore fight. firstset.js sets sizes 50/30, but RefreshExtendMax replaces them on the
// first login and on every level-up; the amounts start at 0 (the tutorial hands out a pouch item).
// Only fight ends draw on them (FightSystem command 12, OutSearchSystem, toll gates): reviving
// and travel do not, and a level-up refills HP/MP to the new maximum by itself (LevelSystem).
import type { PouchRefill } from '@pockie/shared'

const POUCH_BASE = 9000
const POUCH_PER_LEVEL = 1000

/** RefreshExtendMax: the same size for both pouches. */
export const pouchMax = (level: number) => POUCH_BASE + level * POUCH_PER_LEVEL

/** UseHPContainer / UseMPContainer: moves what the bar is missing from the pouch to the bar. */
export function drawPouch(value: number, max: number, pouch: number) {
  const moved = Math.min(Math.max(0, max - value), pouch)
  return { value: value + moved, pouch: pouch - moved }
}

/** OnCustomBuy sells pouch points in thousands. */
const POINTS_PER_COIN = 1000

/** One pouch's share of OnCustomBuy: its cost and new amount; a full pouch is skipped. */
function refill(pouch: number, max: number, choice: PouchRefill) {
  if (choice === 0 || pouch >= max) return { cost: 0, pouch }
  if (choice === 'full') {
    return { cost: Math.trunc((max - pouch - 1) / POINTS_PER_COIN) + 1, pouch: max }
  }
  // The original charges the whole choice even when the pouch caps it.
  return { cost: choice, pouch: Math.min(max, pouch + choice * POINTS_PER_COIN) }
}

/**
 * RoleUseSystem.OnCustomBuy: what buying the chosen refills costs (1 Gold or Gift Coupon per 1000
 * points) and the new pouch amounts; undefined when there is nothing to buy. The VIP discount is
 * left out (M3 decision 10).
 */
export function buyPouches(
  character: { level: number; hpPouch: number; mpPouch: number },
  hp: PouchRefill,
  mp: PouchRefill,
) {
  const max = pouchMax(character.level)
  const hpPart = refill(character.hpPouch, max, hp)
  const mpPart = refill(character.mpPouch, max, mp)
  const cost = hpPart.cost + mpPart.cost
  if (cost === 0) return undefined
  return { cost, hpPouch: hpPart.pouch, mpPouch: mpPart.pouch }
}
