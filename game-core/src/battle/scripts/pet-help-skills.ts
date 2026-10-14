// Ported OnUser functions from the 2011 ispet=2 scripts. Numbers do not scale with skill level.
import { SKILL_LOSE, SKILL_SUCCESS, type ActiveBuff, type SkillScript } from '../types.js'

type Counters = ActiveBuff & { saveData2?: number; saveData9?: number }
const noop: SkillScript = () => SKILL_LOSE
const marker =
  (id: number, enemy = false, value = 0): SkillScript =>
  (ctx, self, target, fv, timer) => {
    ctx.addBuff(enemy ? target : self, id, timer, fv, value, 0)
    return SKILL_LOSE
  }
const strike =
  (rate: number, id?: number, value = 0, needsHit = true): SkillScript =>
  (ctx, self, target, fv, timer) => {
    ctx.attack(self, target, ctx.getDamage(self) * rate, fv, timer)
    if (id && (!needsHit || fv.hit === true) && !ctx.getBuff(target, id))
      ctx.addBuff(target, id, timer, fv, value, 0)
    return SKILL_SUCCESS
  }
const recover =
  (mana: boolean): SkillScript =>
  (_ctx, self, _target, fv) => {
    const rawAmount = (mana ? self.maxMp : self.maxHp) * 0.1
    const amount = Math.trunc(rawAmount)
    if (mana ? self.mp + rawAmount > self.maxMp : self.hp + rawAmount > self.maxHp)
      return SKILL_LOSE
    if (mana) {
      self.mp += amount
      fv.incMp = amount
    } else {
      self.hp += amount
      fv.incHp = amount
    }
    return SKILL_SUCCESS
  }

export const PET_HELP_SKILLS: Record<string, SkillScript> = {
  'skill/skill_chongjiaxue_40002.js': recover(false),
  'skill/skill_chongjialan_40003.js': recover(true),
  'skill/skill_chongdang_40006.js': marker(40006),
  'skill/skill_chongzhuoshi_40007.js': strike(0.75, 11838, 3),
  'skill/skill_chongxixue_40008.js': (ctx, self, target, fv, timer) => {
    self.vampiricHp += 50
    ctx.attack(self, target, ctx.getDamage(self) * 0.5, fv, timer)
    self.vampiricHp -= 50
    return SKILL_SUCCESS
  },
  'skill/skill_chongdingyao_40009.js': strike(0.75, 11811),
  // 40116 points to the same script in skill.ini.
  'skill/skill_chonglianji_40010.js': strike(1.5),
  'skill/skill_chonghuafen_40012.js': (ctx, self, target, fv, timer) => {
    // The original checks self even though it adds the pollen marker to target.
    if (ctx.getBuff(self, 1212)) return SKILL_LOSE
    ctx.addBuff(target, 1212, timer, fv, 12, 0)
    return SKILL_SUCCESS
  },
  'skill/skill_chongchanrao_40013.js': strike(0.75, 11837, 1),
  'skill/skill_chongtaiyang_40014.js': (ctx, self, target, fv, timer) => {
    if (self.mp < 0 || ctx.getBuff(target, 11843)) return SKILL_LOSE
    ctx.addBuff(target, 11843, timer, fv, 8, 0)
    fv.decMp = 0
    return SKILL_SUCCESS
  },
  'skill/skill_chongzhongya_40015.js': (ctx, self, target, fv, timer) => {
    const init = ctx.getBuff(target, 8888)
    if (!init || init.saveData % 10 >= 3) return SKILL_LOSE
    const peg = ctx.getBuff(target, 11840)
    ctx.attack(self, target, ctx.getDamage(self) * 0.75, fv, timer)
    if (fv.hit === true && !peg) {
      if (ctx.getBuff(target, 11813)) ctx.removeBuff(target, 11813, timer, fv)
      ctx.addBuff(target, 11813, timer, fv, 600, 0)
      init.saveData += 1
    }
    return SKILL_SUCCESS
  },
  'skill/skill_jueduizhongcheng_40098.js': marker(11873),
  'skill/skill_yazhi_40100.js': marker(11874, true),
  'skill/skill_xingyun_40104.js': noop,
  'skill/skill_eyun_40105.js': noop,
  'skill/skill_hanbinghuxi_40114.js': marker(11879, false, 35),
  'skill/skill_fangshoufanji_40115.js': marker(11881),
  'skill/skill_chongtunshi_40121.js': (ctx, self, target, fv, timer) => {
    if (target.mp === 0) return SKILL_LOSE
    const lost = Math.min(target.mp, target.maxMp * 0.1 * (ctx.getBuff(target, 11839) ? 2 : 1))
    const gained = Math.min(self.maxMp - self.mp, lost * (ctx.getBuff(self, 11839) ? 0.5 : 1))
    self.mp = Math.trunc(self.mp + gained)
    target.mp = Math.trunc(target.mp - lost)
    fv.incMp = Math.trunc(gained)
    fv.targetDecMp = Math.trunc(lost)
    for (const id of [11831, 11814, 11834]) {
      if (ctx.getBuff(target, id)) {
        ctx.removeBuff(target, id, timer, fv)
        return SKILL_SUCCESS
      }
    }
    if (!ctx.getBuff(target, 11897)) ctx.addBuff(target, 11897, timer, fv)
    return SKILL_SUCCESS
  },
  'skill/skill_shazhishouhu_40128.js': (ctx, self, _target, fv, timer) => {
    const init = ctx.getBuff(self, 8888) as Counters | undefined
    if (!init) return SKILL_LOSE
    if (ctx.randInt(0, 99) > 30 && ((init.saveData9 ?? 0) % 100) / 10 >= 3) return SKILL_LOSE
    const heal = Math.trunc(self.maxHp * 0.3)
    self.hp = heal
    fv.incHp = heal
    init.saveData9 = (init.saveData9 ?? 0) + 10
    if (ctx.getBuff(self, 11836)) ctx.removeBuff(self, 11836, timer, fv)
    return SKILL_SUCCESS
  },
  'skill/skill_shuilongbo_40129.js': strike(0.75, 11903, 0, false),
  'skill/skill_suanyefushi_40130.js': (ctx, self, target, fv, timer) => {
    const init = ctx.getBuff(self, 8888) as Counters | undefined
    if (!init || (init.saveData9 ?? 0) % 10 >= 2) return SKILL_LOSE
    ctx.attack(self, target, ctx.getDamage(self) * 0.75, fv, timer)
    if (fv.hit === true) ctx.addBuff(target, 11904, timer, fv)
    init.saveData9 = (init.saveData9 ?? 0) + 1
    return SKILL_SUCCESS
  },
  'skill/skill_yuansujingtong_40131.js': (ctx, self, _target, fv, timer) => {
    if (ctx.getBuff(self, 11905)) return SKILL_LOSE
    ctx.addBuff(self, 11905, timer, fv)
    return SKILL_SUCCESS
  },
  'skill/skill_leiyunfengbao_40132.js': (ctx, self, _target, fv, timer) => {
    if (ctx.randInt(1, 100) >= 30) return SKILL_LOSE
    ctx.addBuff(self, 11831, timer, fv, Math.trunc(self.maxHp * 0.18), 0)
    ctx.addBuff(self, 11909, timer, fv)
    return SKILL_SUCCESS
  },
  'skill/skill_huanhua_40133.js': (ctx, self, _target, fv, timer) => {
    const init = ctx.getBuff(self, 8888) as Counters | undefined
    if (ctx.randInt(1, 100) >= 50 || !init || ((init.saveData2 ?? 0) % 100) / 10 >= 5)
      return SKILL_LOSE
    const heal = Math.trunc(self.maxHp * 0.15)
    self.hp += heal
    fv.incHp = heal
    ctx.addBuff(self, 11906, timer, fv)
    init.saveData2 = (init.saveData2 ?? 0) + 10
    return SKILL_SUCCESS
  },
  'skill/skill_heianzhangkong_40134.js': (ctx, self, target, fv, timer) => {
    ctx.attack(self, target, ctx.getDamage(self) * 0.8, fv, timer)
    if (fv.hit === true) ctx.addBuff(target, 11907, timer, fv)
    return SKILL_SUCCESS
  },
  'skill/skill_xugoupao_40135.js': (ctx, self, target, fv, timer) => {
    const init = ctx.getBuff(self, 8888) as Counters | undefined
    if (!init || (ctx.getBuff(target, 11810) && (init.saveData2 ?? 0) % 10 >= 3)) return SKILL_LOSE
    ctx.attack(self, target, ctx.getDamage(self), fv, timer)
    const heal = Math.trunc((fv.damage ?? 0) * 0.4)
    self.hp += heal
    fv.incHp = (fv.incHp ?? 0) + heal
    if (fv.hit === true && ctx.randInt(0, 99) < 25) ctx.addBuff(target, 11810, timer, fv, 1200, 0)
    init.saveData2 = (init.saveData2 ?? 0) + 1
    return SKILL_SUCCESS
  },
}
