// 2011 Halo scripts: aura tiers are permanent; their dependent skills run once at fight start.
import type { BuffScripts } from '../buffs.js'
import { SKILL_LOSE, SKILL_SUCCESS, type SkillScript, type ActiveBuff } from '../types.js'

const aura: (id: number, stronger?: number[], result?: number) => SkillScript =
  (id, stronger = [], result = SKILL_SUCCESS) =>
  (ctx, self, _target, fv, timer) => {
    if (stronger.some((other) => ctx.getBuff(self, other))) return SKILL_LOSE
    ctx.addBuff(self, id, timer, fv)
    return result
  }

const dependent: (
  ids: number[],
  apply: (
    buff: ActiveBuff,
    tier: number,
    self: Parameters<SkillScript>[1],
    target: Parameters<SkillScript>[2],
  ) => void,
) => SkillScript = (ids, apply) => (ctx, self, target) => {
  const tier = ids.findIndex((id) => ctx.getBuff(self, id))
  if (tier >= 0) apply(ctx.getBuff(self, ids[tier]!)!, tier, self, target)
  return SKILL_LOSE
}
const slaughter = [11853, 11854, 11855]
const thorn = [11857, 11858, 11859]
const regen = [11861, 11862, 11863]
const sacred = [11865, 11866, 11867]
const wisdom = [11869, 11870, 11871]
const noble = [11898, 11899, 11900]
const cleansed = [
  1212, 11801, 11802, 11803, 11804, 11805, 11806, 11807, 11808, 11810, 11811, 11812, 11813, 11815,
  11816, 11820, 11821, 11826, 11827, 11828, 11829, 11830, 11833, 11835, 11836, 11837, 11838, 11839,
  11843, 11882, 11884, 11885, 11886, 11897, 11903, 11904, 11908, 11909,
]
type InitBuff = ActiveBuff & { saveData9?: number }

export const PET_HALO_SKILLS: Record<string, SkillScript> = {
  'skill/skill_chongguanghuanceshi_40057.js': aura(11852, [], SKILL_SUCCESS),
  'skill/skill_shaluguanghuan0_40058.js': aura(11853, [11854, 11855], SKILL_SUCCESS),
  'skill/skill_shaluguanghuan1_40059.js': aura(11854, [11855], SKILL_SUCCESS),
  'skill/skill_shaluguanghuan2_40060.js': aura(11855, [], SKILL_SUCCESS),
  'skill/skill_jingjiguanghuan0_40062.js': aura(11857, [11858, 11859], SKILL_SUCCESS),
  'skill/skill_jingjiguanghuan1_40063.js': aura(11858, [11859], SKILL_SUCCESS),
  'skill/skill_jingjiguanghuan2_40064.js': aura(11859, [], SKILL_SUCCESS),
  'skill/skill_zaishengguanghuan0_40066.js': aura(11861, [11862, 11863], SKILL_SUCCESS),
  'skill/skill_zaishengguanghuan1_40067.js': aura(11862, [11863], SKILL_SUCCESS),
  'skill/skill_zaishengguanghuan2_40068.js': aura(11863, [], SKILL_SUCCESS),
  'skill/skill_shenshengguanghuan0_40070.js': aura(11865, [11866, 11867], SKILL_SUCCESS),
  'skill/skill_shenshengguanghuan1_40071.js': aura(11866, [11867], SKILL_SUCCESS),
  'skill/skill_shenshengguanghuan2_40072.js': aura(11867, [], SKILL_SUCCESS),
  'skill/skill_zhihuiguanghuan0_40074.js': aura(11869, [11870, 11871], SKILL_SUCCESS),
  'skill/skill_zhihuiguanghuan1_40075.js': aura(11870, [11871], SKILL_SUCCESS),
  'skill/skill_zhihuiguanghuan2_40076.js': aura(11871, [], SKILL_SUCCESS),
  'skill/skill_kangti_40106.js': aura(11875, [], SKILL_LOSE),
  'skill/skill_qingxing_40108.js': aura(11876, [], SKILL_LOSE),
  'skill/skill_jieyin_40110.js': aura(11877, [], SKILL_LOSE),
  'skill/skill_zhufu_40113.js': aura(11878, [], SKILL_LOSE),
  'skill/skill_chonggaoguanghuan0_40122.js': aura(11898, [11899, 11900], SKILL_SUCCESS),
  'skill/skill_chonggaoguanghuan1_40123.js': aura(11899, [11900], SKILL_SUCCESS),
  'skill/skill_chonggaoguanghuan2_40124.js': aura(11900, [], SKILL_SUCCESS),
  'skill/skill_xuezhou_40078.js': dependent(slaughter, (_buff, tier, self) => {
    self.vampiricHp += 3 + tier
  }),
  'skill/skill_roubo_40079.js': dependent(slaughter, (_buff, tier, self, target) => {
    self.skillAdd[5]! += (3 + tier) * 100
    target.skillAdd[8]! += (3 + tier) * 100
  }),
  'skill/skill_kangfen_40080.js': dependent(slaughter, (buff, tier) => {
    buff.saveData += 6 + tier * 2
  }),
  'skill/skill_jiancihuti_40082.js': dependent(thorn, (_buff, tier, self) => {
    self.rebound += 3 + tier
  }),
  'skill/skill_guanghezuoyong_40083.js': dependent(thorn, (buff, tier) => {
    buff.saveData += 3 + tier
  }),
  'skill/skill_hanlengbowen_40084.js': dependent(thorn, (_buff, tier, self, target) => {
    self.skillAdd[1]! += (3 + tier) * 100
    target.skillAdd[0]! += (3 + tier) * 100
  }),
  'skill/skill_xisheng_40086.js': dependent(regen, (buff, tier) => {
    buff.saveData1 = (buff.saveData1 ?? 0) + 15 + tier * 5
  }),
  'skill/skill_quxie_40087.js': dependent(regen, (buff, tier) => {
    buff.saveData += 9 + tier * 3
  }),
  'skill/skill_muoushi_40088.js': dependent(regen, (buff, tier, self) => {
    self.skillAdd[6]! += (3 + tier) * 100
    buff.saveData += 1500 + tier * 500
  }),
  'skill/skill_longzuxuetong_40090.js': dependent(sacred, (_buff, tier, self) => {
    self.decDamage += 3 + tier
  }),
  'skill/skill_bukeqinfan_40091.js': dependent(sacred, (_buff, tier, self) => {
    self.counter += 6 + tier * 2
  }),
  'skill/skill_shenshengyinji_40092.js': dependent(sacred.slice(0, 2), (buff, tier, self) => {
    self.skillAdd[7]! += (3 + tier) * 100
    buff.saveData += 15 + tier * 5
  }),
  'skill/skill_shenmishu_40094.js': dependent(wisdom, (buff, tier) => {
    buff.saveData += 9 + tier * 3
  }),
  'skill/skill_ganzhi_40095.js': dependent(wisdom, (buff, tier) => {
    buff.saveData1 = (buff.saveData1 ?? 0) + 12 + tier * 4
  }),
  // 40092 preserves the original duplicate tier-1 condition: the expert aura has no effect.
  'skill/skill_renzhuli_40125.js': (ctx, self, _target, fv, timer) => {
    const init = ctx.getBuff(self, 8888) as InitBuff | undefined
    if (
      !init ||
      ctx.getBuff(self, 11901) ||
      !noble.some((id) => ctx.getBuff(self, id)) ||
      ctx.randInt(0, 99) > 20 ||
      ((init.saveData9 ?? 0) % 1000) / 100 >= 3
    )
      return SKILL_LOSE
    ctx.addBuff(self, 11901, timer, fv)
    init.saveData9 = (init.saveData9 ?? 0) + 100
    if (ctx.getBuff(self, 11836)) ctx.removeBuff(self, 11836, timer, fv)
    return SKILL_SUCCESS
  },
  'skill/skill_shouxuefeiteng_40126.js': (ctx, self, _target, fv, timer) => {
    if (self.mp >= self.maxMp * 0.1) return SKILL_LOSE
    // Noble tiers have separate replace groups. Original else-if retries each present tier.
    const tier = noble.findIndex((id) => ctx.getBuff(self, id) && ctx.randInt(0, 99) < 30)
    if (tier < 0) return SKILL_LOSE
    self.mp = Math.trunc(self.mp + (20 + tier * 5) * 0.01 * self.maxMp)
    fv.incMp = self.mp // The Rhino script records the total MP here.
    if (cleansed.some((id) => ctx.getBuff(self, id))) {
      for (const id of cleansed) ctx.removeBuff(self, id, timer, fv)
    }
    return SKILL_SUCCESS
  },
  'skill/skill_shouhuakuangbao_40127.js': (ctx, self, _target, fv, timer) => {
    // The original guard checks tier 0 twice, so tier 2 alone cannot trigger this script.
    if (
      ctx.getBuff(self, 11902) ||
      ctx.randInt(0, 99) > 30 ||
      (!ctx.getBuff(self, 11898) && !ctx.getBuff(self, 11899))
    )
      return SKILL_LOSE
    const tier = noble.findIndex((id) => ctx.getBuff(self, id))
    const rate = (20 + tier * 5) * 0.01
    ctx.changeAtkTime(self, self.atkTimeMul, Math.trunc(self.atkTimeAdd - rate * self.atkTimeAdd))
    // FightObject.MinAtkAdd/MaxAtkAdd are ints, initialized to zero. The script adds 0.2-0.3
    // (rather than multiplying attack), which truncates to zero in ChangeAtk's int parameters.
    ctx.changeAtk(self, self.minAtkMul, self.maxAtkMul)
    ctx.addBuff(self, 11902, timer, fv)
    return SKILL_SUCCESS
  },
}

const reset: BuffScripts = {
  onAdd: (_ctx, _self, buff) => {
    buff.saveData = 0
  },
}
const trigger = (self: Parameters<SkillScript>[1], id: number) =>
  self.triggerSkills.some((skill) => skill.id === id)
const slaughterBuff = (rate: number): BuffScripts => ({
  ...reset,
  onRemove: (_ctx, self) => {
    if (trigger(self, 40078)) self.vampiricHp -= rate
  },
})
const thornBuff = (rate: number): BuffScripts => ({
  ...reset,
  onActivation: (ctx, self, buff, fv) => {
    if (ctx.randInt(0, 99) >= 20 || (buff.saveData1 ?? 0) >= 3) return
    const heal = Math.min(Math.trunc(self.maxHp * buff.saveData * 0.01), self.maxHp - self.hp)
    self.hp += heal
    fv.incHp = heal
    buff.saveData1 = (buff.saveData1 ?? 0) + 1
  },
  onRemove: (_ctx, self) => {
    if (trigger(self, 40082)) self.rebound -= rate
  },
})
const wisdomBuff = (rate: number, expert = false): BuffScripts => ({
  onAdd: (_ctx, self, buff) => {
    buff.saveData = 0
    buff.saveData1 = 0
    if (expert) self.absorb = 0
  },
  onActivation: (ctx, self, _buff, fv, timer) => {
    if (trigger(self, 40096) && self.hp < self.maxHp * 0.3 && !ctx.getBuff(self, 11887))
      ctx.addBuff(self, 11887, timer, fv, rate)
  },
})

export const PET_HALO_BUFFS: Record<string, BuffScripts> = {
  'buff/buff_shaluguanghuan0_11853.js': slaughterBuff(3),
  'buff/buff_shaluguanghuan1_11854.js': slaughterBuff(4),
  'buff/buff_shaluguanghuan2_11855.js': slaughterBuff(5),
  'buff/buff_jingjiguanghuan0_11857.js': thornBuff(3),
  'buff/buff_jingjiguanghuan1_11858.js': thornBuff(4),
  'buff/buff_jingjiguanghuan2_11859.js': thornBuff(5),
  'buff/buff_shenshengguanghuan0_11865.js': reset,
  'buff/buff_shenshengguanghuan1_11866.js': reset,
  'buff/buff_shenshengguanghuan2_11867.js': reset,
  'buff/buff_zhihuiguanghuan0_11869.js': wisdomBuff(18),
  'buff/buff_zhihuiguanghuan1_11870.js': wisdomBuff(24),
  'buff/buff_zhihuiguanghuan2_11871.js': wisdomBuff(30, true),
  'buff/buff_huiguangfanzhao_11887.js': {
    onAdd: (ctx, self, buff) => {
      ctx.changeAtk(self, self.minAtkMul + buff.saveData, self.maxAtkMul + buff.saveData)
      ctx.changeAtkTime(self, self.atkTimeMul + buff.saveData, self.atkTimeAdd)
    },
    onRemove: (ctx, self, buff) => {
      ctx.changeAtk(self, self.minAtkMul - buff.saveData, self.maxAtkMul - buff.saveData)
      ctx.changeAtkTime(self, self.atkTimeMul - buff.saveData, self.atkTimeAdd)
    },
  },
  'buff/buff_chonggaoguanghuan0_11898.js': {},
  'buff/buff_chonggaoguanghuan1_11899.js': {},
  'buff/buff_chonggaoguanghuan2_11900.js': {},
  'buff/buff_renzhuli_11901.js': {
    onAdd: (_ctx, self) => {
      self.decDamage += 100
    },
    onRemove: (_ctx, self) => {
      self.decDamage -= 100
    },
  },
  'buff/buff_shouhuakuangbao_11902.js': {},
}
