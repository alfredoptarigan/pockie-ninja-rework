// skill_aoyi_<id>.js: the outfit ultimates ("execute"). Must-skills tried before every attack:
// with a chance and below an HP threshold, both growing with the avatar-level gap, the target
// takes RandInt(300,500)/100 times its current HP.
import {
  SKILL_LOSE,
  SKILL_SUCCESS,
  type FightContext,
  type Fighter,
  type FightEvent,
} from '../types.js'

/**
 * Outfit ultimates whose scripts are identical (the +9 variant stays commented out). The other 48
 * (1901, 1904, ...) switch to a new ultimate for avatar level 9+ and are not ported.
 */
export const EXECUTE_SKILL_IDS = [
  1902, 1903, 1906, 1907, 1909, 1910, 1911, 1912, 1913, 1914, 1915, 1916, 1917, 1918, 1919, 1920,
  1921, 1922, 1923, 1925, 1926, 1928, 1932, 1933, 1934, 1936, 1938, 1939, 1940, 1941, 1942, 1943,
  1952, 1954, 1959, 1960, 1961, 1962, 1963, 1964, 1965, 1966, 1968, 1969, 1971, 1973, 1975, 1976,
  1977, 1978, 1979, 1980, 1981, 1982, 1983, 1988, 1989, 1991, 1992, 1993, 1994, 1995, 1996, 1997,
  1999, 2000,
]

const AVATAR_ID_MIN = 4000
const AVATAR_ID_MAX = 4640
const AVATAR_ID_STEP = 20

/** FightObject.getAvatarLevel(PlayerAvatarID). */
export function avatarLevelFromAvatarId(avatarId: number) {
  return avatarId > AVATAR_ID_MIN && avatarId <= AVATAR_ID_MAX
    ? Math.trunc((avatarId - AVATAR_ID_MIN - 1) / AVATAR_ID_STEP)
    : Math.trunc(Math.fround(avatarId * Math.fround(0.01)))
}

/** Players (Clothing != 0) and NPCs with CounterBombMul != -1 pass it in; others derive it. */
export const avatarLevelOf = (fighter: Fighter) =>
  fighter.avatarLevel ?? Math.trunc(fighter.level / 3) - 5

export function executeOdds(gap: number) {
  return {
    hpCondition: 15 + (gap > 0 ? Math.pow(gap, 1.26) : 0),
    probability: 10 + (gap > 0 ? Math.pow(gap, 1.2) : 0),
  }
}

export function execute(
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  _timer: number,
) {
  const { hpCondition, probability } = executeOdds(avatarLevelOf(self) - avatarLevelOf(target))
  if (ctx.randInt(0, 99) < probability && target.hp < target.maxHp * hpCondition * 0.01) {
    const damage = Math.trunc((ctx.randInt(300, 500) / 100) * target.hp)
    ctx.damage(target, damage)
    // The original stores TargetLastDamage (IsHit stays at its default 1).
    fv.damage = damage
    fv.hit = true
    return SKILL_SUCCESS
  }
  return SKILL_LOSE
}
