// HP and MP pouches (RoleUseSystem.java): reserves that refill HP/MP after won fights and after
// every explore fight. firstset.js sets sizes 50/30, but RefreshExtendMax replaces them on the
// first login and on every level-up; the amounts start at 0 (the tutorial hands out a pouch item).

const POUCH_BASE = 9000
const POUCH_PER_LEVEL = 1000

/** RefreshExtendMax: the same size for both pouches. */
export const pouchMax = (level: number) => POUCH_BASE + level * POUCH_PER_LEVEL

/** UseHPContainer / UseMPContainer: moves what the bar is missing from the pouch to the bar. */
export function drawPouch(value: number, max: number, pouch: number) {
  const moved = Math.min(Math.max(0, max - value), pouch)
  return { value: value + moved, pouch: pouch - moved }
}
