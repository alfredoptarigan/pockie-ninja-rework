// Reborn talents (M5 decisions 6-8). Constants: server/data/game/reborn/talents.json.
// In combat a talent only acts when the current opponent beats one of my stats:
// - 2, 3, 4, 5, 8 narrow the enemy's stat toward mine by L% (`narrowGap`), never past parity.
// - 1, 6, 7 guard rolls that are already 0% (parry, crit) or 100% (hit) once the enemy leads, so
//   narrowing would do nothing; they add a flat L/4 % chance instead (user decision 2026-10-13).
import data from '../../../server/data/game/reborn/talents.json'
import { hitChance } from '../battle/damage.js'
import type { FighterInput } from '../battle/types.js'
import type { Random } from '../random.js'

export const TALENT_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type TalentId = (typeof TALENT_IDS)[number]
/** Active talents only, levels already capped by `talentCap`. */
export type Talents = Partial<Record<TalentId, number>>

export const TALENTS = data

/** Level L gives 1 point of extra chance per this many levels (talents 1, 6, 7). */
export const EXTRA_CHANCE_DIVISOR = 4

/** Decision 6: talents unlock at 51 and reach 40 at our cap 90. */
export const talentCap = (level: number) => Math.max(0, level - data.levelOffset)

/** Decision 7: cost of the n-th attempt of the day (1-based); null past the daily attempts. */
export function upgradeCost(attempt: number) {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > data.attemptsPerDay) return null
  const [gold, stones] = data.costs[attempt - 1]!
  return { gold: gold!, stones: stones! }
}

/** Decision 7: 100 EXP, x3 on a 10% crit. */
export function rollUpgrade(random: Random) {
  const crit = random.int(100) < data.critPercent
  return { exp: data.expPerUpgrade * (crit ? data.critMultiplier : 1), crit }
}

export const canActivate = (level: number, activeCount: number) =>
  level >= 1 && activeCount < data.maxActive

/** Decision 8: the enemy's `stat` becomes `X - (X - mine) * L / 100` when it beats `mine`. */
export function narrowGap(enemy: number, mine: number, level: number) {
  if (enemy <= mine || level <= 0) return enemy
  return Math.trunc(enemy - ((enemy - mine) * Math.min(level, 100)) / 100)
}

/** Whole percent of extra chance for talents 1, 6 and 7. */
export const extraChance = (level: number) => Math.trunc(Math.max(0, level) / EXTRA_CHANCE_DIVISOR)

export type TalentStats = Pick<
  FighterInput,
  'hit' | 'dodge' | 'crit' | 'tough' | 'parry' | 'pierce' | 'defense' | 'neglectDefense'
> & { talents?: Talents }

const lv = (f: TalentStats, id: TalentId) => f.talents?.[id] ?? 0

/** Hit percent of `attacker` against `defender` (Hit 8 for the attacker, Hit 7 for the defender). */
export function hitPercent(attacker: TalentStats, defender: TalentStats) {
  const dodge = narrowGap(defender.dodge, attacker.hit, lv(attacker, 8))
  const extra = attacker.hit > defender.dodge ? extraChance(lv(defender, 7)) : 0
  return Math.max(0, hitChance(dodge, attacker.hit) - extra)
}

/**
 * Crit margin `c` (for applyCrit, never negative) and percent chance. Critical 5 for the
 * defender, Constitution 6 for the attacker. Without talents: c = crit - tough, chance c / 16.
 */
export function critRoll(attacker: TalentStats, defender: TalentStats) {
  const crit = narrowGap(attacker.crit, defender.tough, lv(defender, 5))
  const c = Math.max(0, crit - defender.tough)
  const extra = defender.tough > attacker.crit ? extraChance(lv(attacker, 6)) : 0
  return { c, chance: Math.trunc(c / 16) + extra }
}

/** Parry percent of `self` against `target` (Pierce 1 for self, Block 2 for the target). */
export function parryChance(self: TalentStats, target: TalentStats) {
  const parry = narrowGap(self.parry, target.pierce, lv(target, 2))
  const finalParry = parry - target.pierce
  const extra = target.pierce > self.parry ? extraChance(lv(self, 1)) : 0
  return (finalParry > 0 ? finalParry / 16 : 0) + extra
}

/** Defense and defense break for the main strike (Defense 4 attacker, Armor Break 3 defender). */
export function defenseRoll(attacker: TalentStats, defender: TalentStats) {
  return {
    defense: narrowGap(defender.defense, attacker.neglectDefense, lv(attacker, 4)),
    neglectDefense: narrowGap(attacker.neglectDefense, defender.defense, lv(defender, 3)),
  }
}
