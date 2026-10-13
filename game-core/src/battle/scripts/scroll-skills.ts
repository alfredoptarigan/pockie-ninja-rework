// Scroll tooltips at level one; higher levels are deliberately not inferred.
// Buffs without a tooltip duration last until duel cleanup.
import fightBuffs from '../../../../server/data/game/fight-buffs.json'
import { BUFFS } from '../buffs.js'
import { SKILL_LOSE, SKILL_SUCCESS, type Fighter, type SkillScript } from '../types.js'
import { baseMpCost } from './ninjutsu-attack.js'
import { SCROLL_BUFF as B } from './scroll-buffs.js'

export function negativeEffects(self: Fighter) {
  return (self.buffs ?? []).filter(
    (buff) =>
      BUFFS[buff.id]?.negative ||
      (fightBuffs as Record<string, { overlying?: number }>)[buff.id]?.overlying === 1,
  )
}
const dispellable = (self: Fighter) =>
  negativeEffects(self).filter((buff) => !BUFFS[buff.id]?.undispellable)

const scripts: Record<number, SkillScript> = {
  1831: (ctx, self, _target, fv, timer) => {
    ctx.addBuff(self, B.izanagi, timer, fv)
    return SKILL_SUCCESS
  },
  1833: (ctx, self, _target, fv, timer) => {
    const negative = dispellable(self)
    if (negative.length)
      ctx.removeBuff(self, negative[ctx.randInt(0, negative.length - 1)]!.id, timer, fv)
    else {
      const heal = Math.min(self.maxHp - self.hp, Math.trunc(self.maxHp * 0.1))
      if (!heal) return SKILL_LOSE
      self.hp += heal
      fv.incHp = heal
    }
    return SKILL_SUCCESS
  },
  1834: (ctx, self, _target, fv, timer) => {
    if (ctx.getBuff(self, B.izanami) || ctx.getBuff(self, B.sprenger)) return SKILL_LOSE
    ctx.addBuff(self, B.izanami, timer, fv)
    return SKILL_SUCCESS
  },
  1835: (ctx, self, target, fv, timer) => {
    ctx.attack(self, target, ctx.getDamage(self) * 1.5, fv, timer)
    if (fv.hit !== false) ctx.addBuff(target, 11813, timer, fv, 600)
    ctx.addBuff(self, B.kirin, timer, fv)
    return SKILL_SUCCESS
  },
  1836: (ctx, self, target, fv, timer) => {
    ctx.attack(self, target, ctx.getDamage(self) * 1.3, fv, timer)
    if (fv.hit !== false) {
      const existing = ctx.getBuff(target, B.sprenger)
      if (existing) {
        const old = existing.saveData
        existing.saveData = Math.min(2, old + 1)
      } else ctx.addBuff(target, B.sprenger, timer, fv, 1)
    }
    return SKILL_SUCCESS
  },
  18041: (ctx, self, target, fv, timer) => {
    const defense = target.defense
    const reduction = target.decDamage
    const absorption = target.absorb
    const parry = target.parryPercent
    const shield = target.shieldBuff
    // Ignore protective blessings for this strike without removing their states.
    target.decDamage = Math.min(0, reduction)
    target.absorb = 0
    target.parryPercent = 0
    target.shieldBuff = null
    if (ctx.randInt(0, 99) < 25) target.defense = Math.trunc(defense * 0.75)
    try {
      ctx.attack(self, target, ctx.getDamage(self) * 1.3, fv, timer)
    } finally {
      target.defense = defense
      target.decDamage = reduction
      target.absorb = absorption
      target.parryPercent = parry
      target.shieldBuff = shield
    }
    return SKILL_SUCCESS
  },
  18042: (ctx, self, target, fv, timer) => {
    self.vampiricHp += 10
    try {
      ctx.attack(self, target, ctx.getDamage(self) * 1.5, fv, timer)
    } finally {
      self.vampiricHp -= 10
    }
    if (fv.hit !== false) ctx.addBuff(target, B.sand, timer, fv)
    ctx.addBuff(self, B.earth, timer, fv)
    return SKILL_SUCCESS
  },
  18043: (ctx, self, target, fv, timer) => {
    const gates = [11819, 11844, 11845, 11846, 11847, 11848, 11849, 11850]
    const current = gates.findIndex((id) => ctx.getBuff(self, id))
    const open = Math.min(8, current + 1 + 3)
    if (current >= 0) ctx.removeBuff(self, gates[current]!, timer, fv)
    ctx.addBuff(self, gates[open - 1]!, timer, fv, open === 8 ? 1000 : timer)
    ctx.attack(self, target, ctx.getDamage(self) * 0.32 * open, fv, timer)
    return SKILL_SUCCESS
  },
  18044: (ctx, self, target, fv, timer) => {
    const rebound = target.rebound
    target.rebound = 0
    try {
      ctx.attack(self, target, ctx.getDamage(self) * 1.2 + target.maxHp * 0.07, fv, timer)
    } finally {
      target.rebound = rebound
    }
    if (fv.hit !== false) ctx.addBuff(target, 11813, timer, fv, 1200)
    return SKILL_SUCCESS
  },
  18045: (ctx, self, target, fv, timer) => {
    ctx.addBuff(self, B.cremation, timer, fv, self.dodge * 0.15)
    ctx.attack(self, target, ctx.getDamage(self) * 1.2, fv, timer)
    return SKILL_SUCCESS
  },
  18046: (ctx, self, target, fv, timer) => {
    const uses = ctx.getBuff(self, B.hollowUses)
    if (uses && uses.saveData >= 3) return SKILL_LOSE
    const negative = negativeEffects(self)
    ctx.attack(self, target, (ctx.getDamage(self) * (180 + 60 * negative.length)) / 100, fv, timer)
    for (const buff of negative) {
      if (!BUFFS[buff.id]?.undispellable) ctx.removeBuff(self, buff.id, timer, fv)
    }
    if (uses) uses.saveData += 1
    else ctx.addBuff(self, B.hollowUses, timer, fv, 1)
    return SKILL_SUCCESS
  },
  18091: (ctx, self, target, fv, timer) => {
    ctx.attack(self, target, ctx.getDamage(self) * 1.6, fv, timer)
    if (fv.hit !== false) {
      const vulnerability = ctx.getBuff(target, B.fireVulnerability)
      if (vulnerability) vulnerability.saveData = Math.min(8, vulnerability.saveData + 1)
      else ctx.addBuff(target, B.fireVulnerability, timer, fv, 1)
      ctx.addBuff(target, B.burn, timer, fv, (fv.damage ?? 0) * 0.4, 2)
    }
    return SKILL_SUCCESS
  },
}

const chakra: Record<number, number> = {
  1831: 2,
  1833: 1,
  1834: 1.6,
  1835: 2,
  1836: 3,
  18041: 1.6,
  18042: 1,
  18043: 0,
  18044: 2.3,
  18045: 3,
  18046: 3,
  18091: 1.3,
}

export const SCROLL_SKILLS: Record<string, SkillScript> = Object.fromEntries(
  Object.entries(scripts).map(([key, script]) => {
    const id = Number(key)
    const wrapped: SkillScript = (ctx, self, target, fv, timer, skill) => {
      if (self.hp <= 0 && id !== 1834) return SKILL_LOSE
      const rate = chakra[id]!
      const cost = Math.trunc(baseMpCost(self.level) * rate) * (ctx.getBuff(self, 11839) ? 2 : 1)
      if (
        self.canMove <= 0 ||
        self.canUseSkill <= 0 ||
        ctx.getBuff(self, 11812) ||
        self.mp < cost
      ) {
        return skill?.type === 1 ? ctx.normalAttack(self, target, fv, timer) : SKILL_LOSE
      }
      const result = script(ctx, self, target, fv, timer, skill)
      if (result === SKILL_SUCCESS) {
        self.mp -= cost
        fv.decMp = cost
      }
      return result
    }
    return [`skill/skill_scroll_${id}.js`, wrapped]
  }),
)
