// Trigger ninjutsu, batch B (skill_<name>_38xx.js): 3809-3815, 3819-3822, 3825-3827. Rows exist
// for skill levels 1-13 (id = (level - 1) * 10000 + base); the scripts pick their numbers by
// GetLevel() and keep the original's half-finished level 3+ columns as they are.
// ponytail: the SkillAddN bonus (value * (1 + 0.01 * trunc(SkillAddN * 0.01))) is left out: the
// fighters have no SkillAdd yet (plan task B5); with SkillAdd 0 it multiplies by 1.
import fightBuffs from '../../../../server/data/game/fight-buffs.json'
import {
  SKILL_LOSE,
  SKILL_SUCCESS,
  type FightContext,
  type Fighter,
  type FightEvent,
  type SkillInput,
  type SkillScript,
} from '../types.js'
import { BUFF_IMMUNITY } from './parry.js'

const BUFF_FREEZE = 11802
const BUFF_BURN = 11804
const BUFF_WINE = 11806
const BUFF_DEATH_SEAL = 11808
const BUFF_POISON = 11811
const BUFF_SEAL = 11812
const BUFF_STUN = 11813
const BUFF_WARM_BLOOD = 11814
const BUFF_FIRST_GATE = 11819
const BUFF_CLAY_BOMB = 11820
const BUFF_FOG = 11821
const BUFF_SUNSET = 11822
const BUFF_CURSE_MARK = 11823
const BUFF_STORM_CLOUD = 11827
const BUFF_PRAYER = 11832
const BUFF_DRAIN = 11836
const BUFF_VESSEL_DESTROY = 11839
const BUFF_SUBSTITUTE = 11840
/** 11819 then 11844-11850: each gate replaces the previous one. */
const GATES = [BUFF_FIRST_GATE, 11844, 11845, 11846, 11847, 11848, 11849, 11850]
const LAST_GATE_SAVE_DATA = 1000
const BUFF_EXCITEMENT = 11880
const SLAUGHTER_AURAS = [11853, 11854, 11855]
const BUFF_ELEMENT_MASTERY = 11905

/** SaveData of excitement 11880 by the buff that granted it (gates/curse, fog/sunset, prayer). */
export const EXCITED_BY_GATES = 999999
export const EXCITED_BY_WEATHER = 999998
export const EXCITED_BY_PRAYER = 999997

const WARM_BLOOD_BACK = 0.2
const ELEMENT_BONUS = 0.15
const DEATH_SEALED = 0.25
const MAX_STUNS = 3
const STORM_MOVE_CHANCE = 30

/** The level-based MP amount every MP-costing ninjutsu scales. */
export function baseMpCost(level: number) {
  const steps =
    20 +
    level -
    1 +
    Math.trunc(level / 3 + 1) * 8 +
    ((Math.trunc((level - 1) / 10) * 7 + 14) / 3) * 8
  return (200 + 20 * (level - 1) * (1 + (steps / 12) * 0.01)) / 30
}

/** The script's `switch (skill.GetLevel())`: levels without a case keep 0. */
const atLevel = (table: number[], skill?: SkillInput) => table[(skill?.level ?? 0) - 1] ?? 0

const has = (ctx: FightContext, fighter: Fighter, buffId: number) =>
  ctx.getBuff(fighter, buffId) !== undefined

/** ToInt(BaseMPCost * rate), doubled while the caster's vessels are destroyed. */
function mpCost(ctx: FightContext, self: Fighter, rate: number) {
  const cost = Math.trunc(baseMpCost(self.level) * rate)
  return has(ctx, self, BUFF_VESSEL_DESTROY) ? cost * 2 : cost
}

/** Pays the MP and ends a drain (11836) on the caster. */
function finish(ctx: FightContext, self: Fighter, fv: FightEvent, timer: number, cost: number) {
  self.mp -= cost
  fv.decMp = cost
  if (has(ctx, self, BUFF_DRAIN)) ctx.removeBuff(self, BUFF_DRAIN, timer, fv)
}

/** "Excitement + any slaughter aura" (pets, M6): 11880 with the first aura's SaveData. */
function excite(ctx: FightContext, self: Fighter, fv: FightEvent, timer: number, by: number) {
  const aura = SLAUGHTER_AURAS.map((id) => ctx.getBuff(self, id)).find((b) => b && b.saveData)
  if (aura) ctx.addBuff(self, BUFF_EXCITEMENT, timer, fv, by, aura.saveData)
}

/** Excitement on a gate or curse mark: granted, or an existing one pushed to 999999. */
function exciteByGates(ctx: FightContext, self: Fighter, fv: FightEvent, timer: number) {
  const excitement = ctx.getBuff(self, BUFF_EXCITEMENT)
  if (excitement) excitement.saveData = EXCITED_BY_GATES
  else excite(ctx, self, fv, timer, EXCITED_BY_GATES)
}

/** Sunset (11822) melt roll and element mastery (11905): the damage factor 1 + melt + 0.15. */
function meltFactor(ctx: FightContext, self: Fighter) {
  const sunset = ctx.getBuff(self, BUFF_SUNSET)
  const melt = sunset && ctx.randInt(0, 99) < sunset.saveData ? 1 : 0
  const element = has(ctx, self, BUFF_ELEMENT_MASTERY) ? ELEMENT_BONUS : 0
  return { melt, factor: 1 + melt + element }
}

/** Strike for `damage`, with 20 % recoil under warm blood (11814). */
function elementStrike(
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  damage: number,
  fv: FightEvent,
  timer: number,
) {
  const back = has(ctx, self, BUFF_WARM_BLOOD) ? damage * WARM_BLOOD_BACK : 0
  ctx.attack(self, target, damage, fv, timer, back)
}

/** 3809 (on damaged): fire strike; sets a wine-soaked target on fire. */
const phoenixFlower: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 0.3)
  const fire = atLevel(
    [0.4, 0.4, 0.54, 0.57, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75, 0.78, 0.81, 0.84],
    skill,
  )
  // Level 3+ multiply the burn by 12-34 with 0 ticks (half-finished table, kept).
  const flame = atLevel([0.4, 0.4, 12, 13, 15, 17, 19, 21, 24, 26, 29, 31, 34], skill)
  const ticks = atLevel([2, 2], skill)
  if (has(ctx, self, BUFF_SEAL) || self.mp < cost) return SKILL_LOSE
  // Against a frozen target IsMelt stays undefined, and `undefined != 0` flags the skill as
  // ignoring defence (original quirk).
  let melt: number | undefined
  if (!has(ctx, target, BUFF_FREEZE)) {
    const roll = meltFactor(ctx, self)
    melt = roll.melt
    elementStrike(ctx, self, target, ctx.getDamage(self) * fire * roll.factor, fv, timer)
    const fogged = has(ctx, target, BUFF_FOG) || has(ctx, self, BUFF_FOG)
    if (fv.hit !== false && has(ctx, target, BUFF_WINE) && !fogged) {
      const damage = Math.trunc((fv.damage ?? 0) * flame)
      const burn = ctx.getBuff(target, BUFF_BURN)
      if (burn) {
        burn.saveData = Math.max(burn.saveData, damage)
        burn.saveData1 = (burn.saveData1 ?? 0) + ticks
      } else {
        ctx.addBuff(target, BUFF_BURN, timer, fv, damage, ticks)
      }
    }
  }
  finish(ctx, self, fv, timer, cost)
  if (melt !== 0) fv.neglectDef = true
  return SKILL_SUCCESS
}

/**
 * 3810 Eight Gates (on damaged): opens the next gate once DoorTime has passed since the last
 * one (SaveData = the time it opened). Level 3+ DoorTime is 7.7-11.6 units, so a gate a hit.
 */
const eightGates: SkillScript = (ctx, self, _target, fv, timer, skill) => {
  const doorTime = atLevel(
    [1000, 1000, 7.669, 8.21, 8.696, 9.158, 9.579, 9.98, 10.352, 10.684, 11.013, 11.312, 11.601],
    skill,
  )
  if (self.hp <= 0) return SKILL_LOSE
  const open = GATES.findIndex((id) => has(ctx, self, id))
  if (open === GATES.length - 1) return SKILL_LOSE
  if (open < 0) {
    ctx.addBuff(self, BUFF_FIRST_GATE, timer, fv, timer)
    exciteByGates(ctx, self, fv, timer)
    return SKILL_SUCCESS
  }
  if (timer - ctx.getBuff(self, GATES[open]!)!.saveData < doorTime) return SKILL_LOSE
  ctx.removeBuff(self, GATES[open]!, timer, fv)
  const next = GATES[open + 1]!
  ctx.addBuff(self, next, timer, fv, open + 1 === GATES.length - 1 ? LAST_GATE_SAVE_DATA : timer)
  return SKILL_SUCCESS
}

/** 3811 Sand Storm (after being hit): wind strike back. */
const sandStorm: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 1.1)
  const wind = atLevel(
    [1.6, 1.6, 0.64, 0.68, 0.72, 0.75, 0.79, 0.82, 0.86, 0.9, 0.93, 0.97, 1],
    skill,
  )
  if (has(ctx, self, BUFF_SEAL) || self.mp < cost) return SKILL_LOSE
  const { melt, factor } = meltFactor(ctx, self)
  elementStrike(ctx, self, target, ctx.getDamage(self) * wind * factor, fv, timer)
  finish(ctx, self, fv, timer, cost)
  if (melt) fv.neglectDef = true
  return SKILL_SUCCESS
}

/** 3812 Clay Bomb (before attacking): once per fight (thousands digit of its 8888 SaveData1). */
const clayBomb: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 2)
  // Level 3+ explode after 1 unit (half-finished table, kept).
  const fuse = atLevel([1100, 1100, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], skill)
  if (has(ctx, self, BUFF_SEAL) || self.mp < cost) return SKILL_LOSE
  const init = ctx.getBuff(self, BUFF_IMMUNITY)
  if (!init || ((init.saveData1 ?? 0) % 10000) / 1000 >= 1) return SKILL_LOSE
  if (has(ctx, target, BUFF_CLAY_BOMB)) return SKILL_LOSE
  ctx.addBuff(target, BUFF_CLAY_BOMB, timer, fv, fuse)
  init.saveData1 = (init.saveData1 ?? 0) + 1000
  finish(ctx, self, fv, timer, cost)
  return SKILL_SUCCESS
}

/**
 * Fog 3813 and Sunset 3815 (fight begin): each cancels the other (its own first, then the
 * target's, with the excitement it granted) for free, else rises once.
 */
function weather(own: number, other: number): SkillScript {
  return (ctx, self, target, fv, timer) => {
    const cost = mpCost(ctx, self, 3.4)
    if (has(ctx, self, BUFF_SEAL) || self.mp < cost || has(ctx, self, own)) return SKILL_LOSE
    for (const side of [self, target]) {
      if (!has(ctx, side, other)) continue
      ctx.removeBuff(side, other, timer, fv)
      if (ctx.getBuff(side, BUFF_EXCITEMENT)?.saveData === EXCITED_BY_WEATHER) {
        ctx.removeBuff(side, BUFF_EXCITEMENT, timer, fv)
      }
      return SKILL_SUCCESS
    }
    ctx.addBuff(self, own, timer, fv)
    finish(ctx, self, fv, timer, cost)
    if (!has(ctx, self, BUFF_EXCITEMENT)) excite(ctx, self, fv, timer, EXCITED_BY_WEATHER)
    return SKILL_SUCCESS
  }
}

/**
 * 3814 Wine (fight begin): HitMul - WineTime, CritMul + Crit on the target. The script shows
 * skill 2829 for female casters, but the engine overwrites the id afterwards, so it never shows.
 */
const wine: SkillScript = (ctx, _self, target, fv, timer, skill) => {
  const hitLoss = atLevel(
    [12, 16, 21, 25, 30, 5.861, 6.13, 6.387, 6.625, 6.838, 7.048, 7.24, 7.425],
    skill,
  )
  const crit = atLevel([3, 4, 6, 7, 8], skill)
  if (has(ctx, target, BUFF_WINE)) return SKILL_LOSE
  ctx.addBuff(target, BUFF_WINE, timer, fv, hitLoss, crit)
  return SKILL_SUCCESS
}

/** 3819 Heaven Curse Mark (fight begin): marks the caster once, free. */
const curseMark: SkillScript = (ctx, self, _target, fv, timer) => {
  if (has(ctx, self, BUFF_CURSE_MARK)) return SKILL_LOSE
  ctx.addBuff(self, BUFF_CURSE_MARK, timer, fv)
  exciteByGates(ctx, self, fv, timer)
  return SKILL_SUCCESS
}

/** FightBuff.ini `overlying` (0 when missing, like BuffInfo.java). */
const overlying = (id: number) =>
  (fightBuffs as Record<string, { overlying?: number }>)[id]?.overlying ?? 0

/**
 * 3820 Waterfall (before being attacked): stuns the target, at most 3 times per target (ones
 * digit of its 8888 SaveData) and puts out its burn. It first needs a random buff of the caster
 * with overlying 1 (original quirk). Level 1-2 deal 0 damage; level 3+ multiply the damage by
 * 28-56 and stun for 0 units (half-finished table, kept).
 */
const waterfall: SkillScript = (ctx, self, target, fv, timer, skill) => {
  let cost = Math.trunc(baseMpCost(self.level) * 1.3)
  const stun = atLevel([600, 600], skill)
  let water = atLevel([0, 0, 28, 30, 33, 36, 39, 42, 45, 47, 50, 53, 56], skill)
  const check = self.buffs?.length ? self.buffs[ctx.randInt(0, self.buffs.length - 1)] : undefined
  if (!check || overlying(check.id) !== 1) return SKILL_LOSE
  if (has(ctx, self, BUFF_VESSEL_DESTROY)) cost *= 2
  if (has(ctx, self, BUFF_DEATH_SEAL)) water *= DEATH_SEALED
  if (has(ctx, self, BUFF_SEAL)) return SKILL_LOSE
  const init = ctx.getBuff(target, BUFF_IMMUNITY)
  if (!init || init.saveData % 10 >= MAX_STUNS || self.mp < cost) return SKILL_LOSE
  ctx.attack(self, target, ctx.getDamage(self) * water, fv, timer)
  if (fv.hit !== false && !has(ctx, target, BUFF_SUBSTITUTE)) {
    if (has(ctx, target, BUFF_STUN)) ctx.removeBuff(target, BUFF_STUN, timer, fv)
    ctx.addBuff(target, BUFF_STUN, timer, fv, stun)
    init.saveData += 1
    if (has(ctx, target, BUFF_BURN)) ctx.removeBuff(target, BUFF_BURN, timer, fv)
  }
  finish(ctx, self, fv, timer, cost)
  return SKILL_SUCCESS
}

/** 3821 Prayer (on damaged): no damage for BlessTime, once per fight (8888 SaveData1 digit). */
const prayer: SkillScript = (ctx, self, _target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 0.8)
  const bless = atLevel([900, 900, 190, 209, 229, 248, 267, 286, 305, 324, 343, 362, 381], skill)
  if (has(ctx, self, BUFF_SEAL)) return SKILL_LOSE
  const init = ctx.getBuff(self, BUFF_IMMUNITY)
  if (!init || ((init.saveData1 ?? 0) % 1000000) / 100000 >= 1) return SKILL_LOSE
  if (self.mp < cost || has(ctx, self, BUFF_PRAYER)) return SKILL_LOSE
  ctx.addBuff(self, BUFF_PRAYER, timer, fv, bless)
  init.saveData1 = (init.saveData1 ?? 0) + 100000
  finish(ctx, self, fv, timer, cost)
  const excitement = ctx.getBuff(self, BUFF_EXCITEMENT)
  if (!excitement) excite(ctx, self, fv, timer, EXCITED_BY_PRAYER)
  else if (excitement.saveData === 1) {
    excitement.saveData = EXCITED_BY_PRAYER
    excitement.lifeTime = EXCITED_BY_PRAYER
  }
  return SKILL_SUCCESS
}

/**
 * 3822 Flying Thunder God (before attacking): opens with a storm cloud on the target (SaveData
 * skill level, SaveData1 caster level), then moves it to the other side 30 % of the time, free.
 */
const flyingThunderGod: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 3.8)
  const level = skill?.level ?? 0
  if (has(ctx, self, BUFF_SEAL)) return SKILL_LOSE
  const selfCloud = has(ctx, self, BUFF_STORM_CLOUD)
  if (!selfCloud && !has(ctx, target, BUFF_STORM_CLOUD)) {
    if (self.mp < cost) return SKILL_LOSE
    ctx.addBuff(target, BUFF_STORM_CLOUD, timer, fv, level, self.level)
    finish(ctx, self, fv, timer, cost)
    return SKILL_SUCCESS
  }
  if (ctx.randInt(0, 99) >= STORM_MOVE_CHANCE) return SKILL_LOSE
  const [from, to] = selfCloud ? [self, target] : [target, self]
  ctx.removeBuff(from, BUFF_STORM_CLOUD, timer, fv)
  ctx.addBuff(to, BUFF_STORM_CLOUD, timer, fv, level, self.level)
  return SKILL_SUCCESS
}

/**
 * 3825 Puppet (after hitting): physical strike that poisons once per target (8888 SaveData
 * digit). Its MP cost (7-23 at level 3+) is never paid (original behaviour).
 */
const puppet: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const physical = atLevel(
    [0.6, 0.6, 0.54, 0.57, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75, 0.78, 0.81, 0.84],
    skill,
  )
  const init = ctx.getBuff(target, BUFF_IMMUNITY)
  if (!init) return SKILL_LOSE
  const substitute = has(ctx, target, BUFF_SUBSTITUTE)
  ctx.attack(self, target, ctx.getDamage(self) * physical, fv, timer)
  if (fv.hit !== false && !substitute && (init.saveData % 1000000) / 100000 < 1) {
    ctx.addBuff(target, BUFF_POISON, timer, fv)
    init.saveData += 100000
  }
  return SKILL_SUCCESS
}

/**
 * 3826 Substitution (before being attacked): with Chance %, a substitute (11840) takes the next
 * hit, carrying the attacker's burn. Always "fails", so it never shows in the replay.
 */
const substitution: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const chance = atLevel(
    [17, 17, 11, 12, 13, 13.082, 13.684, 14.257, 14.789, 15.263, 15.733, 16.16, 16.573],
    skill,
  )
  if (!(ctx.randInt(0, 99) < chance)) return SKILL_LOSE
  const burn = ctx.getBuff(target, BUFF_BURN)
  if (!has(ctx, self, BUFF_SUBSTITUTE)) {
    ctx.addBuff(self, BUFF_SUBSTITUTE, timer, fv, burn ? 1 : 0, burn?.saveData ?? 0)
  }
  return SKILL_LOSE
}

/** 3827 Abyss Gaze (after hitting): drains SaveData % MaxHP and SaveData1 % MaxMP per tick. */
const abyssGaze: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 0.9)
  let drainHp = atLevel([6, 6, 10, 45, 52, 59, 66, 73, 80, 87, 94, 101, 108], skill)
  const drainMp = atLevel([6, 6, 10, 22, 26, 29, 33, 36, 40, 43, 47, 50, 54], skill)
  if (has(ctx, self, BUFF_DEATH_SEAL)) drainHp *= DEATH_SEALED
  if (self.mp < cost || has(ctx, target, BUFF_DRAIN)) return SKILL_LOSE
  ctx.addBuff(target, BUFF_DRAIN, timer, fv, drainHp, drainMp)
  finish(ctx, self, fv, timer, cost)
  return SKILL_SUCCESS
}

export const NINJUTSU_TRIGGER_B_SKILLS: Record<string, SkillScript> = {
  'skill/skill_fengxianhuo_3809.js': phoenixFlower,
  'skill/skill_bamendunjia_3810.js': eightGates,
  'skill/skill_fengshazhen_3811.js': sandStorm,
  'skill/skill_yinbaoniantu_3812.js': clayBomb,
  'skill/skill_wu_3813.js': weather(BUFF_FOG, BUFF_SUNSET),
  'skill/skill_jiu_3814.js': wine,
  'skill/skill_riluo_3815.js': weather(BUFF_SUNSET, BUFF_FOG),
  'skill/skill_tianzhizhouyin_3819.js': curseMark,
  'skill/skill_pubu_3820.js': waterfall,
  'skill/skill_qidao_3821.js': prayer,
  'skill/skill_feileishen_3822.js': flyingThunderGod,
  'skill/skill_kuilei_3825.js': puppet,
  'skill/skill_tishenshu_3826.js': substitution,
  'skill/skill_nailuojian_3827.js': abyssGaze,
}
