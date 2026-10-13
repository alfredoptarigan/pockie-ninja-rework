// Las Noches boss skills 5 Poison Mist, 6 Darkness, 7 Needles, 8 Big Rasengan and their buffs
// 11885 (11886 Dark Walk lives in las-noches-b-buffs.ts). Only level 1 rows exist; other levels keep
// 0 like the scripts' switch.
import type { BuffScripts } from '../buffs.js'
import {
  SKILL_SUCCESS,
  type FightContext,
  type Fighter,
  type FightEvent,
  type SkillInput,
  type SkillScript,
} from '../types.js'
import { baseMpCost } from './ninjutsu-attack.js'

const BUFF_IMMUNITY = 8888
const BUFF_DEATH_SEAL = 11808
const BUFF_SEAL = 11812
const BUFF_CURSE = 11823
const BUFF_EARTH_WALL = 11824
const BUFF_DRAIN = 11836
const BUFF_VESSEL_DESTROY = 11839
const BUFF_SUBSTITUTE = 11840
const BUFF_BIG_RASENGAN_MARK = 11882
const BUFF_POISON_MIST = 11885
const BUFF_DARKNESS = 11886

const DEATH_SEALED = 0.3
const MIST_USED = 10000
const MIST_TIME = 10000
const MIST_DEFENSE = 50
const DARKNESS_TIME = 800
const NEEDLES_COST = 100
const NEEDLES_DEFENSE = 1000
const DEFENSE_CURVE = 1354
const RASENGAN_BACK = 0.1

/** The skill.ini rows the scripts ChangeSkill to (guarded against skills.json by a test). */
export const LAS_NOCHES_ROWS = {
  heavyStrike: {
    id: 2,
    type: 1,
    quomodo: 2,
    effect: 1,
    probability: 50,
    canbecounter: 1,
    decmp: 0,
    level: 1,
    mul: 1,
    add: 0,
    secondid: 2,
    javascript: 'skill/skill_guaiwuzhongji_2.js',
  },
  darkness: {
    id: 6,
    type: 1,
    quomodo: 1,
    effect: 1,
    probability: 0,
    canbecounter: 0,
    decmp: 0,
    level: 1,
    secondid: 6,
    javascript: 'skill/skill_heianxingzhishu_6.js',
  },
  fireball: {
    id: 1808,
    type: 1,
    quomodo: 1,
    effect: 1,
    probability: 33,
    canbecounter: 0,
    decmp: 0,
    level: 1,
    secondid: 1808,
    javascript: 'skill/skill_huoqiu_1808.js',
  },
} satisfies Record<string, SkillInput>

type Ctx = FightContext

const has = (ctx: Ctx, fighter: Fighter, buffId: number) =>
  ctx.getBuff(fighter, buffId) !== undefined
const hits = (fv: FightEvent) => fv.hit !== false
const atLevel1 = (value: number, skill?: SkillInput) => (skill?.level === 1 ? value : 0)

/** ToInt(BaseMPCost * rate), doubled while the caster's vessels are destroyed. */
function mpCost(ctx: Ctx, self: Fighter, rate: number) {
  const cost = Math.trunc(baseMpCost(self.level) * rate)
  return has(ctx, self, BUFF_VESSEL_DESTROY) ? cost * 2 : cost
}

/** Pays the MP and ends a drain (11836) on the caster. */
function finish(ctx: Ctx, self: Fighter, fv: FightEvent, timer: number, cost: number) {
  self.mp -= cost
  fv.decMp = cost
  if (has(ctx, self, BUFF_DRAIN)) ctx.removeBuff(self, BUFF_DRAIN, timer, fv)
  return SKILL_SUCCESS
}

/** A 0-99 roll picks the first row it is below, else the normal attack (ChangeSkill + UserSkill). */
function fallback(
  ctx: Ctx,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  timer: number,
  table: [number, SkillInput][],
) {
  const r = ctx.randInt(0, 99)
  const row = table.find(([bound]) => r < bound)?.[1]
  return row
    ? ctx.changeSkill(self, target, row, fv, timer)
    : ctx.normalAttack(self, target, fv, timer)
}

const MIST_FALLBACK: [number, SkillInput][] = [
  [33, LAS_NOCHES_ROWS.fireball],
  [63, LAS_NOCHES_ROWS.darkness],
]

/**
 * 5 Poison Mist: once per duel (counted in the target's 8888 SaveData1, digit 10000) a damage x1
 * strike for 4x the base MP that adds 11885 (-50 % defence) for 10000 units, halved by a curse.
 */
const poisonMist: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const immunity = ctx.getBuff(target, BUFF_IMMUNITY)
  // Original: SaveData1 % 100000 / 10000 < 1 in floating point.
  if (!immunity || (immunity.saveData1 ?? 0) % 100000 >= MIST_USED) {
    return fallback(ctx, self, target, fv, timer, MIST_FALLBACK)
  }
  const cost = mpCost(ctx, self, 4)
  if (self.mp < cost) return fallback(ctx, self, target, fv, timer, MIST_FALLBACK)
  let mul = atLevel1(1, skill)
  const defenseDown = atLevel1(MIST_DEFENSE, skill)
  if (has(ctx, self, BUFF_DEATH_SEAL)) mul *= DEATH_SEALED
  ctx.attack(self, target, ctx.getDamage(self) * mul, fv, timer)
  immunity.saveData1 = (immunity.saveData1 ?? 0) + MIST_USED
  finish(ctx, self, fv, timer, cost)
  // The substitute is checked after the strike here (the attack ninjutsu check it before).
  if (hits(fv) && !has(ctx, target, BUFF_SUBSTITUTE)) {
    if (has(ctx, target, BUFF_POISON_MIST)) ctx.removeBuff(target, BUFF_POISON_MIST, timer, fv)
    const time = has(ctx, target, BUFF_CURSE) ? MIST_TIME * 0.5 : MIST_TIME
    ctx.addBuff(target, BUFF_POISON_MIST, timer, fv, time, defenseDown)
  }
  return SKILL_SUCCESS
}

/**
 * 6 Darkness: a damage x1 strike for the base MP that adds 11886 (slower, -430 hit, -290 dodge)
 * for 800 units and delays the target by half its (already slowed) AtkTime.
 */
const darkness: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 1)
  // An already slowed target falls back, so the script's own "remove 11886" never runs.
  if (self.mp < cost || has(ctx, target, BUFF_DARKNESS)) {
    return fallback(ctx, self, target, fv, timer, [[33, LAS_NOCHES_ROWS.fireball]])
  }
  let mul = atLevel1(1, skill)
  if (has(ctx, self, BUFF_DEATH_SEAL)) mul *= DEATH_SEALED
  ctx.attack(self, target, ctx.getDamage(self) * mul, fv, timer)
  finish(ctx, self, fv, timer, cost)
  if (hits(fv) && !has(ctx, target, BUFF_SUBSTITUTE)) {
    ctx.addBuff(target, BUFF_DARKNESS, timer, fv, DARKNESS_TIME, 0)
    ctx.changeNextAtkTime(target, target.atkTime * 0.5)
  }
  return SKILL_SUCCESS
}

/**
 * 7 Needles: 100 MP for a strike as if the target had 1000 less defence (twice that at 1000
 * defence or less); breaks an earth wall first.
 */
const needles: SkillScript = (ctx, self, target, fv, timer) => {
  const cost = has(ctx, self, BUFF_VESSEL_DESTROY) ? NEEDLES_COST * 2 : NEEDLES_COST
  if (self.mp < cost) return ctx.normalAttack(self, target, fv, timer)
  const defense = target.defense
  const full = 1 - defense / (defense + DEFENSE_CURVE)
  const lowered = 1 - (defense - NEEDLES_DEFENSE) / (defense - NEEDLES_DEFENSE + DEFENSE_CURVE)
  let mul = defense > NEEDLES_DEFENSE ? lowered / full : (2 * lowered) / full
  if (has(ctx, self, BUFF_DEATH_SEAL)) mul *= DEATH_SEALED
  if (has(ctx, target, BUFF_EARTH_WALL)) ctx.removeBuff(target, BUFF_EARTH_WALL, timer, fv)
  ctx.attack(self, target, ctx.getDamage(self) * mul, fv, timer)
  return finish(ctx, self, fv, timer, cost)
}

const RASENGAN_FALLBACK: [number, SkillInput][] = [[50, LAS_NOCHES_ROWS.heavyStrike]]

/**
 * 8 Big Rasengan: on a target marked with 11882, damage + 2000-3000 (death seal: bonus x0.3) for
 * 1.4x the base MP; the caster takes 10 % of it.
 */
const bigRasengan: SkillScript = (ctx, self, target, fv, timer, skill) => {
  if (!has(ctx, target, BUFF_BIG_RASENGAN_MARK) || has(ctx, self, BUFF_SEAL)) {
    return fallback(ctx, self, target, fv, timer, RASENGAN_FALLBACK)
  }
  const cost = mpCost(ctx, self, 1.4)
  if (self.mp < cost) return fallback(ctx, self, target, fv, timer, RASENGAN_FALLBACK)
  let bonus = skill?.level === 1 ? ctx.randInt(2000, 3000) : 0
  if (has(ctx, self, BUFF_DEATH_SEAL)) bonus *= DEATH_SEALED
  const damage = ctx.getDamage(self) + bonus
  ctx.attack(self, target, damage, fv, timer, damage * RASENGAN_BACK)
  return finish(ctx, self, fv, timer, cost)
}

export const LAS_NOCHES_A_SKILLS: Record<string, SkillScript> = {
  'skill/skill_duwu_5.js': poisonMist,
  'skill/skill_heianxingzhishu_6.js': darkness,
  'skill/skill_zhenci_7.js': needles,
  'skill/skill_dayuluoxuanwan_8.js': bigRasengan,
}

const MIST_PIERCE = 430
const MIST_PARRY = 290
const MIST_TOUGH = 410

/** buff_duwu_11885.js on add (sign 1) and remove (sign -1); Parry is the parry percent. */
function mist(ctx: Ctx, self: Fighter, defenseDown: number, sign: number) {
  ctx.changeDefense(self, self.defenseAdd, self.defenseMul - sign * defenseDown)
  self.pierce -= sign * MIST_PIERCE
  self.parryPercent -= sign * MIST_PARRY
  self.tough -= sign * MIST_TOUGH
}

export const LAS_NOCHES_A_BUFFS: Record<string, BuffScripts> = {
  // Poison mist (5): for SaveData units, DefenseMul - SaveData1 and lower Pierce, Parry, Tough.
  'buff/buff_duwu_11885.js': {
    onAdd: (ctx, self, buff) => {
      buff.lifeTime = buff.saveData
      mist(ctx, self, buff.saveData1 ?? 0, 1)
    },
    onRemove: (ctx, self, buff) => mist(ctx, self, buff.saveData1 ?? 0, -1),
  },
}
