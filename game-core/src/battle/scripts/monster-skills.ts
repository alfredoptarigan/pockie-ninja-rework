// Monster attack skills of the first fields (npc-record-values AttackSkill 1012 / 1018 / 1026 /
// 1027). Each costs a share of MaxMP and falls back to the normal attack without enough MP.
// Rhino writes numbers into Java int fields by truncation, so MP and DecMP are truncated.
// ponytail: GetInitMaxMP() equals MaxMP because nothing changes MaxMP during a fight yet.
import {
  SKILL_SUCCESS,
  type FightContext,
  type Fighter,
  type FightEvent,
  type SkillScript,
} from '../types.js'

const BUFF_POISON = 11811
const BUFF_EARTH_WALL = 11824
const BUFF_BLIND = 11843
const BLIND_HIT = 480
const STRIKE_MUL = 1.2

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

export const MONSTER_SKILLS: Record<string, SkillScript> = {
  'skill/skill_taiyangquan_40027.js': sunFist,
  // Bite: poison on hit (SaveData MaxMP * AtkTime / 18000; the buff sets its own LifeTime).
  'skill/skill_dingyao_40023.js': mpStrike(0.15, {
    after: (ctx, self, target, fv, timer) => {
      if (fv.hit !== false) {
        ctx.addBuff(target, BUFF_POISON, timer, fv, (self.maxMp * target.atkTime) / 18000)
      }
    },
  }),
  // Blade Light: removes the earth wall first.
  'skill/skill_daoguang_40031.js': mpStrike(0.17, {
    before: (ctx, _self, target, fv, timer) => {
      if (ctx.getBuff(target, BUFF_EARTH_WALL)) ctx.removeBuff(target, BUFF_EARTH_WALL, timer, fv)
    },
  }),
  // Launch: delays the target's next action by MaxMP * AtkTime / 12000, hit or miss.
  'skill/skill_tiaofei_40033.js': mpStrike(0.15, {
    after: (ctx, self, target) =>
      ctx.changeNextAtkTime(target, (self.maxMp * target.atkTime) / 12000),
  }),
  'skill/skill_lianzhan_40036.js': mpStrike(0.15, { mul: comboMul }),
}
