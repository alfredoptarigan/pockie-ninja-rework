// Fight buffs added by the trigger ninjutsu of ./ninjutsu-trigger-a.ts.
import type { BuffScripts } from '../buffs.js'
import { regenAuraResist } from './pet-core.js'
import type { FightContext, Fighter, FightEvent } from '../types.js'

const BUFF_POISON = 11811
const BUFF_HOT_BLOOD = 11814
const BUFF_GALE = 11825
const BUFF_PRAYER = 11832
const BUFF_REGENERATION = 11834
const BUFF_EXCITEMENT = 11880
const EXCITEMENT_LONG = 999997
const SLOW_RATE = 50
const HOT_BLOOD_SKILL_ADD = 15
const REGENERATION_TICKS = 1

const bonusOf = (saveData1 = 0) => 1 + 0.01 * Math.trunc(saveData1 * 0.01)

/**
 * A lasting Excitement ends with the last of Prayer, Gale, Hot Blood and Regeneration (the buff
 * being removed is already off the list).
 */
function endExcitement(ctx: FightContext, self: Fighter, fv: FightEvent, timer: number) {
  const excitement = ctx.getBuff(self, BUFF_EXCITEMENT)
  if (excitement?.saveData !== EXCITEMENT_LONG) return
  const boosts = [BUFF_PRAYER, BUFF_GALE, BUFF_HOT_BLOOD, BUFF_REGENERATION]
  if (boosts.some((id) => ctx.getBuff(self, id))) return
  ctx.removeBuff(self, BUFF_EXCITEMENT, timer, fv)
}

export const NINJUTSU_TRIGGER_A_BUFFS: Record<string, BuffScripts> = {
  // Slow (1816): AtkTime x2 (AtkTimeMul -50) for SaveData units.
  'buff/buff_chihuan_11810.js': {
    onAdd: (ctx, self, buff, fv, timer) => {
      buff.lifeTime = regenAuraResist(ctx, self, buff.saveData, fv, timer)
      const rate = Math.trunc(SLOW_RATE * bonusOf(buff.saveData1))
      ctx.changeAtkTime(self, self.atkTimeMul - rate, self.atkTimeAdd)
      buff.saveData1 = rate
    },
    onRemove: (ctx, self, buff) =>
      ctx.changeAtkTime(self, self.atkTimeMul + (buff.saveData1 ?? 0), self.atkTimeAdd),
  },
  // Hot Blood (3804): +15 to every SkillAdd for SaveData units.
  'buff/buff_rexue_11814.js': {
    onAdd: (_ctx, self, buff) => {
      buff.lifeTime = buff.saveData
      const bonus = bonusOf(buff.saveData1)
      self.skillAdd = self.skillAdd.map((add) => Math.trunc(add + HOT_BLOOD_SKILL_ADD * bonus))
      buff.saveData1 = Math.trunc(bonus)
    },
    onRemove: (ctx, self, buff, fv, timer) => {
      const bonus = buff.saveData1 ?? 0
      self.skillAdd = self.skillAdd.map((add) => Math.trunc(add - HOT_BLOOD_SKILL_ADD * bonus))
      endExcitement(ctx, self, fv, timer)
    },
  },
  // Net (3807): dodge lowered by SaveData until the owner's next action.
  'buff/buff_wang_11816.js': {
    onAdd: (ctx, self, buff) => ctx.changeDodge(self, self.dodgeMulAdd - buff.saveData),
    onRemove: (ctx, self, buff) => ctx.changeDodge(self, self.dodgeMulAdd + buff.saveData),
  },
  // Gale (1826): AtkTime - SaveData and attack - SaveData1 % until the owner's next action.
  'buff/buff_jifeng_11825.js': {
    onAdd: (ctx, self, buff) => {
      const loss = buff.saveData1 ?? 0
      ctx.changeAtkTime(self, self.atkTimeMul, self.atkTimeAdd + buff.saveData)
      ctx.changeAtk(self, self.minAtkMul - loss, self.maxAtkMul - loss)
    },
    onRemove: (ctx, self, buff) => {
      const loss = buff.saveData1 ?? 0
      ctx.changeAtkTime(self, self.atkTimeMul, self.atkTimeAdd - buff.saveData)
      ctx.changeAtk(self, self.minAtkMul + loss, self.maxAtkMul + loss)
    },
  },
  // Regeneration (3802): heals SaveData and cures poison on the owner's next two actions.
  'buff/buff_yuhe_11834.js': {
    onActivation: (ctx, self, buff, fv, timer) => {
      const heal = Math.min(buff.saveData, self.maxHp - self.hp)
      self.hp = Math.trunc(self.hp + heal)
      if (ctx.getBuff(self, BUFF_POISON)) ctx.removeBuff(self, BUFF_POISON, timer, fv)
      fv.incHp = Math.trunc(heal)
      buff.saveData1 = (buff.saveData1 ?? 0) + 1
      if (buff.saveData1 > REGENERATION_TICKS) buff.lifeTime = 0
    },
    onRemove: (ctx, self, _buff, fv, timer) => endExcitement(ctx, self, fv, timer),
  },
  // Excitement: attack + SaveData1 % for SaveData units.
  'buff/buff_kangfenfujia_11880.js': {
    onAdd: (ctx, self, buff) => {
      const gain = buff.saveData1 ?? 0
      buff.lifeTime = buff.saveData
      ctx.changeAtk(self, self.minAtkMul + gain, self.maxAtkMul + gain)
    },
    onRemove: (ctx, self, buff) => {
      const gain = buff.saveData1 ?? 0
      ctx.changeAtk(self, self.minAtkMul - gain, self.maxAtkMul - gain)
    },
  },
}
