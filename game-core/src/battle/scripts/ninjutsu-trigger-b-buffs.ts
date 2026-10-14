// Fight buffs of the batch B trigger ninjutsu (./ninjutsu-trigger-b.ts), from
// RES/javascript/buff/*.js. Rhino writes numbers into Java int fields by truncation.
import type { BuffScripts } from '../buffs.js'
import { regenAuraResist } from './pet-core.js'
import type { FightContext, Fighter } from '../types.js'
import { BUFF_IMMUNITY } from './parry.js'
import { EXCITED_BY_PRAYER } from './ninjutsu-trigger-b.js'

const BUFF_PARALYSIS = 11801
const BUFF_FREEZE = 11802
const BUFF_STUN = 11813
const BUFF_WARM_BLOOD = 11814
const BUFF_GALE = 11825
const BUFF_STATIC_BARRIER = 11831
const BUFF_PRAYER = 11832
const BUFF_HARMONY = 11834
const BUFF_VESSEL_DESTROY = 11839
const BUFF_EXCITEMENT = 11880
const BUFF_INVINCIBLE = 11901
const BUFF_BURN = 11804
const SUBSTITUTE_BURN_TICKS = 2
const SUBSTITUTE_PARRY = 100
const PRAYER_DEC_DAMAGE = 100
const THUNDER_RATE = 0.07
const THUNDER_SHIELD_DIV = 5
const THUNDER_PARALYSIS = 350
const MAX_PARALYSES = 4
const CURSE_ATK = 50

const t = Math.trunc
const has = (ctx: FightContext, fighter: Fighter, buffId: number) =>
  ctx.getBuff(fighter, buffId) !== undefined

/** Damage after DecDamage; a frozen owner multiplies by -DecDamage instead (original quirk). */
function mitigated(ctx: FightContext, self: Fighter, amount: number) {
  if (self.decDamage >= 100) return amount
  const percent = has(ctx, self, BUFF_FREEZE) ? -self.decDamage : 100 - self.decDamage
  return amount * percent * 0.01
}

/** Gates of Eight Gates (3810): AtkTimeMul + `mul` while open. */
const gate = (mul: number): BuffScripts => ({
  onAdd: (ctx, self) => ctx.changeAtkTime(self, self.atkTimeMul + mul, self.atkTimeAdd),
  onRemove: (ctx, self) => ctx.changeAtkTime(self, self.atkTimeMul - mul, self.atkTimeAdd),
})

export const NINJUTSU_TRIGGER_B_BUFFS: Record<string, BuffScripts> = {
  'buff/buff_kaimen_11819.js': gate(10),
  'buff/buff_xiumen_11844.js': gate(20),
  'buff/buff_shengmen_11845.js': gate(30),
  'buff/buff_shangmen_11846.js': gate(40),
  'buff/buff_dumen_11847.js': gate(50),
  'buff/buff_jingmen_11848.js': gate(60),
  'buff/buff_jingmen_11849.js': gate(70),
  'buff/buff_simen_11850.js': gate(80),
  // Clay bomb (3812): after SaveData units the owner takes back the HP it lost meanwhile (min 1).
  'buff/buff_yinbaoniantu_11820.js': {
    onAdd: (ctx, self, buff, fv, timer) => {
      buff.lifeTime = regenAuraResist(ctx, self, buff.saveData, fv, timer)
      buff.saveData1 = timer
      buff.saveData = self.hp
    },
    onActivation: (ctx, self, buff, fv, timer) => {
      if (timer < (buff.saveData1 ?? 0) + buff.lifeTime) return
      const damage = Math.max(1, buff.saveData - self.hp)
      ctx.damageWithValue(self, damage, fv, timer)
      fv.selfDamage = damage
      ctx.removeBuff(self, buff.id, timer, fv)
    },
  },
  // Fog (3813): PriorityMul grows with time; removing it sets PriorityMul to 0 (not restored).
  'buff/buff_wu_11821.js': {
    onActivation: (_ctx, self, buff, _fv, timer) => {
      buff.saveData = t(100 - 100 / (Math.pow(timer / 200, 0.5) * 0.03 + 1))
      self.priority = buff.saveData
    },
    onRemove: (_ctx, self) => {
      self.priority = 0
    },
  },
  // Sunset (3815): SaveData is the melt chance the fire / wind ninjutsu roll, growing with time.
  'buff/buff_riluo_11822.js': {
    onActivation: (_ctx, _self, buff, _fv, timer) => {
      buff.saveData = t(Math.pow(timer / 200, 0.5) * 3)
    },
  },
  // Heaven curse mark (3819): attack + 50 % of the HP fraction lost, re-applied each action.
  'buff/buff_zhouyin_11823.js': {
    onActivation: (ctx, self, buff) => {
      const rate = CURSE_ATK * (1 - self.hp / self.maxHp)
      const delta = (mul: number) => t(mul + rate - (buff.saveData1 ?? 0))
      ctx.changeAtk(self, delta(self.minAtkMul), delta(self.maxAtkMul))
      buff.saveData1 = t(rate)
    },
    onRemove: (ctx, self, buff) => {
      const bonus = buff.saveData1 ?? 0
      ctx.changeAtk(self, self.minAtkMul - bonus, self.maxAtkMul - bonus)
    },
  },
  // Storm cloud (3822): 7 % MaxHP lightning each action of the owner, which also wakes it and
  // paralyses it (+350 AtkTime) while its 8888 paralysis digit is under 4 (never counted up).
  'buff/buff_wuyun_11827.js': {
    onActivation: (ctx, self, _buff, fv, timer) => {
      const thunder = THUNDER_RATE * self.maxHp
      if (has(ctx, self, BUFF_PRAYER) || has(ctx, self, BUFF_INVINCIBLE)) return
      if (has(ctx, self, BUFF_STATIC_BARRIER)) {
        // Original quirk: the barrier gains the damage instead of losing it.
        const shield = thunder / THUNDER_SHIELD_DIV
        self.shieldDamage = t(self.shieldDamage + shield)
        fv.selfShield = t((fv.selfShield ?? 0) - shield)
        return
      }
      const damage = mitigated(ctx, self, thunder)
      ctx.damageWithValue(self, damage, fv, timer)
      if (has(ctx, self, BUFF_STUN)) ctx.removeBuff(self, BUFF_STUN, timer, fv)
      const init = ctx.getBuff(self, BUFF_IMMUNITY)
      if (init && (init.saveData % 1000) / 100 < MAX_PARALYSES) {
        ctx.changeNextAtkTime(self, THUNDER_PARALYSIS)
        if (!has(ctx, self, BUFF_PARALYSIS)) ctx.addBuff(self, BUFF_PARALYSIS, timer, fv)
      }
      fv.selfDamage = t(damage)
    },
  },
  // Prayer (3821): no damage for SaveData units; ends the excitement it granted unless warm blood,
  // gale or harmony still hold.
  'buff/buff_qidao_11832.js': {
    onAdd: (_ctx, self, buff) => {
      buff.lifeTime = buff.saveData
      self.decDamage += PRAYER_DEC_DAMAGE
    },
    onRemove: (ctx, self, _buff, fv, timer) => {
      self.decDamage -= PRAYER_DEC_DAMAGE
      if (ctx.getBuff(self, BUFF_EXCITEMENT)?.saveData !== EXCITED_BY_PRAYER) return
      const kept = [BUFF_WARM_BLOOD, BUFF_GALE, BUFF_HARMONY].some((id) => has(ctx, self, id))
      if (!kept) ctx.removeBuff(self, BUFF_EXCITEMENT, timer, fv)
    },
  },
  // Drain (3827): SaveData % MaxHP and SaveData1 % MaxMP after DecDamage per action, straight off
  // HP and MP (no triggers); MP twice under Vessel Destroy.
  'buff/buff_huanjue_11836.js': {
    onActivation: (ctx, self, buff, fv) => {
      const drain = (percent: number, max: number) =>
        self.decDamage < 100 ? mitigated(ctx, self, percent * max) * 0.01 : 0
      let hp = drain(buff.saveData, self.maxHp)
      let mp = drain(buff.saveData1 ?? 0, self.maxMp)
      if (has(ctx, self, BUFF_VESSEL_DESTROY)) mp *= 2
      hp = Math.min(hp, self.hp)
      mp = Math.min(mp, self.mp)
      self.hp -= t(hp)
      self.mp -= t(mp)
      fv.selfDamage = t(hp)
      fv.decMp = t(mp)
    },
  },
  // Substitute (3826): parries the whole next hit (cleartype 2), then the owner catches the burn
  // its attacker had (SaveData 1, SaveData1 damage) for two ticks. The original also shows 3826 as
  // the parry id (SaveSkillID); the replay keeps a plain parry flag.
  'buff/buff_tishenshu_11840.js': {
    onAdd: (_ctx, self) => {
      self.parryPercent = SUBSTITUTE_PARRY
    },
    onRemove: (ctx, self, buff, fv, timer) => {
      if (buff.saveData === 1) {
        ctx.addBuff(self, BUFF_BURN, timer, fv, buff.saveData1 ?? 0, SUBSTITUTE_BURN_TICKS)
      }
      self.parryPercent = 0
    },
  },
}
