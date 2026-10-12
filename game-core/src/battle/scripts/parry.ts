// skill_gedang_7777.js (on being damaged) and skill_init_8888.js (fight begin): prepare a parry.
import { SKILL_LOSE, type FightContext, type Fighter, type FightEvent } from '../types.js'

export const BUFF_PARRY = 11841
export const BUFF_IMMUNITY = 8888
const PARRY_DELAY = 0.6

function rollParry(
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  timer: number,
) {
  const finalParry = self.parry - target.pierce
  const chance = finalParry > 0 ? finalParry / 16 : 0
  if (ctx.randInt(0, 99) < chance && !ctx.getBuff(self, BUFF_PARRY)) {
    ctx.addBuff(self, BUFF_PARRY, timer, fv, Math.trunc(target.initAtkTime * PARRY_DELAY))
  }
}

/** 7777: always "fails" so it never shows in the replay; the buff does the work. */
export function parry(
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  timer: number,
) {
  rollParry(ctx, self, target, fv, timer)
  return SKILL_LOSE
}

/** 8888: adds the status-immunity bookkeeping buff, then rolls the parry like 7777. */
export function fightBegin(
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  timer: number,
) {
  ctx.addBuff(self, BUFF_IMMUNITY, timer, fv)
  rollParry(ctx, self, target, fv, timer)
  return SKILL_LOSE
}
