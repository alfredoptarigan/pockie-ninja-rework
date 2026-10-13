// Las Noches boss skills: 5000 Evil Sealing (skill_fengxiefayin_4.js), 60001 Bug Tracking and
// 60002 Spiritual Pressure Rage. Their buffs live in ./las-noches-b-buffs.ts.
import { BUFF_IMMUNITY } from './parry.js'
import { pay } from './monster-skills.js'
import { baseMpCost } from './ninjutsu-attack.js'
import { SKILL_LOSE, SKILL_SUCCESS, type SkillInput, type SkillScript } from '../types.js'

const BUFF_GHOST = 11808
const BUFF_CURSE = 11823
const BUFF_ILLUSION = 11836
const BUFF_VESSEL_DESTROY = 11839
const BUFF_PEG = 11840
const BUFF_BUG_TRACKING = 11882
const BUFF_SPIRIT_RAGE = 11883
const BUFF_EVIL_SEAL = 11884

const SEAL_COST_RATE = 3.1
const SEAL_USED = 10000
const SEAL_TIME = 18000
const SEAL_ATK_LOSS = 70
const GHOST_RATE = 0.3
const CURSE_RATE = 0.5
const TRACKING_MP = 1
const TRACKING_HP = 500
const RAGE_ATK = 200
const RAGE_CRIT = 3

/** skill.ini [5]: Poison Mist (skill_duwu_5.js), what 5000 falls back to. */
const POISON_MIST: SkillInput = {
  id: 5,
  type: 1,
  quomodo: 1,
  effect: 1,
  level: 1,
  probability: 0,
  canbecounter: 0,
  decmp: 0,
  secondid: 5,
  javascript: 'skill/skill_duwu_5.js',
}

/**
 * skill_fengxiefayin_4.js: once per duel (ten-thousands digit of the target's 8888), strike and
 * seal the target with 11884; otherwise use skill 5. Only level 1 exists (other levels deal 0).
 */
const evilSeal: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const init = ctx.getBuff(target, BUFF_IMMUNITY)
  const fallback = () => ctx.changeSkill(self, target, POISON_MIST, fv, timer)
  if (!init || !((init.saveData % 100000) / 10000 < 1)) return fallback()
  let cost = Math.trunc(baseMpCost(self.level) * SEAL_COST_RATE)
  if (ctx.getBuff(self, BUFF_VESSEL_DESTROY)) cost *= 2
  if (self.mp < cost) return fallback()
  let mul = (skill?.level ?? 1) === 1 ? 1 : 0
  if (ctx.getBuff(self, BUFF_GHOST)) mul *= GHOST_RATE
  ctx.attack(self, target, ctx.getDamage(self) * mul, fv, timer)
  init.saveData += SEAL_USED
  pay(self, fv, cost)
  if (ctx.getBuff(self, BUFF_ILLUSION)) ctx.removeBuff(self, BUFF_ILLUSION, timer, fv)
  if (fv.hit !== false && !ctx.getBuff(target, BUFF_PEG)) {
    if (ctx.getBuff(target, BUFF_EVIL_SEAL)) ctx.removeBuff(target, BUFF_EVIL_SEAL, timer, fv)
    const time = ctx.getBuff(target, BUFF_CURSE) ? SEAL_TIME * CURSE_RATE : SEAL_TIME
    ctx.addBuff(target, BUFF_EVIL_SEAL, timer, fv, time, SEAL_ATK_LOSS)
  }
  return SKILL_SUCCESS
}

/** skill_chongzhuizongshu_60001.js (on damaged): marks the target with 11882 for 1 MP, 500 HP. */
const bugTracking: SkillScript = (ctx, self, target, fv, timer) => {
  if (ctx.getBuff(target, BUFF_BUG_TRACKING)) return SKILL_LOSE
  const mp = ctx.getBuff(self, BUFF_VESSEL_DESTROY) ? TRACKING_MP * 2 : TRACKING_MP
  if (self.mp < mp || self.hp < TRACKING_HP) return SKILL_LOSE
  ctx.addBuff(target, BUFF_BUG_TRACKING, timer, fv)
  pay(self, fv, mp)
  // Raw HP loss with no death check, like the original.
  self.hp -= TRACKING_HP
  fv.selfDamage = (fv.selfDamage ?? 0) + TRACKING_HP
  return SKILL_SUCCESS
}

/** skill_lingyakuangbao_60002.js (fight begin): 11883 on itself unless already there. */
const spiritRage: SkillScript = (ctx, self, _target, fv, timer) => {
  if (ctx.getBuff(self, BUFF_SPIRIT_RAGE)) return SKILL_LOSE
  ctx.addBuff(self, BUFF_SPIRIT_RAGE, timer, fv, RAGE_ATK, RAGE_CRIT)
  return SKILL_SUCCESS
}

export const LAS_NOCHES_B_SKILLS: Record<string, SkillScript> = {
  'skill/skill_fengxiefayin_4.js': evilSeal,
  'skill/skill_chongzhuizongshu_60001.js': bugTracking,
  'skill/skill_lingyakuangbao_60002.js': spiritRage,
}
