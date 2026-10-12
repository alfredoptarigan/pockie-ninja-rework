// Monster skills of the 21xx-25xx fields (npc-record-values AttackSkill / TriggerSkill lists).
// Each costs a share of MaxMP and falls back to the normal attack without enough MP.
// Rhino writes numbers into Java int fields by truncation, so HP, MP and DecMP are truncated.
// ponytail: GetInitMaxHP() / GetInitMaxMP() equal MaxHP / MaxMP because nothing changes them
// during a fight yet.
import {
  SKILL_LOSE,
  SKILL_SUCCESS,
  type FightContext,
  type Fighter,
  type FightEvent,
  type SkillScript,
} from '../types.js'

const BUFF_POISON = 11811
const BUFF_STUN = 11813
const BUFF_EARTH_WALL = 11824
const BUFF_INTERRUPT = 11830
const BUFF_BLIND = 11843
const BLIND_HIT = 480
const STRIKE_MUL = 1.2
const CRUSH_MUL = 0.8
const CRUSH_STUN_UNITS = 2
const HEAL_RATE = 0.1
const BURROW_COST_RATE = 0.19
const BURROW_CHANCE_MUL = 8
const BURROW_CHANCE_DIV = 18000

function pay(self: Fighter, fv: FightEvent, cost: number) {
  self.mp = Math.trunc(self.mp - cost)
  fv.decMp = Math.trunc(cost)
}

type Hook = (...args: Parameters<SkillScript>) => void

/** The shared shape: MP check, optional effect before, damage * mul strike, effect after, pay. */
function mpStrike(
  costRate: number,
  {
    mul = () => STRIKE_MUL,
    before,
    after,
  }: {
    mul?: (ctx: FightContext, fv: FightEvent) => number
    before?: Hook
    after?: Hook
  } = {},
): SkillScript {
  return (ctx, self, target, fv, timer) => {
    const cost = self.maxMp * costRate
    if (self.mp < cost) return ctx.normalAttack(self, target, fv, timer)
    before?.(ctx, self, target, fv, timer)
    const m = mul(ctx, fv)
    ctx.attack(self, target, ctx.getDamage(self) * m, fv, timer)
    after?.(ctx, self, target, fv, timer)
    pay(self, fv, cost)
    return SKILL_SUCCESS
  }
}

/** skill_lianzhan_40036.js: 34 % two strikes x1.1, else 33 % three x1.15, else four x1.2. */
function comboMul(ctx: FightContext, fv: FightEvent) {
  if (ctx.randInt(0, 100) < 34) {
    fv.attackCount = 2
    return 1.1
  }
  if (ctx.randInt(0, 100) < 33) {
    fv.attackCount = 3
    return 1.15
  }
  fv.attackCount = 4
  return 1.2
}

/** skill_lianji_40024.js / 40042: 60 % two strikes x1.1, else three x1.2. */
function comboHitMul(ctx: FightContext, fv: FightEvent) {
  if (ctx.randInt(0, 100) < 60) {
    fv.attackCount = 2
    return 1.1
  }
  fv.attackCount = 3
  return 1.2
}

/** skill_zhiliao_40020.js: heals InitMaxHP * 0.1, or attacks normally at full HP. */
const heal: SkillScript = (ctx, self, target, fv, timer) => {
  const cost = self.maxMp * 0.15
  if (self.mp < cost || self.hp === self.maxHp) return ctx.normalAttack(self, target, fv, timer)
  const amount = Math.min(self.maxHp * HEAL_RATE, self.maxHp - self.hp)
  self.hp = Math.trunc(self.hp + amount)
  fv.incHp = Math.trunc(amount)
  pay(self, fv, cost)
  return SKILL_SUCCESS
}

/**
 * skill_zuandi_40029.js (before being attacked): its own roll against
 * 8 * MaxMP * target AtkTime / 18000, then MaxMP * 0.19 as damage and an interrupt marker.
 */
const burrow: SkillScript = (ctx, self, target, fv, timer) => {
  const cost = self.maxMp * BURROW_COST_RATE
  const chance = (BURROW_CHANCE_MUL * self.maxMp * target.atkTime) / BURROW_CHANCE_DIV
  if (!(ctx.randInt(0, 100) < chance) || self.mp < cost) return SKILL_LOSE
  ctx.attack(self, target, cost, fv, timer)
  if (fv.hit !== false && !ctx.getBuff(target, BUFF_INTERRUPT)) {
    ctx.addBuff(target, BUFF_INTERRUPT, timer, fv)
  }
  pay(self, fv, cost)
  return SKILL_SUCCESS
}

/** skill_taiyangquan_40027.js: blind (HitMul -480 for the duel), no damage. */
const sunFist: SkillScript = (ctx, self, target, fv, timer) => {
  const cost = self.maxMp * 0.23
  if (self.mp < cost || ctx.getBuff(target, BUFF_BLIND)) {
    return ctx.normalAttack(self, target, fv, timer)
  }
  ctx.addBuff(target, BUFF_BLIND, timer, fv, BLIND_HIT)
  pay(self, fv, cost)
  return SKILL_SUCCESS
}

/** Blade Light (skill_daoguang_40031.js and the identical 40037-40040): breaks an earth wall. */
const bladeLight = mpStrike(0.17, {
  before: (ctx, _self, target, fv, timer) => {
    if (ctx.getBuff(target, BUFF_EARTH_WALL)) ctx.removeBuff(target, BUFF_EARTH_WALL, timer, fv)
  },
})
/** Combo Slash (skill_lianzhan_40032.js / 40036) and Combo Hit (skill_lianji_40024.js / 40042). */
const comboSlash = mpStrike(0.15, { mul: comboMul })
const comboHit = mpStrike(0.15, { mul: comboHitMul })

export const MONSTER_SKILLS: Record<string, SkillScript> = {
  'skill/skill_zhiliao_40020.js': heal,
  'skill/skill_taiyangquan_40027.js': sunFist,
  'skill/skill_zuandi_40029.js': burrow,
  // Bite: poison on hit (SaveData MaxMP * AtkTime / 18000; the buff sets its own LifeTime).
  'skill/skill_dingyao_40023.js': mpStrike(0.15, {
    after: (ctx, self, target, fv, timer) => {
      if (fv.hit !== false) {
        ctx.addBuff(target, BUFF_POISON, timer, fv, (self.maxMp * target.atkTime) / 18000)
      }
    },
  }),
  // Crush: damage * 0.8 and a 2-unit stun on a hit.
  'skill/skill_zhongya_40028.js': mpStrike(0.15, {
    mul: () => CRUSH_MUL,
    after: (ctx, _self, target, fv, timer) => {
      if (fv.hit !== false) ctx.addBuff(target, BUFF_STUN, timer, fv, CRUSH_STUN_UNITS)
    },
  }),
  // Launch: delays the target's next action by MaxMP * AtkTime / 12000, hit or miss.
  'skill/skill_tiaofei_40033.js': mpStrike(0.15, {
    after: (ctx, self, target) =>
      ctx.changeNextAtkTime(target, (self.maxMp * target.atkTime) / 12000),
  }),
  'skill/skill_lianji_40024.js': comboHit,
  'skill/skill_lianji_40042.js': comboHit,
  'skill/skill_daoguang_40031.js': bladeLight,
  'skill/skill_daoguang_40037.js': bladeLight,
  'skill/skill_daoguang_40038.js': bladeLight,
  'skill/skill_daoguang_40039.js': bladeLight,
  'skill/skill_daoguang_40040.js': bladeLight,
  'skill/skill_lianzhan_40032.js': comboSlash,
  'skill/skill_lianzhan_40036.js': comboSlash,
}
