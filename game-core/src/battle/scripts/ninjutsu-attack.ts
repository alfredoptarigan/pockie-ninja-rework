// The 12 active learnable ninjutsu (skill_<name>_18xx.js). Rows exist for skill levels 1-13
// (id = (level - 1) * 10000 + base); the scripts pick their numbers by GetLevel(). Players only
// reach level 1 (UpSkilCfg.ini MaxLevel=1). The level 3+ columns are the original's half-finished
// tables (multipliers left at 0, times written as 2.55 units, ...) and are kept as they are.
// Most cost a share of a level-based MP amount and fall back to the normal attack without it.
// ponytail: the SkillAddN bonus (value * (1 + 0.01 * trunc(SkillAddN * 0.01))) is left out, the
// fighters have no SkillAdd yet (plan task B5); with SkillAdd 0 it multiplies by 1.
import {
  SKILL_LOSE,
  SKILL_SUCCESS,
  type ActiveBuff,
  type FightContext,
  type Fighter,
  type FightEvent,
  type SkillInput,
  type SkillScript,
} from '../types.js'

const BUFF_IMMUNITY = 8888
const BUFF_PARALYSIS = 11801
const BUFF_FREEZE = 11802
const BUFF_BURN = 11804
const BUFF_WINE = 11806
const BUFF_DEATH_SEAL = 11808
const BUFF_POISON = 11811
const BUFF_SEAL = 11812
const BUFF_STUN = 11813
const BUFF_WARM_BLOOD = 11814
const BUFF_FOG = 11821
const BUFF_SUNSET = 11822
const BUFF_CURSE = 11823
const BUFF_EARTH_WALL = 11824
const BUFF_STATIC_BARRIER = 11831
const BUFF_WEAK = 11833
const BUFF_DRAIN = 11836
const BUFF_VESSEL_DESTROY = 11839
const BUFF_SUBSTITUTE = 11840
const BUFF_PARRY = 11841
const BUFF_ELEMENT_MASTERY = 11905
const BUFF_THUNDER_STORM = 11909

const WARM_BLOOD_BACK = 0.2
const DEATH_SEALED = 0.3
const ELEMENT_BONUS = 0.15
const SURE_HIT = 999
const BOMB_SKILL_ID = 1828
const BOMB_KICKED_BACK = 6

/** The level-based MP amount every MP-costing ninjutsu scales. */
export function baseMpCost(level: number) {
  const steps =
    20 +
    level -
    1 +
    Math.trunc(level / 3 + 1) * 8 +
    ((Math.trunc((level - 1) / 10) * 7 + 14) / 3) * 8
  return (200 + 20 * (level - 1) * (1 + (steps / 12) * 0.01)) / 30
}

/** The script's `switch (skill.GetLevel())`: levels without a case keep 0. */
const atLevel = (table: number[], skill?: SkillInput) => table[(skill?.level ?? 0) - 1] ?? 0

const has = (ctx: FightContext, fighter: Fighter, buffId: number) =>
  ctx.getBuff(fighter, buffId) !== undefined

/** ToInt(BaseMPCost * rate), doubled while the caster's vessels are destroyed. */
function mpCost(ctx: FightContext, self: Fighter, rate: number) {
  const cost = Math.trunc(baseMpCost(self.level) * rate)
  return has(ctx, self, BUFF_VESSEL_DESTROY) ? cost * 2 : cost
}

/** Removes `buffId` first when present ("check repeated state" in the scripts). */
function clear(ctx: FightContext, target: Fighter, buffId: number, timer: number, fv: FightEvent) {
  if (has(ctx, target, buffId)) ctx.removeBuff(target, buffId, timer, fv)
}

/** Pays the MP and ends a drain (11836) on the caster. */
function finish(ctx: FightContext, self: Fighter, fv: FightEvent, timer: number, cost: number) {
  self.mp -= cost
  fv.decMp = cost
  clear(ctx, self, BUFF_DRAIN, timer, fv)
  return SKILL_SUCCESS
}

/** Sunset (11822) melts for double damage on a SaveData percent roll; element mastery adds 15 %. */
function elementMul(ctx: FightContext, self: Fighter) {
  const sunset = ctx.getBuff(self, BUFF_SUNSET)
  const melt = sunset && ctx.randInt(0, 99) < sunset.saveData ? 1 : 0
  const mastery = has(ctx, self, BUFF_ELEMENT_MASTERY) ? ELEMENT_BONUS : 0
  return { melt, mastery }
}

/** Warm blood (11814): the caster takes 20 % of its own strike. */
const warmBack = (ctx: FightContext, self: Fighter, damage: number) =>
  has(ctx, self, BUFF_WARM_BLOOD) ? damage * WARM_BLOOD_BACK : 0

/**
 * The 8888 buff counts the limited statuses one digit each: stun 1, paralysis 100, five elements
 * seal 1000, death seal 10000.
 */
const timesApplied = (immunity: ActiveBuff, unit: number) =>
  Math.trunc((immunity.saveData % (unit * 10)) / unit)

const hits = (fv: FightEvent) => fv.hit !== false

const CRYSTAL_BREAK = Array<number>(13).fill(200)

/** 1803 Crystal Blade: a 1-damage strike that freezes (the frozen target takes 200 %). */
const crystalBlade: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const breakBonus = atLevel(CRYSTAL_BREAK, skill)
  const cost = mpCost(ctx, self, 2.6)
  if (has(ctx, self, BUFF_SEAL) || self.mp < cost) return ctx.normalAttack(self, target, fv, timer)
  const substitute = has(ctx, target, BUFF_SUBSTITUTE)
  const parried = has(ctx, target, BUFF_PARRY)
  ctx.attack(self, target, 1, fv, timer)
  if (hits(fv) && !substitute) {
    clear(ctx, target, BUFF_FREEZE, timer, fv)
    clear(ctx, target, BUFF_BURN, timer, fv)
    clear(ctx, target, BUFF_WARM_BLOOD, timer, fv)
    ctx.addBuff(target, BUFF_FREEZE, timer, fv, breakBonus)
    // The hit used up the target's parry; it gets it back, with SaveData 0 (original quirk).
    if (parried) ctx.addBuff(target, BUFF_PARRY, timer, fv)
  }
  return finish(ctx, self, fv, timer, cost)
}

const COMBO_DAMAGE = [2.5, 2.5]
const COMBO_WEAK = [800, 800, 2.55, 2.74, 2.94, 3.13, 3.32, 3.52, 3.71, 3.91, 4.1, 4.3, 4.49]

/** 1807 Combo: 5 strikes x0.8 or 9 strikes x1.2 of damage * 2.5, then the caster is weak. */
const combo: SkillScript = (ctx, self, target, fv, timer, skill) => {
  let mul = atLevel(COMBO_DAMAGE, skill)
  const weakTime = atLevel(COMBO_WEAK, skill)
  if (has(ctx, self, BUFF_DEATH_SEAL)) mul *= DEATH_SEALED
  let count: number
  if (ctx.randInt(0, 99) < 50) {
    mul *= 0.8
    count = 5
  } else {
    mul *= 1.2
    count = 9
  }
  ctx.attack(self, target, ctx.getDamage(self) * mul, fv, timer)
  fv.attackCount = count
  ctx.addBuff(self, BUFF_WEAK, timer, fv, weakTime)
  return SKILL_SUCCESS
}

const FIRE_DAMAGE = [1.3, 1.3, 1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8]
const BURN_DAMAGE = [0.4, 0.4, 12, 13, 15, 17, 19, 21, 24, 26, 29, 31, 34]
const BURN_TICKS = [2, 2]

/** Wine (11806) on the target and no fog on either side: the HP lost burns on (11804). */
function ignite(
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  timer: number,
  rate: number,
  ticks: number,
) {
  if (!has(ctx, target, BUFF_WINE) || has(ctx, target, BUFF_FOG) || has(ctx, self, BUFF_FOG)) return
  const damage = (fv.damage ?? 0) * rate
  const burn = ctx.getBuff(target, BUFF_BURN)
  if (!burn) return ctx.addBuff(target, BUFF_BURN, timer, fv, damage, ticks)
  if (burn.saveData < damage) burn.saveData = Math.trunc(damage)
  burn.saveData1 = (burn.saveData1 ?? 0) + ticks
}

/** 1808 Fireball: damage * 1.3, breaks an earth wall, ignites wine; a frozen target is immune. */
const fireball: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const fire = atLevel(FIRE_DAMAGE, skill)
  if (self.canAttack < 1) return SKILL_LOSE
  const cost = mpCost(ctx, self, 1)
  if (has(ctx, self, BUFF_SEAL) || self.mp < cost) return ctx.normalAttack(self, target, fv, timer)
  const { melt, mastery } = elementMul(ctx, self)
  const damage = ctx.getDamage(self) * fire * (1 + melt + mastery)
  if (!has(ctx, target, BUFF_FREEZE)) {
    clear(ctx, target, BUFF_EARTH_WALL, timer, fv)
    ctx.attack(self, target, damage, fv, timer, warmBack(ctx, self, damage))
    if (hits(fv)) {
      ignite(ctx, self, target, fv, timer, atLevel(BURN_DAMAGE, skill), atLevel(BURN_TICKS, skill))
    }
  }
  if (melt) fv.neglectDef = true
  return finish(ctx, self, fv, timer, cost)
}

const RASENGAN_DAMAGE = [1.8]
const RASENGAN_BACK = [0.3]

/** 1810 Rasengan: damage * 1.8, the caster takes 30 % of it. Only level 1 has numbers. */
const rasengan: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const cost = mpCost(ctx, self, 1.4)
  if (has(ctx, self, BUFF_SEAL) || self.mp < cost) return ctx.normalAttack(self, target, fv, timer)
  const { melt, mastery } = elementMul(ctx, self)
  const damage = ctx.getDamage(self) * atLevel(RASENGAN_DAMAGE, skill) * (1 + melt + mastery)
  const back = warmBack(ctx, self, damage) + damage * atLevel(RASENGAN_BACK, skill)
  ctx.attack(self, target, damage, fv, timer, back)
  if (melt) fv.neglectDef = true
  return finish(ctx, self, fv, timer, cost)
}

/**
 * The shape of the once-per-duel seals (1814, 1823): a normal-damage strike that adds `buffId`
 * for the level's time (halved by a curse) and counts it in the target's 8888 buff.
 */
function sealStrike(buffId: number, times: number[], rate: number, unit: number): SkillScript {
  return (ctx, self, target, fv, timer, skill) => {
    let time = atLevel(times, skill)
    const cost = mpCost(ctx, self, rate)
    if (has(ctx, target, BUFF_CURSE)) time *= 0.5
    const immunity = ctx.getBuff(target, BUFF_IMMUNITY)
    if (self.mp < cost || !immunity || timesApplied(immunity, unit) >= 1) {
      return ctx.normalAttack(self, target, fv, timer)
    }
    const substitute = has(ctx, target, BUFF_SUBSTITUTE)
    const damage = ctx.getDamage(self)
    ctx.attack(self, target, damage, fv, timer, warmBack(ctx, self, damage))
    if (hits(fv) && !substitute) {
      clear(ctx, target, buffId, timer, fv)
      ctx.addBuff(target, buffId, timer, fv, time)
      immunity.saveData += unit
    }
    return finish(ctx, self, fv, timer, cost)
  }
}

const DEATH_SEAL_TIME = [2500, 2500, 2.5, 2.7, 2.8, 3, 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8]
const FIVE_SEAL_TIME = [2300, 2300, 2.6, 2.8, 3, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8, 3.9, 4]

const MIGHTY_DAMAGE = [1, 1]
const MIGHTY_HP_PERCENT = [7, 7]
const MIGHTY_STUN = [600, 600, 1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8]
const MIGHTY_MAX_STUNS = 3

/** 1822 Mighty Strike: damage + 7 % of the target's MaxHP and a stun, three times per duel. */
const mightyStrike: SkillScript = (ctx, self, target, fv, timer, skill) => {
  let mul = atLevel(MIGHTY_DAMAGE, skill)
  let bonus = atLevel(MIGHTY_HP_PERCENT, skill)
  const stunTime = atLevel(MIGHTY_STUN, skill)
  if (has(ctx, self, BUFF_DEATH_SEAL)) {
    mul *= DEATH_SEALED
    bonus *= DEATH_SEALED
  }
  const immunity = ctx.getBuff(target, BUFF_IMMUNITY)
  if (!immunity || timesApplied(immunity, 1) >= MIGHTY_MAX_STUNS) {
    return ctx.normalAttack(self, target, fv, timer)
  }
  const substitute = has(ctx, target, BUFF_SUBSTITUTE)
  ctx.attack(self, target, ctx.getDamage(self) * mul + bonus * 0.01 * target.maxHp, fv, timer)
  if (hits(fv) && !substitute) {
    clear(ctx, target, BUFF_STUN, timer, fv)
    ctx.addBuff(target, BUFF_STUN, timer, fv, stunTime)
    immunity.saveData += 1
  }
  return SKILL_SUCCESS
}

const CHIDORI_DAMAGE = [1.6, 1.6, 2.55, 2.74, 2.94, 3.13, 3.32, 3.52, 3.71, 3.91, 4.1, 4.3, 4.49]
const CHIDORI_PARALYSIS = [350, 350]
const CHIDORI_BARRIER_BONUS = 1.2
const CHIDORI_MAX_PARALYSES = 4
const PARALYSIS_UNIT = 100

/**
 * Against a static barrier (11831): a sure hit through the shield. The script first makes a
 * zero-damage "virtual hit"; Attack returns before rolling for zero damage, so it always passes.
 * The thunder multiplier / 3 is added to and taken from int fields (truncated, usually nothing).
 */
function pierceBarrier(
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  timer: number,
  damage: number,
  thunder: number,
) {
  const pierce = thunder / 3
  target.shieldDamage = Math.trunc(target.shieldDamage + pierce)
  ctx.changeHit(self, self.hitMulAdd + SURE_HIT)
  ctx.attack(self, target, damage, fv, timer)
  if (fv.targetShield) fv.targetShield = Math.trunc(fv.targetShield - pierce) || 0
  ctx.changeHit(self, self.hitMulAdd - SURE_HIT)
}

/** Clears a stun and, four times per duel, paralyses: the next action comes later. */
function paralyse(
  ctx: FightContext,
  target: Fighter,
  immunity: ActiveBuff,
  fv: FightEvent,
  timer: number,
  delay: number,
) {
  clear(ctx, target, BUFF_STUN, timer, fv)
  if (timesApplied(immunity, PARALYSIS_UNIT) >= CHIDORI_MAX_PARALYSES) return
  if (has(ctx, target, BUFF_FREEZE)) return
  ctx.changeNextAtkTime(target, delay)
  clear(ctx, target, BUFF_PARALYSIS, timer, fv)
  ctx.addBuff(target, BUFF_PARALYSIS, timer, fv)
  immunity.saveData += PARALYSIS_UNIT
}

/** 1825 Chidori: damage * 1.6 and a 350-unit paralysis; 20 % stronger behind its own barrier. */
const chidori: SkillScript = (ctx, self, target, fv, timer, skill) => {
  let thunder = atLevel(CHIDORI_DAMAGE, skill)
  let delay = atLevel(CHIDORI_PARALYSIS, skill)
  if (has(ctx, self, BUFF_STATIC_BARRIER)) {
    thunder *= CHIDORI_BARRIER_BONUS
    delay *= CHIDORI_BARRIER_BONUS
  }
  const cost = mpCost(ctx, self, 2)
  const immunity = ctx.getBuff(target, BUFF_IMMUNITY)
  if (has(ctx, self, BUFF_SEAL) || self.mp < cost || !immunity) {
    return ctx.normalAttack(self, target, fv, timer)
  }
  const { melt, mastery } = elementMul(ctx, self)
  const storm = has(ctx, self, BUFF_THUNDER_STORM) ? ELEMENT_BONUS : 0
  const damage = ctx.getDamage(self) * thunder * (1 + melt + mastery + storm)
  if (has(ctx, target, BUFF_STATIC_BARRIER)) {
    pierceBarrier(ctx, self, target, fv, timer, damage, thunder)
  } else {
    const back = warmBack(ctx, self, damage)
    const substitute = has(ctx, target, BUFF_SUBSTITUTE)
    ctx.attack(self, target, damage, fv, timer, back)
    if (hits(fv) && !substitute) paralyse(ctx, target, immunity, fv, timer, delay)
  }
  if (melt) fv.neglectDef = true
  return finish(ctx, self, fv, timer, cost)
}

const ASSASSIN_DAMAGE = [1.2, 1.2, 1.2, 1.3, 1.4, 1.5, 0, 0, 0, 0, 0, 0, 0]
const ASSASSIN_VAMPIRIC = [0.5, 0.5]

/**
 * 1827 Assassinate: damage * 1.2 healing 50 % of it, and the caster catches the target's poison
 * and wine (SaveData = the target buff's LifeTime, so wine with LifeTime -1 raises HitMul by 1).
 */
const assassinate: SkillScript = (ctx, self, target, fv, timer, skill) => {
  let mul = atLevel(ASSASSIN_DAMAGE, skill)
  const vampiric = Math.trunc(atLevel(ASSASSIN_VAMPIRIC, skill) * 100)
  if (has(ctx, self, BUFF_DEATH_SEAL)) mul *= DEATH_SEALED
  const cost = mpCost(ctx, self, 0.7)
  if (self.mp < cost) return ctx.normalAttack(self, target, fv, timer)
  self.vampiricHp += vampiric
  const damage = ctx.getDamage(self) * mul
  ctx.attack(self, target, damage, fv, timer, warmBack(ctx, self, damage))
  self.vampiricHp -= vampiric
  if (hits(fv)) {
    const poison = ctx.getBuff(target, BUFF_POISON)
    if (poison) ctx.addBuff(self, BUFF_POISON, timer, fv, poison.lifeTime)
    const wine = ctx.getBuff(target, BUFF_WINE)
    if (wine) ctx.addBuff(self, BUFF_WINE, timer, fv, wine.lifeTime)
  }
  return finish(ctx, self, fv, timer, cost)
}

const BOMB_DAMAGE = [2.1, 2.1, 47, 62, 79, 98, 119, 141, 165, 191, 218, 247, 278]

/**
 * 1828 Bomb: damage * 2.1, no MP, breaks an earth wall. Players and NPCs with CounterBombMul > 0
 * that can act kick it back (event 6, the caster takes it) with a chance growing over the fight.
 */
const bomb: SkillScript = (ctx, self, target, fv, timer, skill) => {
  const mul = atLevel(BOMB_DAMAGE, skill)
  if (self.canAttack < 1) return SKILL_LOSE
  const kickChance = 100 - 100 / (1 + Math.pow(timer / 200, 0.5) * 0.05)
  clear(ctx, target, BUFF_EARTH_WALL, timer, fv)
  const kicked =
    ctx.randInt(0, 99) < kickChance &&
    target.kicksBombs === true &&
    target.canMove > 0 &&
    target.canAttack > 0
  if (kicked) {
    fv.actor = target.index
    fv.target = self.index
    fv.event = BOMB_KICKED_BACK
    fv.skillId = BOMB_SKILL_ID
    ctx.attack(target, self, ctx.getDamage(self) * mul, fv, timer)
  } else {
    ctx.attack(self, target, ctx.getDamage(self) * mul, fv, timer)
  }
  return SKILL_SUCCESS
}

const SCALPEL_BURN = [15, 15, 17, 18, 19, 20, 42, 47, 52, 56, 61, 65, 70]

/** 1830 Chakra Scalpel: a normal strike that burns 15 % of the caster's MaxMP from the target. */
const chakraScalpel: SkillScript = (ctx, self, target, fv, timer, skill) => {
  let burn = atLevel(SCALPEL_BURN, skill)
  if (has(ctx, self, BUFF_DEATH_SEAL)) burn *= DEATH_SEALED
  const cost = mpCost(ctx, self, 1)
  if (self.mp < cost) return ctx.normalAttack(self, target, fv, timer)
  if (has(ctx, target, BUFF_VESSEL_DESTROY)) burn *= 2
  burn = Math.min(burn * 0.01 * self.maxMp, target.mp)
  const substitute = has(ctx, target, BUFF_SUBSTITUTE)
  const damage = ctx.getDamage(self)
  ctx.attack(self, target, damage, fv, timer, warmBack(ctx, self, damage))
  if (hits(fv) && !substitute) {
    target.mp -= Math.trunc(burn)
    fv.targetDecMp = Math.trunc(burn)
  }
  return finish(ctx, self, fv, timer, cost)
}

const PALM_DAMAGE = [1.5, 1.5, 1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8]

/** 1832 Eight Trigrams Palm: damage * 1.5, destroys the target's vessels (MP costs x2). */
const eightTrigramsPalm: SkillScript = (ctx, self, target, fv, timer, skill) => {
  let mul = atLevel(PALM_DAMAGE, skill)
  if (has(ctx, self, BUFF_DEATH_SEAL)) mul *= DEATH_SEALED
  const substitute = has(ctx, target, BUFF_SUBSTITUTE)
  ctx.attack(self, target, ctx.getDamage(self) * mul, fv, timer)
  if (hits(fv) && !substitute && !has(ctx, target, BUFF_VESSEL_DESTROY)) {
    // SaveData is the damage multiplier, unused by the buff.
    ctx.addBuff(target, BUFF_VESSEL_DESTROY, timer, fv, mul)
  }
  return SKILL_SUCCESS
}

export const NINJUTSU_ATTACK: Record<string, SkillScript> = {
  'skill/skill_jiejing_1803.js': crystalBlade,
  'skill/skill_lianji_1807.js': combo,
  'skill/skill_huoqiu_1808.js': fireball,
  'skill/skill_luoxuanwan_1810.js': rasengan,
  'skill/skill_shiguifengjin_1814.js': sealStrike(BUFF_DEATH_SEAL, DEATH_SEAL_TIME, 3.1, 10000),
  'skill/skill_guaili_1822.js': mightyStrike,
  'skill/skill_wuxingfengyin_1823.js': sealStrike(BUFF_SEAL, FIVE_SEAL_TIME, 2.8, 1000),
  'skill/skill_qianniao_1825.js': chidori,
  'skill/skill_ansha_1827.js': assassinate,
  'skill/skill_zhadan_1828.js': bomb,
  'skill/skill_chakelashoushudao_1830.js': chakraScalpel,
  'skill/skill_baguazhang_1832.js': eightTrigramsPalm,
}
