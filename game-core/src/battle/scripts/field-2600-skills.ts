// Monster skills of the 2601-2605 fields. Same conventions as ./monster-skills.ts: costs are a
// share of InitMaxMP (= MaxMP here) and Java int fields truncate.
import fightBuffs from '../../../../server/data/game/fight-buffs.json'
import {
  SKILL_LOSE,
  SKILL_SUCCESS,
  type ActiveBuff,
  type FightContext,
  type Fighter,
  type SkillScript,
} from '../types.js'
import { mpStrike, pay } from './monster-skills.js'

const BUFF_IMMUNITY = 8888
const BUFF_POISON = 11811
const BUFF_DAZE = 11826
const BUFF_BIND = 11837
const BUFF_BLEED = 11838
const BUFF_VESSEL_DESTROY = 11839
const BIND_UNITS = 2
const DRAIN_VAMPIRIC = 50
const LASH_MUL = 1.2

/** FightBuff.ini `overlying` (0 when missing, like BuffInfo.java). */
const overlying = (id: number) =>
  (fightBuffs as Record<string, { overlying?: number }>)[id]?.overlying ?? 0

/** FightSystem.GetRollBuff: a random buff of the fighter, RandInt(0, size - 1). */
function rollBuff(ctx: FightContext, fighter: Fighter): ActiveBuff | undefined {
  if (!fighter.buffs?.length) return undefined
  return fighter.buffs[ctx.randInt(0, fighter.buffs.length - 1)]
}

/** skill_tunchi_40019.js MP cost: level-based, doubled under Vessel Destroy. */
function devourCost(ctx: FightContext, self: Fighter) {
  const l = self.level
  const growth =
    (20 + l - 1 + Math.trunc(l / 3 + 1) * 8 + ((Math.trunc((l - 1) / 10) * 7 + 14) / 3) * 8) / 12
  const cost = Math.trunc((200 + 20 * (l - 1) * (1 + growth * 0.01)) / 30)
  return ctx.getBuff(self, BUFF_VESSEL_DESTROY) ? cost * 2 : cost
}

/** 40018: removes a random buff of its own (8888 included); attacks normally without one. */
const devourSelf: SkillScript = (ctx, self, target, fv, timer) => {
  const buff = rollBuff(ctx, self)
  const cost = self.maxMp * 0.15
  if (!buff || self.mp < cost) return ctx.normalAttack(self, target, fv, timer)
  ctx.removeBuff(self, buff.id, timer, fv)
  pay(self, fv, cost)
  return SKILL_SUCCESS
}

/**
 * 40019 (also 60004): removes a random buff of the target, but only one with overlying 0 in
 * FightBuff.ini, so most rolls fail (original behaviour).
 */
const devour: SkillScript = (ctx, self, target, fv, timer) => {
  const cost = devourCost(ctx, self)
  const buff = rollBuff(ctx, target)
  if (!buff || overlying(buff.id) !== 0) return SKILL_LOSE
  if (self.mp < cost || buff.id === BUFF_IMMUNITY) return SKILL_LOSE
  ctx.removeBuff(target, buff.id, timer, fv)
  pay(self, fv, cost)
  return SKILL_SUCCESS
}

/**
 * 40026: binds the target (SaveData 2), no damage. The original checks the bind on itself, not
 * on the target, so it re-binds a bound target and never binds while bound itself.
 */
const bind: SkillScript = (ctx, self, target, fv, timer) => {
  const cost = self.maxMp * 0.23
  if (self.mp < cost || ctx.getBuff(self, BUFF_BIND)) {
    return ctx.normalAttack(self, target, fv, timer)
  }
  ctx.addBuff(target, BUFF_BIND, timer, fv, BIND_UNITS)
  pay(self, fv, cost)
  return SKILL_SUCCESS
}

/** 40030 (after hit): strikes for its own cost * 1.2. */
const lash: SkillScript = (ctx, self, target, fv, timer) => {
  const cost = self.maxMp * 0.11
  if (self.mp < cost) return SKILL_LOSE
  ctx.attack(self, target, cost * LASH_MUL, fv, timer)
  pay(self, fv, cost)
  return SKILL_SUCCESS
}

export const FIELD_2600_SKILLS: Record<string, SkillScript> = {
  'skill/skill_tunchi_40018.js': devourSelf,
  'skill/skill_tunchi_40019.js': devour,
  'skill/skill_chanrao_40026.js': bind,
  'skill/skill_fanyao_40030.js': lash,
  // Peck: bleed on hit for SaveData MaxMP * target AtkTime / 8000.
  'skill/skill_zhuoshi_40021.js': mpStrike(0.15, {
    after: (ctx, self, target, fv, timer) => {
      if (fv.hit !== false) {
        ctx.addBuff(target, BUFF_BLEED, timer, fv, (self.maxMp * target.atkTime) / 8000)
      }
    },
  }),
  // Drain: x1 strike with VampiricHP + 50; draining a poisoned target poisons itself.
  'skill/skill_xixue_40022.js': mpStrike(0.12, {
    mul: () => 1,
    before: (_ctx, self) => {
      self.vampiricHp += DRAIN_VAMPIRIC
    },
    after: (ctx, self, target, fv, timer) => {
      self.vampiricHp -= DRAIN_VAMPIRIC
      if (fv.hit !== false && ctx.getBuff(target, BUFF_POISON)) {
        ctx.addBuff(self, BUFF_POISON, timer, fv)
      }
    },
  }),
  // Pollen: daze on hit.
  'skill/skill_huafen_40025.js': mpStrike(0.15, {
    after: (ctx, _self, target, fv, timer) => {
      if (fv.hit !== false) ctx.addBuff(target, BUFF_DAZE, timer, fv)
    },
  }),
}
