// Fight buffs: the rows of RES/skill/FightBuff.ini (imported to server/data/game/fight-buffs.json)
// joined with the ported scripts of RES/javascript/buff/*.js by the row's `javascript` path.
// Rows whose script is not ported act as markers (added, replaced, expired, cleared) only.
import fightBuffs from '../../../server/data/game/fight-buffs.json'
import { INSTANCE_BUFFS } from './scripts/instance-skills.js'
import { FIELD_2600_BUFFS } from './scripts/field-2600-buffs.js'
import { NINJUTSU_TRIGGER_B_BUFFS } from './scripts/ninjutsu-trigger-b-buffs.js'
import type { ActiveBuff, FightContext, Fighter, FightEvent } from './types.js'

type BuffScript = (
  ctx: FightContext,
  self: Fighter,
  buff: ActiveBuff,
  fv: FightEvent,
  timer: number,
) => void

export interface BuffScripts {
  onAdd?: BuffScript
  onActivation?: BuffScript
  onRemove?: BuffScript
}

export interface BuffDef extends BuffScripts {
  /** 1 stat / flag, 2 ticks on each action of its owner, 3 shield */
  type: number
  /** Buffs of the same group replace each other. */
  replace: number
  /** 1 removed when damaged, 2 removed when hit */
  clearType: number
  /** Timeline units; -1 permanent. */
  lifeTime: number
  /** BuffSystem.AddFightBuff only adds buffs with validity 1 or 2. */
  validity: number
}

/** One FightBuff.ini row; missing keys default to 0 like Buff.java. */
interface BuffRow {
  type: number
  replace?: number
  cleartype?: number
  lifttime: number
  validity: number
  javascript?: string
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
const STUN: BuffScripts = {
  onAdd: (ctx, self, buff, fv, timer) => {
    lastsSaveData(ctx, self, buff, fv, timer)
    self.canMove -= 1
  },
  onRemove: (_ctx, self) => {
    self.canMove += 1
  },
}

const BUFF_SCRIPTS: Record<string, BuffScripts> = {
  // Status-immunity counters, nothing the ported skills read yet.
  'buff/buff_init_8888.js': {},
  // Paralysis: marker; the stuns share its replace group.
  'buff/buff_mabi_11801.js': {},
  // Freeze: cannot act or dodge, takes SaveData percent damage, thaws on a hit.
  'buff/buff_dongjie_11802.js': {
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
  // Poison: MaxHP * 0.0003 * (100 - DecDamage) per action of the owner.
  'buff/buff_zhongdu_11811.js': {
    onAdd: (_ctx, _self, buff) => {
      buff.lifeTime = 6000
    },
    onActivation: (ctx, self, _buff, fv, timer) => {
      const damage = Math.trunc(self.maxHp * POISON_RATE * 100)
      ctx.damageWithValue(self, damage, fv, timer)
      fv.selfDamage = damage
    },
  },
  // Seal: marker the ninjutsu scripts check, for SaveData units.
  'buff/buff_fengyin_11812.js': { onAdd: lastsSaveData },
  'buff/buff_xuanyun_11813.js': STUN,
  'buff/buff_seyou_11815.js': STUN,
  // Needles: reflects 25 % of every hit.
  'buff/buff_11817.js': {
    onAdd: (_ctx, self) => {
      self.rebound += NEEDLES_REBOUND
    },
    onRemove: (_ctx, self) => {
      self.rebound -= NEEDLES_REBOUND
    },
  },
  // Earth wall: parries 40 % and reflects 60 % of the next hit.
  'buff/buff_tuliubi_11824.js': {
    onAdd: (_ctx, self) => {
      self.parryPercent = PARRY_PERCENT
      self.rebound += EARTH_WALL_REBOUND
    },
    onRemove: (_ctx, self) => {
      self.parryPercent = 0
      self.rebound -= EARTH_WALL_REBOUND
    },
  },
  // Daze: no normal attack and no skills until damaged.
  'buff/buff_11826.js': {
    onAdd: (_ctx, self) => {
      self.canAttack -= 1
      self.canUseSkill -= 1
    },
    onRemove: (_ctx, self) => {
      self.canAttack += 1
      self.canUseSkill += 1
    },
  },
  // Interrupt (Burrow 40029): Pierce lowered by SaveData until the owner's next action.
  'buff/buff_daduan_11830.js': {
    onAdd: (_ctx, self, buff) => {
      self.pierce -= buff.saveData
    },
    onRemove: (_ctx, self, buff) => {
      self.pierce += buff.saveData
    },
  },
  // Static barrier: a shield of SaveData HP.
  'buff/buff_jingdianjiejie_11831.js': {
    onAdd: (_ctx, self, buff) => {
      self.shieldDamage = buff.saveData
      self.shieldCount = SHIELD_COUNT
    },
    onRemove: (_ctx, self) => {
      self.shieldDamage = 0
      self.shieldCount = 0
    },
  },
  // Parry: 40 % less damage from the next hit, then delays the attacker.
  'buff/buff_gedang_11841.js': {
    onAdd: (_ctx, self) => {
      self.parryPercent = PARRY_PERCENT
    },
    onRemove: (ctx, self, buff, fv, timer) => {
      self.parryPercent = 0
      ctx.addBuff(self, 11851, timer, fv)
      if (self.opponent) ctx.changeNextAtkTime(self.opponent, buff.saveData)
    },
  },
  // Blind: HitMul lowered by SaveData until removed.
  'buff/buff_shiming_11843.js': {
    onAdd: (ctx, self, buff) => ctx.changeHit(self, self.hitMulAdd - buff.saveData),
    onRemove: (ctx, self, buff) => ctx.changeHit(self, self.hitMulAdd + buff.saveData),
  },
  // Marker after a parry, no effect.
  'buff/buff_gedangjiasu_11851.js': {},
  ...INSTANCE_BUFFS,
  ...FIELD_2600_BUFFS,
  ...NINJUTSU_TRIGGER_B_BUFFS,
}

const toBuffDef = (row: BuffRow): BuffDef => ({
  type: row.type,
  replace: row.replace ?? 0,
  clearType: row.cleartype ?? 0,
  lifeTime: row.lifttime,
  validity: row.validity,
  ...(row.javascript ? BUFF_SCRIPTS[row.javascript] : {}),
})

export const BUFFS: Record<number, BuffDef> = Object.fromEntries(
  Object.entries(fightBuffs as Record<string, BuffRow>).map(([id, row]) => [id, toBuffDef(row)]),
)
