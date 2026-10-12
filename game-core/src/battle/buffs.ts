// Fight buffs from RES/skill/FightBuff.ini with their scripts (RES/javascript/buff/*.js).
// ponytail: FightBuff.ini is not part of the imported game data (server/data/game), so the buffs
// the ported skills use are copied here. Import the file when many more buffs are needed.
import type { ActiveBuff, FightContext, Fighter, FightEvent } from './types.js'

type BuffScript = (
  ctx: FightContext,
  self: Fighter,
  buff: ActiveBuff,
  fv: FightEvent,
  timer: number,
) => void

export interface BuffDef {
  /** 1 stat / flag, 2 ticks on each action of its owner, 3 shield */
  type: number
  /** Buffs of the same group replace each other. */
  replace: number
  /** 1 removed when damaged, 2 removed when hit */
  clearType: number
  /** Timeline units; -1 permanent. */
  lifeTime: number
  onAdd?: BuffScript
  onActivation?: BuffScript
  onRemove?: BuffScript
}

const POISON_RATE = 0.0003
const PARRY_PERCENT = 40

export const BUFFS: Record<number, BuffDef> = {
  // buff_init_8888.js: status-immunity counters, nothing the ported skills read yet.
  8888: { type: 1, replace: 8888, clearType: 0, lifeTime: -1 },
  // buff_zhongdu_11811.js (poison): MaxHP * 0.0003 * (100 - DecDamage) per action of the owner.
  // ponytail: the regeneration auras (11861-11863) and freeze (11802) are not ported.
  11811: {
    type: 2,
    replace: 11811,
    clearType: 0,
    lifeTime: 6000,
    onAdd: (_ctx, _self, buff) => {
      buff.lifeTime = 6000
    },
    onActivation: (ctx, self, _buff, fv, timer) => {
      const damage = Math.trunc(self.maxHp * POISON_RATE * 100)
      ctx.damageWithValue(self, damage, fv, timer)
      fv.selfDamage = damage
    },
  },
  // buff_tuliubi_11824.js (earth wall): only removed by 40031 here.
  11824: { type: 1, replace: 11824, clearType: 2, lifeTime: 0 },
  // buff_gedang_11841.js (parry): 40 % less damage from the next hit, then delays the attacker.
  11841: {
    type: 1,
    replace: 11841,
    clearType: 2,
    lifeTime: -1,
    onAdd: (_ctx, self) => {
      self.parryPercent = PARRY_PERCENT
    },
    onRemove: (ctx, self, buff, fv, timer) => {
      self.parryPercent = 0
      ctx.addBuff(self, 11851, timer, fv)
      if (self.opponent) ctx.changeNextAtkTime(self.opponent, buff.saveData)
    },
  },
  // buff_shiming_11843.js (blind): HitMul lowered by SaveData until removed.
  11843: {
    type: 1,
    replace: 11843,
    clearType: 0,
    lifeTime: -1,
    onAdd: (ctx, self, buff) => ctx.changeHit(self, self.hitMulAdd - buff.saveData),
    onRemove: (ctx, self, buff) => ctx.changeHit(self, self.hitMulAdd + buff.saveData),
  },
  // buff_gedangjiasu_11851.js: marker after a parry, no effect.
  11851: { type: 1, replace: 11851, clearType: 0, lifeTime: 0 },
}
