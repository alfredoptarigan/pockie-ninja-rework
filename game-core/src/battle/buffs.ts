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
const EARTH_WALL_REBOUND = 60
const NEEDLES_REBOUND = 25
const SHIELD_COUNT = 999
const FROZEN_DODGE = 9999

/** OnAdd of the timed control buffs: LifeTime = SaveData. */
// ponytail: the regeneration auras (11861-11863, pets) shorten it and add 11888; not ported.
const lastsSaveData: BuffScript = (_ctx, _self, buff) => {
  buff.lifeTime = buff.saveData
}

/** buff_xuanyun_11813.js (stun) and buff_seyou_11815.js (seduction): no action for SaveData. */
const STUN: BuffDef = {
  type: 1,
  replace: 11801,
  clearType: 0,
  lifeTime: -1,
  onAdd: (ctx, self, buff, fv, timer) => {
    lastsSaveData(ctx, self, buff, fv, timer)
    self.canMove -= 1
  },
  onRemove: (_ctx, self) => {
    self.canMove += 1
  },
}

export const BUFFS: Record<number, BuffDef> = {
  // buff_init_8888.js: status-immunity counters, nothing the ported skills read yet.
  8888: { type: 1, replace: 8888, clearType: 0, lifeTime: -1 },
  // buff_mabi_11801.js (paralysis): marker; the stuns share its replace group.
  11801: { type: 1, replace: 11801, clearType: 0, lifeTime: 0 },
  // buff_dongjie_11802.js (freeze): cannot act or dodge, takes SaveData percent damage, thaws on a hit.
  11802: {
    type: 1,
    replace: 11802,
    clearType: 2,
    lifeTime: -1,
    onAdd: (ctx, self, buff) => {
      self.canMove -= 1
      ctx.changeDodge(self, self.dodgeMulAdd - FROZEN_DODGE)
      self.decDamage -= buff.saveData - 100
    },
    onRemove: (ctx, self, buff) => {
      self.canMove += 1
      ctx.changeDodge(self, self.dodgeMulAdd + FROZEN_DODGE)
      self.decDamage += buff.saveData - 100
    },
  },
  // buff_zhongdu_11811.js (poison): MaxHP * 0.0003 * (100 - DecDamage) per action of the owner.
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
  // buff_fengyin_11812.js (seal): marker the ninjutsu scripts check, for SaveData units.
  11812: { type: 1, replace: 11808, clearType: 0, lifeTime: -1, onAdd: lastsSaveData },
  11813: STUN,
  11815: STUN,
  // buff_11817.js (needles): reflects 25 % of every hit.
  11817: {
    type: 1,
    replace: 11817,
    clearType: 0,
    lifeTime: -1,
    onAdd: (_ctx, self) => {
      self.rebound += NEEDLES_REBOUND
    },
    onRemove: (_ctx, self) => {
      self.rebound -= NEEDLES_REBOUND
    },
  },
  // buff_tuliubi_11824.js (earth wall): parries 40 % and reflects 60 % of the next hit.
  11824: {
    type: 1,
    replace: 11824,
    clearType: 2,
    lifeTime: 0,
    onAdd: (_ctx, self) => {
      self.parryPercent = PARRY_PERCENT
      self.rebound += EARTH_WALL_REBOUND
    },
    onRemove: (_ctx, self) => {
      self.parryPercent = 0
      self.rebound -= EARTH_WALL_REBOUND
    },
  },
  // buff_11826.js (daze): no normal attack and no skills until damaged.
  11826: {
    type: 1,
    replace: 11801,
    clearType: 1,
    lifeTime: -1,
    onAdd: (_ctx, self) => {
      self.canAttack -= 1
      self.canUseSkill -= 1
    },
    onRemove: (_ctx, self) => {
      self.canAttack += 1
      self.canUseSkill += 1
    },
  },
  // buff_jingdianjiejie_11831.js (static barrier): a shield of SaveData HP.
  11831: {
    type: 3,
    replace: 11831,
    clearType: 0,
    lifeTime: -1,
    onAdd: (_ctx, self, buff) => {
      self.shieldDamage = buff.saveData
      self.shieldCount = SHIELD_COUNT
    },
    onRemove: (_ctx, self) => {
      self.shieldDamage = 0
      self.shieldCount = 0
    },
  },
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
