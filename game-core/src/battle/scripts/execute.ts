// skill_aoyi_<id>.js: the outfit ultimates ("execute"). Must-skills tried before every attack:
// with a chance and below an HP threshold, both growing with the avatar-level gap, the target
// takes RandInt(300,500)/100 times its current HP. 48 of them switch to a "new ultimate"
// (skill_aoyi_<id * 10>.js, same damage, own replay id) half of the time at avatar level 9+.
import {
  SKILL_LOSE,
  SKILL_SUCCESS,
  type FightContext,
  type Fighter,
  type FightEvent,
  type SkillInput,
  type SkillScript,
} from '../types.js'

/** Outfit ultimates whose +9 variant stays commented out in the script. */
export const EXECUTE_SKILL_IDS = [
  1902, 1903, 1906, 1907, 1909, 1910, 1911, 1912, 1913, 1914, 1915, 1916, 1917, 1918, 1919, 1920,
  1921, 1922, 1923, 1925, 1926, 1928, 1932, 1933, 1934, 1936, 1938, 1939, 1940, 1941, 1942, 1943,
  1952, 1954, 1959, 1960, 1961, 1962, 1963, 1964, 1965, 1966, 1968, 1969, 1971, 1973, 1975, 1976,
  1977, 1978, 1979, 1980, 1981, 1982, 1983, 1988, 1989, 1991, 1992, 1993, 1994, 1995, 1996, 1997,
  1999, 2000,
]

/** Outfit ultimates with the +9 variant active (skill_aoyi_1901.js and 47 identical scripts). */
export const EXECUTE_PLUS9_SKILL_IDS = [
  1901, 1904, 1905, 1908, 1924, 1927, 1929, 1930, 1931, 1935, 1937, 1944, 1945, 1946, 1947, 1948,
  1949, 1950, 1951, 1953, 1955, 1956, 1957, 1958, 1967, 1970, 1972, 1974, 1984, 1985, 1986, 1987,
  1990, 1998, 2201, 2202, 2203, 2204, 2205, 2206, 2207, 2208, 2209, 2210, 2211, 2212, 2213, 2214,
]

/**
 * The new ultimates (skill_aoyi_19010.js ... 22140.js): one per ported outfit ultimate. 2215-2220
 * and their 22150-22200 have rows in skill.ini but no script in the backup, so the original
 * server fell back to the normal attack for them, and so does this port.
 */
export const NEW_ULTIMATE_SKILL_IDS = [...EXECUTE_SKILL_IDS, ...EXECUTE_PLUS9_SKILL_IDS]
  .map((id) => id * 10)
  .sort((a, b) => a - b)

/** skill.ini rows of the new ultimates (identical apart from the id; guarded by a test). */
export const newUltimateSkill = (id: number): SkillInput => ({
  id,
  type: 1,
  quomodo: 1,
  effect: 1,
  priority: 1,
  probability: 0,
  canbecounter: 0,
  decmp: 0,
  secondid: id,
  javascript: `skill/skill_aoyi_${id}.js`,
})

const PLUS9_AVATAR_LEVEL = 9
const PLUS9_CHANCE = 50
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

/** Below this HP percent the ultimate can fire at a gap of 0 (Reborn: secret technique). */
export const SECRET_THRESHOLD = 15

export function executeOdds(gap: number, threshold = SECRET_THRESHOLD) {
  return {
    hpCondition: threshold + (gap > 0 ? Math.pow(gap, 1.26) : 0),
    probability: 10 + (gap > 0 ? Math.pow(gap, 1.2) : 0),
  }
}

/** RandInt(300,500)/100 * HP straight to the target (Rhino truncates into the int fields). */
function ultimateDamage(ctx: FightContext, target: Fighter, fv: FightEvent) {
  const damage = Math.trunc((ctx.randInt(300, 500) / 100) * target.hp)
  ctx.damage(target, damage)
  // The original stores TargetLastDamage (IsHit stays at its default 1).
  fv.damage = damage
  fv.hit = true
  return SKILL_SUCCESS
}

function executeChance(ctx: FightContext, self: Fighter, target: Fighter) {
  const { hpCondition, probability } = executeOdds(
    avatarLevelOf(self) - avatarLevelOf(target),
    self.secretThreshold,
  )
  return ctx.randInt(0, 99) < probability && target.hp < target.maxHp * hpCondition * 0.01
}

export function execute(
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  _timer: number,
) {
  return executeChance(ctx, self, target) ? ultimateDamage(ctx, target, fv) : SKILL_LOSE
}

/** skill_aoyi_<id>.js with the +9 branch: ChangeSkill(skill, id * 10) + UserSkill. */
export const executeOrNewUltimate =
  (newUltimateId: number): SkillScript =>
  (ctx, self, target, fv, timer) => {
    if (!executeChance(ctx, self, target)) return SKILL_LOSE
    if (avatarLevelOf(self) >= PLUS9_AVATAR_LEVEL && ctx.randInt(0, 99) < PLUS9_CHANCE) {
      return ctx.changeSkill(self, target, newUltimateSkill(newUltimateId), fv, timer)
    }
    return ultimateDamage(ctx, target, fv)
  }

/** skill_aoyi_<id * 10>.js: the new ultimate, no condition of its own. */
export const newUltimate: SkillScript = (ctx, _self, target, fv) => ultimateDamage(ctx, target, fv)

const script = (id: number) => `skill/skill_aoyi_${id}.js`

export const AOYI_SCRIPTS: Record<string, SkillScript> = Object.fromEntries([
  ...EXECUTE_SKILL_IDS.map((id) => [script(id), execute]),
  ...EXECUTE_PLUS9_SKILL_IDS.map((id) => [script(id), executeOrNewUltimate(id * 10)]),
  ...NEW_ULTIMATE_SKILL_IDS.map((id) => [script(id), newUltimate]),
])
