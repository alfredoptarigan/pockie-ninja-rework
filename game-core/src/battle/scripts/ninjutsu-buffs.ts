// Fight buffs added by the attack ninjutsu (RES/javascript/buff/*.js), wired into BUFF_SCRIPTS.
import type { BuffScripts } from '../buffs.js'
import { regenAuraResist } from './pet-core.js'

const DEATH_SEAL_ATK = 70

export const NINJUTSU_BUFFS: Record<string, BuffScripts> = {
  // Burn: SaveData damage on each action of the owner, SaveData1 times, then LifeTime 0 ends it.
  'buff/buff_ranshao_11804.js': {
    onAdd: (ctx, self, buff, fv, timer) => {
      buff.saveData1 = regenAuraResist(ctx, self, buff.saveData1 ?? 0, fv, timer)
    },
    onActivation: (ctx, self, buff, fv, timer) => {
      ctx.damageWithValue(self, buff.saveData, fv, timer)
      fv.selfDamage = buff.saveData
      buff.saveData1 = (buff.saveData1 ?? 0) - 1
      if (buff.saveData1 < 1) buff.lifeTime = 0
    },
  },
  // Wine: HitMul - SaveData, CritMul + SaveData1; fire on a wine-soaked target burns (1808).
  'buff/buff_jiu_11806.js': {
    onAdd: (ctx, self, buff) => {
      ctx.changeHit(self, self.hitMulAdd - buff.saveData)
      self.crit += buff.saveData1 ?? 0
    },
    onRemove: (ctx, self, buff) => {
      ctx.changeHit(self, self.hitMulAdd + buff.saveData)
      self.crit -= buff.saveData1 ?? 0
    },
  },
  // Death seal (1814): attack -70 % for SaveData units.
  'buff/buff_shigui_11808.js': {
    onAdd: (ctx, self, buff, fv, timer) => {
      buff.lifeTime = regenAuraResist(ctx, self, buff.saveData, fv, timer)
      ctx.changeAtk(self, self.minAtkMul - DEATH_SEAL_ATK, self.maxAtkMul - DEATH_SEAL_ATK)
    },
    onRemove: (ctx, self) =>
      ctx.changeAtk(self, self.minAtkMul + DEATH_SEAL_ATK, self.maxAtkMul + DEATH_SEAL_ATK),
  },
  // Weakness (after Combo 1807): no normal attack and no skills for SaveData units.
  'buff/buff_shili_11833.js': {
    onAdd: (ctx, self, buff, fv, timer) => {
      buff.lifeTime = regenAuraResist(ctx, self, buff.saveData, fv, timer)
      self.canAttack -= 1
      self.canUseSkill -= 1
    },
    onRemove: (_ctx, self) => {
      self.canAttack += 1
      self.canUseSkill += 1
    },
  },
  // Vessel destruction (1832): marker; the ninjutsu double their MP cost while it lasts.
  'buff/buff_jingluopohuai_11839.js': {},
}
