// 2011 buff scripts used by pet Help skills. Bind/bleed are already in field-2600-buffs.
import type { BuffScripts } from '../buffs.js'

export const PET_HELP_BUFFS: Record<string, BuffScripts> = {
  'buff/buff_chongdang_40006.js': {
    onAdd: (ctx, self, buff) => {
      if (ctx.getBuff(self, 11881)) buff.saveData += 1
      self.counter += buff.saveData * 10
      self.parryPercent = 100
    },
    onRemove: (_ctx, self, buff) => {
      self.counter -= buff.saveData * 10
      self.parryPercent = 0
    },
  },
  'buff/buff_hanbinghuxi_11879.js': {},
  // The original reduces MinAtkAdd/MaxAtkAdd by 20%, permanently. No reborn script sets
  // these flat terms: they remain zero. Preserve its recomputation and original quirk:
  // both attack bounds use MinAtkMul, even when MaxAtkMul differs.
  'buff/buff_tunshi_11897.js': {
    onAdd: (ctx, self) => ctx.changeAtk(self, self.minAtkMul, self.minAtkMul),
  },
  'buff/buff_shuilongbo_11903.js': {
    onAdd: (_ctx, self) => {
      self.dodge -= 200
    },
    onRemove: (_ctx, self) => {
      self.dodge += 200
    },
  },
  'buff/buff_suanyefushi_11904.js': {
    onAdd: (_ctx, self) => {
      self.maxAttack = Math.trunc(self.maxAttack * 0.7)
      self.minAttack = Math.trunc(self.minAttack * 0.7)
      self.defense = Math.trunc(self.defense * 0.7)
    },
    onRemove: (_ctx, self) => {
      self.maxAttack = Math.trunc(self.maxAttack / 0.7)
      self.minAttack = Math.trunc(self.minAttack / 0.7)
      self.defense = Math.trunc(self.defense / 0.7)
    },
  },
  'buff/buff_yuansujingtong_11905.js': {},
  'buff/buff_huanhua_11906.js': {
    onAdd: (_ctx, self) => {
      self.defense += 300
    },
    onRemove: (_ctx, self) => {
      self.defense -= 300
    },
  },
  'buff/buff_anheizhangkong_11907.js': {
    onActivation: (ctx, self, buff, fv) => {
      const hp = Math.min(self.hp, Math.trunc(self.hp * 0.15))
      const mp = Math.min(self.mp, Math.trunc(self.hp * 0.15 * (ctx.getBuff(self, 11839) ? 2 : 1)))
      self.hp -= hp
      self.mp -= mp
      fv.selfDamage = hp
      fv.decMp = mp
      buff.lifeTime = 0
    },
  },
  'buff/buff_leiyunfengbao_11909.js': {},
}
