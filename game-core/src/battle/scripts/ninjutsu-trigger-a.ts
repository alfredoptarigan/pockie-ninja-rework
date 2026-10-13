// Learnable ninjutsu, trigger batch A (skill_<name>_<id>.js). The level-N row has id
// (N - 1) * 10000 + base and the same script; the script reads skill.ini `level`. Costs are the
// level-based base MP cost times a rate, doubled under Vessel Destroy. Java int fields truncate.
// ponytail: GetInitMaxHP() / GetInitMaxMP() equal MaxHP / MaxMP (nothing changes them in fights).
import fightBuffs from '../../../../server/data/game/fight-buffs.json'
import {
  SKILL_LOSE,
  SKILL_SUCCESS,
  type ActiveBuff,
  type FightContext,
  type Fighter,
  type FightEvent,
  type SkillInput,
  type SkillScript,
} from '../types.js'
import { pay } from './monster-skills.js'
import { BUFF_IMMUNITY } from './parry.js'

const BUFF_PARALYSIS = 11801
const BUFF_FREEZE = 11802
const BUFF_GHOST = 11808
const BUFF_SLOW = 11810
const BUFF_POISON = 11811
const BUFF_SEAL = 11812
const BUFF_STUN = 11813
const BUFF_HOT_BLOOD = 11814
const BUFF_CHARM = 11815
const BUFF_NET = 11816
const BUFF_SUNSET = 11822
const BUFF_EARTH_WALL = 11824
const BUFF_GALE = 11825
const BUFF_STATIC_BARRIER = 11831
const BUFF_REGENERATION = 11834
const BUFF_ILLUSION = 11836
const BUFF_VESSEL_DESTROY = 11839
const BUFF_PEG = 11840
const BUFF_EXCITEMENT = 11880
const BUFF_ELEMENT = 11905
/** Killing auras 0-2: their SaveData is the attack bonus of Excitement. */
const KILLING_AURAS = [11853, 11854, 11855]
/** Excitement lasting while a boost lasts; 1 means "one action". */
export const EXCITEMENT_LONG = 999997
const GHOST_HEAL = 0.3
const ELEMENT_BONUS = 0.15
const HOT_BLOOD_BACKLASH = 0.2
const BARRIER_BONUS = 1.2
const MAX_PARALYSES = 4

/** SkillInfo GetLevel(): a level outside 1-13 hits the scripts' empty `default` (0). */
const byLevel = (table: number[], skill?: SkillInput) => table[(skill?.level ?? 0) - 1] ?? 0

/** 1 + 0.01 * ToInt(SkillAddN * 0.01): the per-element bonus of gear and Hot Blood. */
const skillBonus = (self: Fighter, slot: number) =>
  1 + 0.01 * Math.trunc((self.skillAdd[slot] ?? 0) * 0.01)

/** ToInt(BaseMPCost * rate), doubled under Vessel Destroy. */
function mpCost(ctx: FightContext, self: Fighter, rate: number) {
  const l = self.level
  const t = Math.trunc
  const growth = (20 + l - 1 + t(l / 3 + 1) * 8 + ((t((l - 1) / 10) * 7 + 14) / 3) * 8) / 12
  const cost = t(((200 + 20 * (l - 1) * (1 + growth * 0.01)) / 30) * rate)
  return ctx.getBuff(self, BUFF_VESSEL_DESTROY) ? cost * 2 : cost
}

/** FightBuff.ini `overlying`: 0 a boost, 1 a status, 2 bookkeeping. */
const overlying = (id: number) =>
  (fightBuffs as Record<string, { overlying?: number }>)[id]?.overlying ?? 0

/** FightSystem.GetRollBuff: a random buff of the fighter, RandInt(0, size - 1). */
function rollBuff(ctx: FightContext, fighter: Fighter): ActiveBuff | undefined {
  if (!fighter.buffs?.length) return undefined
  return fighter.buffs[ctx.randInt(0, fighter.buffs.length - 1)]
}

const removeIfPresent = (
  ctx: FightContext,
  fighter: Fighter,
  id: number,
  fv: FightEvent,
  timer: number,
) => {
  if (ctx.getBuff(fighter, id)) ctx.removeBuff(fighter, id, timer, fv)
}

/** Pay the MP and drop Illusion, the tail every MP ninjutsu shares. */
function settle(ctx: FightContext, self: Fighter, fv: FightEvent, timer: number, cost: number) {
  pay(self, fv, cost)
  removeIfPresent(ctx, self, BUFF_ILLUSION, fv, timer)
}

/**
 * Excitement (11880) after a boost: added from the first killing aura with SaveData; with
 * `extend`, a one-action Excitement becomes a lasting one.
 */
function excite(
  ctx: FightContext,
  self: Fighter,
  fv: FightEvent,
  timer: number,
  lifeTime: number,
  extend: boolean,
) {
  const excitement = ctx.getBuff(self, BUFF_EXCITEMENT)
  if (!excitement) {
    const aura = KILLING_AURAS.map((id) => ctx.getBuff(self, id)).find((b) => b && b.saveData)
    if (aura) ctx.addBuff(self, BUFF_EXCITEMENT, timer, fv, lifeTime, aura.saveData)
  } else if (extend && excitement.saveData === 1) {
    excitement.saveData = EXCITEMENT_LONG
    excitement.lifeTime = EXCITEMENT_LONG
  }
}

/** Sunset (11822) melt roll and the element passive (11905) of the damage ninjutsu. */
function damageBonus(ctx: FightContext, self: Fighter) {
  const sunset = ctx.getBuff(self, BUFF_SUNSET)
  const melt = sunset && ctx.randInt(0, 99) < sunset.saveData ? 1 : 0
  return 1 + melt + (ctx.getBuff(self, BUFF_ELEMENT) ? ELEMENT_BONUS : 0)
}

/** The strike of 1802 / 1813: damage * mul, Hot Blood hurts the caster for 20 % of it. */
function strike(
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  timer: number,
  mul: number,
) {
  // The melt roll comes before GetDamage's own roll.
  const bonus = damageBonus(ctx, self)
  const damage = ctx.getDamage(self) * mul * bonus
  const back = ctx.getBuff(self, BUFF_HOT_BLOOD) ? damage * HOT_BLOOD_BACKLASH : 0
  ctx.attack(self, target, damage, fv, timer, back)
}

// ponytail: fv.IsNeglectDef (the replay flag of a Sunset melt) is not recorded.

const THUNDER = [0.8, 0.8, 0.64, 0.68, 0.73, 0.77, 0.81, 0.85, 0.9, 0.94, 0.98, 1.03, 1.07]
const PARALYSIS = [350, 350]

/** 1802 Falling Thunder (after hit): strike, then a paralysis (at most 4 per duel). */
const fallingThunder: SkillScript = (ctx, self, target, fv, timer, skill) => {
  let mul = byLevel(THUNDER, skill) * skillBonus(self, 3)
  let paralysis = byLevel(PARALYSIS, skill)
  if (ctx.getBuff(self, BUFF_STATIC_BARRIER)) {
    mul *= BARRIER_BONUS
    paralysis *= BARRIER_BONUS
  }
  const cost = mpCost(ctx, self, 1)
  const immunity = ctx.getBuff(target, BUFF_IMMUNITY)
  if (ctx.getBuff(self, BUFF_SEAL) || self.mp < cost || !immunity) return SKILL_LOSE
  const peg = ctx.getBuff(target, BUFF_PEG)
  strike(ctx, self, target, fv, timer, mul)
  if (fv.hit !== false && !peg) {
    removeIfPresent(ctx, target, BUFF_STUN, fv, timer)
    if ((immunity.saveData % 1000) / 100 < MAX_PARALYSES && !ctx.getBuff(target, BUFF_FREEZE)) {
      ctx.changeNextAtkTime(target, paralysis)
      removeIfPresent(ctx, target, BUFF_PARALYSIS, fv, timer)
      ctx.addBuff(target, BUFF_PARALYSIS, timer, fv)
      immunity.saveData += 100
    }
  }
  settle(ctx, self, fv, timer, cost)
  return SKILL_SUCCESS
}

/**
 * 1805 Beast Heart (before attack): removes a random own buff if it is a status (overlying 1).
 * Original quirk: the MP recovery table is computed and never used.
 */
const beastHeart: SkillScript = (ctx, self, _target, fv, timer) => {
  const buff = rollBuff(ctx, self)
  if (!buff || overlying(buff.id) !== 1) return SKILL_LOSE
  ctx.removeBuff(self, buff.id, timer, fv)
  return SKILL_SUCCESS
}

const GALE = [1.2, 1.2, 0.54, 0.57, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75, 0.78, 0.81, 0.84]

/** 1813 Gale Palm (after hit): strike for base * 0.8 MP. */
const galePalm: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const mul = byLevel(GALE, skill) * skillBonus(self, 4)
  const cost = mpCost(ctx, self, 0.8)
  if (ctx.getBuff(self, BUFF_SEAL) || self.mp < cost) return SKILL_LOSE
  strike(ctx, self, target, fv, timer, mul)
  settle(ctx, self, fv, timer, cost)
  return SKILL_SUCCESS
}

const DRAIN = [3, 4, 5, 6, 7, 8, 9, 69, 76, 82, 89, 95, 102]
const DEFENSE_BREAK = [50, 69, 89, 108, 127, 141, 160]

/**
 * 1815 Earth Prison (before attacked; 60003 too): drains a share of the target MaxMP, free.
 * Original quirks: the defence loss stacks for the rest of the fight, and levels 8+ drop it.
 */
const earthPrison: SkillScript = (ctx, self, target, fv, _timer, skill) => {
  if (target.mp === 0 || ctx.getBuff(self, BUFF_SEAL)) return SKILL_LOSE
  const draw = byLevel(DRAIN, skill) * 0.01 * target.maxMp
  const lost = Math.min(target.mp, ctx.getBuff(target, BUFF_VESSEL_DESTROY) ? draw * 2 : draw)
  let gained = ctx.getBuff(self, BUFF_VESSEL_DESTROY) ? lost * 0.5 : lost
  if (self.mp + gained > self.maxMp) gained = self.maxMp - self.mp
  self.mp = Math.trunc(self.mp + gained)
  target.mp = Math.trunc(target.mp - lost)
  fv.incMp = Math.trunc(gained)
  fv.targetDecMp = Math.trunc(lost)
  ctx.changeDefense(target, target.defenseAdd - byLevel(DEFENSE_BREAK, skill))
  return SKILL_SUCCESS
}

const SLOW = [1200, 1200, 9, 11, 13, 15, 5.172, 5.389, 5.59, 5.769, 5.947, 6.109, 6.265]

/**
 * 1816 Earth River (before attacked): slows the target for SaveData units and delays it by half
 * its slowed AtkTime. Once per duel, counted on the caster's own 8888 SaveData1 (hundreds).
 * Original quirk: from level 3 the slow lasts only 5-15 units.
 */
const earthRiver: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const time = byLevel(SLOW, skill) * skillBonus(self, 2)
  const cost = mpCost(ctx, self, 1.9)
  if (ctx.getBuff(self, BUFF_SEAL) || self.mp < cost) return SKILL_LOSE
  const immunity = ctx.getBuff(self, BUFF_IMMUNITY)
  if (!immunity || ((immunity.saveData1 ?? 0) % 1000) / 100 >= 1) return SKILL_LOSE
  if (ctx.getBuff(target, BUFF_SLOW)) return SKILL_LOSE
  ctx.addBuff(target, BUFF_SLOW, timer, fv, time, 0)
  ctx.changeNextAtkTime(target, target.atkTime * 0.5)
  immunity.saveData1 = (immunity.saveData1 ?? 0) + 100
  settle(ctx, self, fv, timer, cost)
  return SKILL_SUCCESS
}

const ATTACK_LOSS = [35, 35, 9, 11, 13, 4.945, 5.172, 5.389, 5.59, 5.769, 5.947, 6.109, 6.265]

/**
 * 1826 Flash Step (before attack): AtkTime 1 and less attack until its next action, and the
 * target's next action 1 unit later. Ghost (11808) keeps the full attack.
 */
const flashStep: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const loss = ctx.getBuff(self, BUFF_GHOST) ? 0 : byLevel(ATTACK_LOSS, skill)
  const cost = mpCost(ctx, self, 1.1)
  if (ctx.getBuff(self, BUFF_SEAL) || self.mp < cost) return SKILL_LOSE
  if (ctx.getBuff(self, BUFF_GALE)) return SKILL_LOSE
  ctx.addBuff(self, BUFF_GALE, timer, fv, self.atkTime - 1, loss)
  ctx.changeNextAtkTime(target, 1)
  settle(ctx, self, fv, timer, cost)
  excite(ctx, self, fv, timer, 1, false)
  return SKILL_SUCCESS
}

const PALM_HEAL = [11, 11, 13, 14, 15, 96, 107, 119, 130, 142, 154, 164, 176]
const MAX_HEALS = 3

/** The heals share the units digit of the own 8888 SaveData1: three per duel. */
const healsLeft = (immunity: ActiveBuff | undefined): immunity is ActiveBuff =>
  !!immunity && (immunity.saveData1 ?? 0) % 10 < MAX_HEALS

/**
 * 1829 Mystic Palm (after being hit): heals a share of the missing HP and cures poison.
 * Original quirk: no seal check.
 */
const mysticPalm: SkillScript = (ctx, self, _target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 1.2)
  const rate = byLevel(PALM_HEAL, skill) * (ctx.getBuff(self, BUFF_GHOST) ? GHOST_HEAL : 1)
  const immunity = ctx.getBuff(self, BUFF_IMMUNITY)
  if (!healsLeft(immunity) || self.mp < cost || self.hp === self.maxHp) return SKILL_LOSE
  let heal = rate * skillBonus(self, 9) * 0.01 * (self.maxHp - self.hp)
  if (self.hp + heal > self.maxHp) heal = self.maxHp - self.hp
  self.hp += Math.trunc(heal)
  fv.incHp = Math.trunc(heal)
  pay(self, fv, cost)
  removeIfPresent(ctx, self, BUFF_POISON, fv, timer)
  removeIfPresent(ctx, self, BUFF_ILLUSION, fv, timer)
  immunity.saveData1 = (immunity.saveData1 ?? 0) + 1
  return SKILL_SUCCESS
}

const BARRIER = [18, 18, 19, 25, 31, 39, 47, 56, 66, 76, 87, 98, 111]

/** 1839 Static Barrier (before attacked): a shield of a share of MaxHP, once per duel. */
const staticBarrier: SkillScript = (ctx, self, _target, fv, timer, skill) => {
  const shield = byLevel(BARRIER, skill) * skillBonus(self, 3)
  const cost = mpCost(ctx, self, 3)
  if (ctx.getBuff(self, BUFF_SEAL)) return SKILL_LOSE
  const immunity = ctx.getBuff(self, BUFF_IMMUNITY)
  if (!immunity || ((immunity.saveData1 ?? 0) % 100000) / 10000 >= 1) return SKILL_LOSE
  if (self.mp < cost || ctx.getBuff(self, BUFF_STATIC_BARRIER)) return SKILL_LOSE
  ctx.addBuff(self, BUFF_STATIC_BARRIER, timer, fv, Math.trunc(shield * self.maxHp * 0.01), 0)
  immunity.saveData1 = (immunity.saveData1 ?? 0) + 10000
  settle(ctx, self, fv, timer, cost)
  return SKILL_SUCCESS
}

const YIN_HEAL = [3, 3, 9, 10, 11, 32, 35, 39, 43, 47, 51, 54, 58]
const YIN_TICK = [3, 3]

/**
 * 3802 Yin Healing (on damaged): heals a share of MaxHP now and (levels 1-2 only) once more on
 * each of the next two ticks of Regeneration (11834). Original quirk: no seal check, and levels
 * 3+ still add a Regeneration that heals 0.
 */
const yinHealing: SkillScript = (ctx, self, _target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 0.6)
  const bonus = skillBonus(self, 9)
  const ghost = ctx.getBuff(self, BUFF_GHOST) ? GHOST_HEAL : 1
  let heal = byLevel(YIN_HEAL, skill) * bonus * 0.01 * self.maxHp * ghost
  const tick = byLevel(YIN_TICK, skill) * bonus * 0.01 * self.maxHp * ghost
  if (self.mp < cost || self.hp === self.maxHp) return SKILL_LOSE
  const immunity = ctx.getBuff(self, BUFF_IMMUNITY)
  if (!healsLeft(immunity)) return SKILL_LOSE
  if (heal + self.hp > self.maxHp) heal = self.maxHp - self.hp
  self.hp += Math.trunc(heal)
  removeIfPresent(ctx, self, BUFF_REGENERATION, fv, timer)
  ctx.addBuff(self, BUFF_REGENERATION, timer, fv, tick, 0)
  fv.incHp = Math.trunc(heal)
  pay(self, fv, cost)
  immunity.saveData1 = (immunity.saveData1 ?? 0) + 1
  removeIfPresent(ctx, self, BUFF_ILLUSION, fv, timer)
  excite(ctx, self, fv, timer, EXCITEMENT_LONG, true)
  return SKILL_SUCCESS
}

const REBIRTH = [100, 100, 25, 27, 29, 31, 63.857, 66.534, 69.013, 71.225, 73.421, 75.415, 77.34]
const REBIRTH_DECAY = 12
const REBIRTH_TIME_UNIT = 200
const REBIRTH_HP = 0.25

/**
 * 3803 Rebirth (on death): revives with 25 % InitMaxHP; the chance shrinks by
 * 12 * sqrt(timer / 200). Rolls before the MP check. Original quirk: no seal check.
 */
const rebirth: SkillScript = (ctx, self, _target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 4)
  const chance = byLevel(REBIRTH, skill) - Math.pow(timer / REBIRTH_TIME_UNIT, 0.5) * REBIRTH_DECAY
  if (!(ctx.randInt(0, 99) < chance) || self.mp < cost) return SKILL_LOSE
  let hp = self.maxHp * REBIRTH_HP * skillBonus(self, 9)
  if (ctx.getBuff(self, BUFF_GHOST)) hp *= GHOST_HEAL
  self.hp = Math.trunc(hp)
  fv.incHp = Math.trunc(hp)
  settle(ctx, self, fv, timer, cost)
  return SKILL_SUCCESS
}

const HOT_BLOOD = [2100, 2100, 26, 28, 31, 33, 35, 37, 40, 42, 44, 46, 48]

/**
 * 3804 Hot Blood (before attack): +15 to every SkillAdd for SaveData units, once per duel (own
 * 8888 SaveData1 tens). Original quirks: from level 3 it lasts only 26-48 units, and the +15 only
 * moves a bonus whose SkillAdd crosses a multiple of 100.
 */
const hotBlood: SkillScript = (ctx, self, _target, fv, timer, skill) => {
  const time = byLevel(HOT_BLOOD, skill) * skillBonus(self, 0)
  const cost = mpCost(ctx, self, 2.3)
  if (ctx.getBuff(self, BUFF_SEAL) || self.mp < cost) return SKILL_LOSE
  const immunity = ctx.getBuff(self, BUFF_IMMUNITY)
  if (!immunity || ((immunity.saveData1 ?? 0) % 100) / 10 >= 1) return SKILL_LOSE
  if (ctx.getBuff(self, BUFF_HOT_BLOOD)) return SKILL_LOSE
  ctx.addBuff(self, BUFF_HOT_BLOOD, timer, fv, time, 0)
  immunity.saveData1 = (immunity.saveData1 ?? 0) + 10
  settle(ctx, self, fv, timer, cost)
  excite(ctx, self, fv, timer, EXCITEMENT_LONG, true)
  return SKILL_SUCCESS
}

const CHARM = [1500, 1500]

/**
 * 3805 Seduction (before attacked): charms the target (no action) for SaveData units, once per
 * duel (target 8888 SaveData millions), only when a random buff of the target is a boost
 * (overlying 0). Original quirk: from level 3 the charm lasts 0 units, so it ends before the
 * target acts.
 */
const seduction: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const time = byLevel(CHARM, skill) * skillBonus(self, 8)
  const check = rollBuff(ctx, target)
  if (!check || overlying(check.id) !== 0) return SKILL_LOSE
  const cost = mpCost(ctx, self, 2.4)
  const immunity = ctx.getBuff(target, BUFF_IMMUNITY)
  if (!immunity || (immunity.saveData % 10000000) / 1000000 >= 1) return SKILL_LOSE
  if (self.mp < cost || ctx.getBuff(target, BUFF_CHARM)) return SKILL_LOSE
  ctx.addBuff(target, BUFF_CHARM, timer, fv, time, 0)
  pay(self, fv, cost)
  immunity.saveData += 1000000
  removeIfPresent(ctx, self, BUFF_ILLUSION, fv, timer)
  return SKILL_SUCCESS
}

const WALL = [19, 19, 18, 19, 20, 21, 23.946, 24.95, 25.88, 26.709, 27.533, 28.281, 29.002]

/**
 * 3806 Earth Wall (before attacked, every time): its own roll for the wall (11824).
 * Original quirk: it always returns SKILL_LOSE, so the cast never shows in the replay.
 */
const earthWall: SkillScript = (ctx, self, _target, fv, timer, skill) => {
  const chance = byLevel(WALL, skill) * skillBonus(self, 2)
  if (ctx.getBuff(self, BUFF_SEAL)) return SKILL_LOSE
  if (ctx.randInt(0, 99) < chance && !ctx.getBuff(self, BUFF_EARTH_WALL)) {
    ctx.addBuff(self, BUFF_EARTH_WALL, timer, fv)
  }
  return SKILL_LOSE
}

const NET = [25, 33, 42, 51, 60, 4.579, 4.789, 4.99, 5.176, 5.342, 5.507, 5.656, 5.8]

/**
 * 3807 Net (before attack): lowers the target's dodge by SaveData until its next action. Free, no
 * seal check. Original quirk: from level 6 the dodge loss drops to 4-5.
 */
const net: SkillScript = (ctx, _self, target, fv, timer, skill) => {
  if (ctx.getBuff(target, BUFF_NET)) return SKILL_LOSE
  ctx.addBuff(target, BUFF_NET, timer, fv, byLevel(NET, skill), 0)
  return SKILL_SUCCESS
}

export const NINJUTSU_TRIGGER_A_SKILLS: Record<string, SkillScript> = {
  'skill/skill_luolei_1802.js': fallingThunder,
  'skill/skill_weishouzhixin_1805.js': beastHeart,
  'skill/skill_liefengzhang_1813.js': galePalm,
  'skill/skill_tulao_1815.js': earthPrison,
  'skill/skill_tuliudahe_1816.js': earthRiver,
  'skill/skill_shunbu_1826.js': flashStep,
  'skill/skill_zhangxianshu_1829.js': mysticPalm,
  'skill/skill_jingdianjiejie_1839.js': staticBarrier,
  'skill/skill_yinyushangmie_3802.js': yinHealing,
  'skill/skill_chuangzaozaisheng_3803.js': rebirth,
  'skill/skill_rexue_3804.js': hotBlood,
  'skill/skill_seyoushu_3805.js': seduction,
  'skill/skill_tuliubi_3806.js': earthWall,
  'skill/skill_wang_3807.js': net,
}
