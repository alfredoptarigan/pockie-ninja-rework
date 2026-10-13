// Fight buffs added by the 2601-2605 field monster skills (./field-2600-skills.ts).
import type { BuffScripts } from '../buffs.js'

const BIND_DODGE = 99
const BIND_COUNTER = 999
const BIND_TICK_RATE = 0.05
const BLEED_TICK_RATE = 0.1

export const FIELD_2600_BUFFS: Record<string, BuffScripts> = {
  // Bind (40026): no action, Dodge -99, Counter -999 for SaveData units; MaxHP * 0.05 per tick.
  'buff/buff_shujiejiangdan_11837.js': {
    onAdd: (ctx, self, buff) => {
      buff.lifeTime = buff.saveData
      self.canMove -= 1
      ctx.changeDodge(self, self.dodgeMulAdd - BIND_DODGE)
      self.counter -= BIND_COUNTER
    },
    onActivation: (ctx, self, _buff, fv) => {
      const damage = Math.trunc(self.maxHp * BIND_TICK_RATE)
      ctx.damage(self, damage)
      fv.selfDamage = damage
    },
    onRemove: (ctx, self) => {
      self.canMove += 1
      ctx.changeDodge(self, self.dodgeMulAdd + BIND_DODGE)
      self.counter += BIND_COUNTER
    },
  },
  // Bleed (40021): current HP * 0.1 per tick for SaveData units.
  'buff/buff_liuxue_11838.js': {
    onAdd: (_ctx, _self, buff) => {
      buff.lifeTime = buff.saveData
    },
    onActivation: (ctx, self, _buff, fv) => {
      const damage = Math.trunc(self.hp * BLEED_TICK_RATE)
      ctx.damage(self, damage)
      fv.selfDamage = damage
    },
  },
}
