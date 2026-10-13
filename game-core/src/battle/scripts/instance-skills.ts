// Instance monster skills: 2 Heavy Strike and 3 Heavy Attack (Las Noches, pub fights, toll gates)
// and the arena event Lucky Cat 9999 with its buff 99999.
import type { BuffScripts } from '../buffs.js'
import { BUFF_IMMUNITY } from './parry.js'
import { pay } from './monster-skills.js'
import { SKILL_SUCCESS, type FightContext, type Fighter, type SkillScript } from '../types.js'

const BUFF_ILLUSION = 11836
const BUFF_VESSEL_DESTROY = 11839
const BUFF_LUCKY_CAT = 99999
const HEAVY_ATTACK_MUL = 3
const HEAVY_ATTACK_COST_RATE = 0.1
const LUCKY_CAT_ATK_MUL = 30
const LUCKY_CAT_DODGE = 99
const LUCKY_CAT_CRIT = 480

/** skill_guaiwuzhongji_2.js: half the level-based base cost, truncated (LogicTool.ToInt). */
function heavyStrikeCost({ level }: Fighter) {
  const t = Math.trunc
  const growth =
    ((20 + level - 1 + t(level / 3 + 1) * 8 + ((t((level - 1) / 10) * 7 + 14) / 3) * 8) / 12) * 0.01
  const base = (200 + 20 * (level - 1) * (1 + growth)) / 30
  return t(base * 0.5)
}

/**
 * The shared shape of 2 and 3: cost doubled by Vessel Destroy, normal attack without the MP or
 * before the target got its 8888 buff, then damage * mul hit or miss, pay, and drop Illusion.
 */
function instanceStrike(cost: (self: Fighter) => number, mul: number): SkillScript {
  return (ctx, self, target, fv, timer) => {
    const mpCost = ctx.getBuff(self, BUFF_VESSEL_DESTROY) ? cost(self) * 2 : cost(self)
    if (self.mp < mpCost || !ctx.getBuff(target, BUFF_IMMUNITY)) {
      return ctx.normalAttack(self, target, fv, timer)
    }
    ctx.attack(self, target, ctx.getDamage(self) * mul, fv, timer)
    pay(self, fv, mpCost)
    if (ctx.getBuff(self, BUFF_ILLUSION)) ctx.removeBuff(self, BUFF_ILLUSION, timer, fv)
    return SKILL_SUCCESS
  }
}

/** skill_zhaocaimao_9999.js (fight begin): buff 99999 on the target, shown as a miss. */
const luckyCat: SkillScript = (ctx, _self, target, fv, timer) => {
  ctx.addBuff(target, BUFF_LUCKY_CAT, timer, fv)
  fv.hit = false
  return SKILL_SUCCESS
}

export const INSTANCE_SKILLS: Record<string, SkillScript> = {
  'skill/skill_guaiwuzhongji_2.js': instanceStrike(heavyStrikeCost, 1),
  'skill/skill_guaiwuqiangligongji_2.js': instanceStrike(
    (self) => self.maxMp * HEAVY_ATTACK_COST_RATE,
    HEAVY_ATTACK_MUL,
  ),
  'skill/skill_zhaocaimao_9999.js': luckyCat,
}

/**
 * buff_zhaocaimao_99999.js: -30 % attack, -99 DodgeMulAdd, -480 CritMul and Tough on add (sign 1),
 * restored on remove (sign -1).
 */
function luckyCatCurse(ctx: FightContext, self: Fighter, sign: number) {
  // Original quirk: only a level 1 owner is affected, so the cat does nothing above level 1.
  if (self.level !== 1) return
  const atk = sign * LUCKY_CAT_ATK_MUL
  ctx.changeAtk(self, self.minAtkMul - atk, self.maxAtkMul - atk)
  ctx.changeDodge(self, self.dodgeMulAdd - sign * LUCKY_CAT_DODGE)
  self.crit -= sign * LUCKY_CAT_CRIT
  self.tough -= sign * LUCKY_CAT_CRIT
}

export const INSTANCE_BUFFS: Record<string, BuffScripts> = {
  'buff/buff_zhaocaimao_99999.js': {
    onAdd: (ctx, self) => luckyCatCurse(ctx, self, 1),
    onRemove: (ctx, self) => luckyCatCurse(ctx, self, -1),
  },
}
