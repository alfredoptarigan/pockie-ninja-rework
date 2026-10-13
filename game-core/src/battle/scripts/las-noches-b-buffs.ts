// Fight buffs of the Las Noches bosses (./las-noches-b.ts and skill 6). 11882 Bug Tracking has no
// script: its FightBuff.ini row makes it a marker.
import type { BuffScripts } from '../buffs.js'

const RAGE_LIFETIME = 6000
const RAGE_DEFENSE = 11352
const SEAL_CRIT = 270
const SEAL_NEGLECT_DEF = 450
const DARK_WALK_SLOW = 50
const DARK_WALK_HIT = 430
const DARK_WALK_DODGE = 290

export const LAS_NOCHES_B_BUFFS: Record<string, BuffScripts> = {
  // Spiritual Pressure Rage (60002): attack + SaveData %, CritMul x SaveData1, defence + 11352.
  'buff/buff_lingyakuangbao_11883.js': {
    onAdd: (ctx, self, buff) => {
      const gain = buff.saveData
      buff.lifeTime = RAGE_LIFETIME
      ctx.changeAtk(self, self.minAtkMul + gain, self.maxAtkMul + gain)
      self.crit *= buff.saveData1 ?? 0
      ctx.changeDefense(self, self.defenseAdd + RAGE_DEFENSE)
    },
    onRemove: (ctx, self, buff) => {
      const gain = buff.saveData
      ctx.changeAtk(self, self.minAtkMul - gain, self.maxAtkMul - gain)
      // CritMul is a Java int field, so the division truncates.
      self.crit = Math.trunc(self.crit / (buff.saveData1 || 1))
      ctx.changeDefense(self, self.defenseAdd - RAGE_DEFENSE)
    },
  },
  // Evil Sealing (5000): attack - SaveData1 %, CritMul - 270, NeglectDefAttach - 450.
  'buff/buff_fengxiefayin_11884.js': {
    onAdd: (ctx, self, buff) => {
      const loss = buff.saveData1 ?? 0
      buff.lifeTime = buff.saveData
      ctx.changeAtk(self, self.minAtkMul - loss, self.maxAtkMul - loss)
      self.crit -= SEAL_CRIT
      self.neglectDefense -= SEAL_NEGLECT_DEF
    },
    onRemove: (ctx, self, buff) => {
      const loss = buff.saveData1 ?? 0
      ctx.changeAtk(self, self.minAtkMul + loss, self.maxAtkMul + loss)
      self.crit += SEAL_CRIT
      self.neglectDefense += SEAL_NEGLECT_DEF
    },
  },
  // Dark Walk (skill 6): AtkTime x2, hit - 430, dodge - 290 for SaveData units.
  'buff/buff_heianxingzhishu_11886.js': {
    onAdd: (ctx, self, buff) => {
      buff.lifeTime = buff.saveData
      const rate = Math.trunc(
        DARK_WALK_SLOW * (1 + 0.01 * Math.trunc((buff.saveData1 ?? 0) * 0.01)),
      )
      ctx.changeAtkTime(self, self.atkTimeMul - rate, self.atkTimeAdd)
      ctx.changeHit(self, self.hitMulAdd - DARK_WALK_HIT)
      ctx.changeDodge(self, self.dodgeMulAdd - DARK_WALK_DODGE)
      buff.saveData1 = rate
    },
    onRemove: (ctx, self, buff) => {
      ctx.changeAtkTime(self, self.atkTimeMul + (buff.saveData1 ?? 0), self.atkTimeAdd)
      ctx.changeHit(self, self.hitMulAdd + DARK_WALK_HIT)
      ctx.changeDodge(self, self.dodgeMulAdd + DARK_WALK_DODGE)
    },
  },
}
