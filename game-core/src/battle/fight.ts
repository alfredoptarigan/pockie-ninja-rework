// Fight simulation ported from FightSystem.java / SkillSystem.java / BuffSystem.java
// (docs/original-data/battle.md): sequential 1v1 duels on an AtkTime timeline (at most 60 actions
// per duel), priority strikes, trigger skills by quomodo, attack skill choice (must-skills, then a
// weighted pick), scripted skills (./skills.ts), fight buffs (./buffs.ts), hit / crit / DecDamage /
// parry / defence / shields, rebound, absorption, vampiric, counters and the CanMove / CanAttack /
// CanUseSkill flags. RandInt calls happen where the Java code makes them.
import { createRandom } from '../random.js'
import { BUFFS } from './buffs.js'
import {
  absorbed,
  applyCrit,
  applyDecDamage,
  applyDefense,
  applyParry,
  hitChance,
  reboundOf,
  vampiricOf,
} from './damage.js'
import { GENERIC_SKILLS, NORMAL_ATTACK, SKILL_SCRIPTS } from './skills.js'
import {
  SKILL_CANT_USE,
  SKILL_LOSE,
  SKILL_NO_MANA,
  SKILL_SUCCESS,
  type ActiveBuff,
  type FightContext,
  type Fighter,
  type FighterInput,
  type FightEvent,
  type Replay,
  type SkillInput,
  type Side,
} from './types.js'

export type { BuffChange, FighterInput, FightEvent, Replay, Side, SkillInput } from './types.js'

const MAX_BOUT = 60
const FIGHT_BEGIN = 1
const BEFORE_ATTACK = 2
const BEFORE_ATTACKED = 3
const ON_DAMAGED = 4
const ON_DEATH = 5
const AFTER_HIT = 7
const AFTER_HIT_PET = 8
const AFTER_BEING_HIT = 9
const SHIELD_BUFF = 3
const f = Math.fround
const probability = (skill: SkillInput) => skill.probability ?? 0

export function simulateFight({
  attackers,
  defenders,
  seed,
}: {
  attackers: FighterInput[]
  defenders: FighterInput[]
  seed: number
}): Replay {
  const random = createRandom(seed)
  const randInt = (min: number, max: number) => (max < min ? min : random.between(min, max))
  const events: FightEvent[] = []
  /** FightValue.IsChange: the script switched to another skill. */
  const changed = new WeakSet<FightEvent>()

  const toFighter =
    (side: Side, offset: number) =>
    (input: FighterInput, i: number): Fighter => {
      // FightObject.AddSkill keeps each list sorted by ascending priority (stable).
      const skills = [...(input.skills ?? GENERIC_SKILLS)].sort(
        (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
      )
      return {
        ...input,
        // FightObject.Set rescales Tough.
        tough: Math.ceil(input.tough / 1.5),
        decDamage: input.decDamage ?? 0,
        rebound: input.rebound ?? 0,
        absorb: input.absorb ?? 0,
        vampiricHp: input.vampiricHp ?? 0,
        vampiricMp: input.vampiricMp ?? 0,
        index: offset + i,
        side,
        startHp: input.hp,
        startMp: input.mp,
        initAtkTime: input.atkTime,
        atkTimeMul: 0,
        initHit: input.hit,
        hitMulAdd: 0,
        initMinAttack: input.minAttack,
        initMaxAttack: input.maxAttack,
        minAtkMul: 0,
        maxAtkMul: 0,
        next: 0,
        parryPercent: 0,
        initDodge: input.dodge,
        dodgeMulAdd: 0,
        canMove: 1,
        canAttack: 1,
        canUseSkill: 1,
        shieldBuff: null,
        shieldDamage: 0,
        shieldCount: 0,
        buffs: null,
        attackSkills: skills.filter((s) => s.type === 1),
        triggerSkills: skills.filter((s) => s.type === 2),
        opponent: null,
      }
    }
  const left = attackers.map(toFighter('attackers', 0))
  const right = defenders.map(toFighter('defenders', attackers.length))

  const isBreak = (a: Fighter, b: Fighter) => a.hp <= 0 || b.hp <= 0
  const skillEvent = (self: Fighter, target: Fighter, event: number): FightEvent => ({
    actor: self.index,
    event,
    target: target.index,
  })
  const getDamage = (self: Fighter) =>
    self.maxAttack <= self.minAttack ? self.maxAttack : randInt(self.minAttack, self.maxAttack)

  // ---- Buffs (BuffSystem) ----

  function removeBuffAt(target: Fighter, i: number, timer: number, fv: FightEvent) {
    const buff = target.buffs?.[i]
    if (!buff) return
    ;(fv.delBuffs ??= []).push({ role: target.index, buff: buff.id })
    target.buffs!.splice(i, 1)
    if (BUFFS[buff.id]?.type === SHIELD_BUFF) target.shieldBuff = null
    BUFFS[buff.id]?.onRemove?.(ctx, target, buff, fv, timer)
  }

  function addBuff(
    target: Fighter,
    buffId: number,
    timer: number,
    fv: FightEvent,
    saveData = 0,
    saveData1 = 0,
  ) {
    const def = BUFFS[buffId]
    if (!def || (def.validity !== 1 && def.validity !== 2)) return
    if (def.replace !== 0 && target.buffs) {
      for (let i = target.buffs.length - 1; i >= 0; i--) {
        const other = target.buffs[i]
        if (other && BUFFS[other.id]?.replace === def.replace) removeBuffAt(target, i, timer, fv)
      }
    }
    ;(fv.addBuffs ??= []).push({ role: target.index, buff: buffId })
    const buff: ActiveBuff = {
      id: buffId,
      saveData: Math.trunc(saveData),
      saveData1: Math.trunc(saveData1),
      lifeTime: def.lifeTime,
      startTime: timer,
    }
    ;(target.buffs ??= []).push(buff)
    if (def.type === SHIELD_BUFF) target.shieldBuff = buff
    def.onAdd?.(ctx, target, buff, fv, timer)
  }

  function removeBuff(target: Fighter, buffId: number, timer: number, fv: FightEvent) {
    const i = target.buffs?.findIndex((b) => b.id === buffId) ?? -1
    if (i >= 0) removeBuffAt(target, i, timer, fv)
  }

  function clearTypeBuff(target: Fighter, fv: FightEvent, clearType: number, timer: number) {
    if (!target.buffs) return
    for (let i = target.buffs.length - 1; i >= 0; i--) {
      const buff = target.buffs[i]
      if (buff && BUFFS[buff.id]?.clearType === clearType) removeBuffAt(target, i, timer, fv)
    }
  }

  /** ActivationBuffBeginFight: ticks (type 2) and expiry at the start of the owner's action. */
  function activateBuffs(self: Fighter, timer: number) {
    if (!self.buffs) return true
    const ids = self.buffs.map((b) => b.id)
    for (let i = ids.length - 1; i >= 0; i--) {
      const buff = self.buffs.findLast((b) => b.id === ids[i])
      if (!buff) continue
      const size = events.length
      let fv: FightEvent | null = null
      if (BUFFS[buff.id]?.type === 2) {
        fv = { actor: self.index, event: 9, skillId: buff.id }
        BUFFS[buff.id]?.onActivation?.(ctx, self, buff, fv, timer)
      }
      if (buff.lifeTime !== -1 && timer > buff.startTime + buff.lifeTime) {
        fv ??= { actor: self.index, event: 9 }
        removeBuff(self, buff.id, timer, fv)
      }
      if (!fv) continue
      events.splice(size, 0, fv)
      if (self.hp > 0) continue
      die(self, self, timer)
      if (self.hp <= 0) return false
    }
    return true
  }

  /** The duel loop starts by removing every buff of both fighters (event 9). */
  function clearAllBuffs(fighter: Fighter) {
    // The original also writes an empty event 9 once the buff list exists; skipped here.
    if (!fighter.buffs?.length) return
    const fv: FightEvent = { actor: fighter.index, event: 9 }
    for (let i = fighter.buffs.length - 1; i >= 0; i--) removeBuffAt(fighter, i, 0, fv)
    events.push(fv)
  }

  // ---- Damage (FightSystem.Attack / Damage.java) ----

  /** Damage.Damage: raw HP change, then the victim's on-damaged trigger. */
  function damageHp(victim: Fighter, amount: number, timer: number) {
    const attacker = victim.opponent
    const dealt = Math.min(victim.hp, amount)
    victim.hp = Math.min(victim.maxHp, Math.max(0, victim.hp - dealt))
    if (dealt > 0 && victim.hp > 0 && attacker && attacker.hp > 0 && attacker !== victim) {
      trigger(victim, attacker, ON_DAMAGED, timer)
    }
  }

  /** Damage.DamageUnSkill: raw HP change without triggers (negative heals, capped at MaxHP). */
  function changeHp(victim: Fighter, amount: number) {
    victim.hp = Math.min(victim.maxHp, Math.max(0, victim.hp - Math.min(victim.hp, amount)))
  }

  /** FightSystem.ShieldDamage: the shield takes the damage first. */
  function shieldDamage(
    owner: Fighter,
    damage: number,
    timer: number,
    fv: FightEvent,
    key: 'targetShield' | 'selfShield',
  ) {
    if (!owner.shieldBuff) return damage
    const taken = Math.min(damage, owner.shieldDamage)
    if (taken) fv[key] = (fv[key] ?? 0) + taken
    if (damage >= owner.shieldDamage) {
      owner.shieldDamage = 0
      removeBuff(owner, owner.shieldBuff.id, timer, fv)
      return damage - taken
    }
    owner.shieldDamage -= damage
    if (owner.shieldCount !== -1) {
      if (owner.shieldCount === 0) removeBuff(owner, owner.shieldBuff.id, timer, fv)
      owner.shieldCount--
    }
    return 0
  }

  function attack(
    self: Fighter,
    target: Fighter,
    damage: number,
    selfDamage: number,
    fv: FightEvent,
    timer: number,
  ) {
    if (target.hp <= 0 || (damage === 0 && selfDamage === 0)) {
      fv.damage = 0
      return
    }
    if (randInt(1, 100) > hitChance(target.dodge, self.hit)) {
      fv.hit = false
      return
    }
    const c = self.crit - target.tough
    if (c > 0 && randInt(1, 100) <= Math.trunc(c / 16)) {
      damage = applyCrit(damage, self.critAttach, c)
      fv.crit = true
    }
    let back = reboundOf(damage, target.rebound)
    const targetHp = absorbed(damage, target.absorb)
    damage = applyDecDamage(damage, target.decDamage)
    if (target.parryPercent > 0) {
      damage = applyParry(damage, target.parryPercent)
      fv.parry = true
    }
    damage = applyDefense(damage, target.defense, self.neglectDefense)
    damage = shieldDamage(target, damage, timer, fv, 'targetShield')
    back = applyDefense(applyDecDamage(back, self.decDamage), self.defense, target.neglectDefense)
    if (back) fv.backDamage = back
    let selfHp = absorbed(selfDamage, self.absorb)
    // Original bugs: this drains the target's shield, and the target's stats mitigate selfHp.
    shieldDamage(target, selfHp, timer, fv, 'selfShield')
    selfHp = applyDefense(
      applyDecDamage(selfHp, target.decDamage),
      target.defense,
      self.neglectDefense,
    )
    back = shieldDamage(self, back, timer, fv, 'selfShield')
    const incHp = vampiricOf(damage - targetHp, self.vampiricHp)
    const incMp = vampiricOf(damage - targetHp, self.vampiricMp)
    const lastTarget = damage - targetHp
    const lastSelf = back + selfDamage - selfHp - incHp
    if (incHp) fv.incHp = (fv.incHp ?? 0) + incHp
    if (incMp) fv.incMp = (fv.incMp ?? 0) + incMp
    if (lastSelf + incHp) fv.selfDamage = lastSelf + incHp
    fv.damage = lastTarget
    fv.hit = true
    self.mp += incMp
    changeHp(target, lastTarget)
    damageHp(self, lastSelf, timer)
    clearTypeBuff(target, fv, 2, timer)
    if (damage > 0) clearTypeBuff(target, fv, 1, timer)
    if (back + selfDamage > 0) clearTypeBuff(self, fv, 1, timer)
    if (damage > 0 && target.hp > 0 && self.hp > 0 && self !== target) {
      trigger(target, self, ON_DAMAGED, timer)
    }
  }

  // ---- Skills (SkillSystem) ----

  /** Weighted pick shared by FindTypeTriggerSkill and FindAttackSkill; always rolls. */
  function pickWeighted(pool: SkillInput[]) {
    const total = pool.reduce((sum, s) => sum + probability(s), 0)
    let r: number
    if (total < 100) {
      r = randInt(0, 100)
      if (r > total) return null
    } else {
      r = randInt(0, total)
    }
    let acc = 0
    for (const skill of pool) {
      if (r > acc && r <= acc + probability(skill)) return skill
      acc += probability(skill)
    }
    return null
  }

  function spendMp(self: Fighter, fv: FightEvent, decMp: number) {
    if (decMp === 0) return
    fv.decMp = decMp
    self.mp -= decMp
  }

  function useSkill(
    self: Fighter,
    target: Fighter,
    skill: SkillInput,
    damage: number,
    timer: number,
    fv: FightEvent,
    canCounter: boolean,
  ): number {
    if (self.mp < 0) self.mp = 0
    const decMp = skill.decmp ?? 0
    if (decMp !== 0 && self.mp < decMp) return SKILL_NO_MANA
    const skillId = skill.secondid ?? skill.id
    if (skill.javascript) {
      const script = SKILL_SCRIPTS[skill.javascript]
      const res = script ? script(ctx, self, target, fv, timer, skill) : SKILL_LOSE
      if (res !== SKILL_SUCCESS) return res
      if (!changed.has(fv) || !fv.skillId) {
        fv.skillId = skillId
        spendMp(self, fv, decMp)
      }
    } else {
      fv.skillId = skillId
      spendMp(self, fv, decMp)
      const scaled = (mul = 0, add = 0) => Math.trunc(f(f(damage * f(mul)) + add))
      attack(
        self,
        target,
        scaled(skill.mul, skill.add),
        scaled(skill.selfmul, skill.selfadd),
        fv,
        timer,
      )
    }
    if (skill.canbecounter && canCounter && fv.hit !== false && target.canAttack !== 0) {
      counter(target, self, timer)
    }
    return SKILL_SUCCESS
  }

  /** FightSystem.ChangeSkill + FightSystem.UserSkill (the script-facing one). */
  function changeSkill(
    self: Fighter,
    target: Fighter,
    skill: SkillInput,
    fv: FightEvent,
    timer: number,
  ) {
    changed.add(fv)
    if (skill.type !== 1 || self.canMove <= 0) return SKILL_CANT_USE
    if (skill.quomodo === 2 && self.canAttack <= 0) return SKILL_CANT_USE
    if (skill !== NORMAL_ATTACK && self.canUseSkill <= 0) return SKILL_CANT_USE
    return useSkill(self, target, skill, getDamage(self), timer, fv, true)
  }

  const normalAttack = (self: Fighter, target: Fighter, fv: FightEvent, timer: number) =>
    changeSkill(self, target, NORMAL_ATTACK, fv, timer)

  function checkDeaths(self: Fighter, target: Fighter, timer: number) {
    if (self.hp <= 0) die(self, target, timer)
    if (target.hp <= 0) die(target, self, timer)
  }

  /** UserSkillBeforeAttack, UserBeDamageSkill, UserDieSkill, ...: trigger skills of a quomodo. */
  function trigger(self: Fighter, target: Fighter, quomodo: number, timer: number) {
    if (self.canMove <= 0 || self.canUseSkill <= 0) return false
    if (quomodo === ON_DEATH) self.hp = 0
    if (self.triggerSkills.length === 0) return false
    const candidates = self.triggerSkills.filter((s) => s.quomodo === quomodo && probability(s) > 0)
    const must = candidates.filter((s) => probability(s) >= 100)
    const pick = pickWeighted(candidates.filter((s) => probability(s) < 100))
    if (!pick && must.length === 0) return false
    const fv = skillEvent(self, target, 14)
    const damage = getDamage(self)
    const size = events.length
    const used = must.some(
      (s) => useSkill(self, target, s, damage, timer, fv, true) === SKILL_SUCCESS,
    )
    if (!used && (!pick || useSkill(self, target, pick, damage, timer, fv, true) !== SKILL_SUCCESS))
      return false
    if (quomodo >= AFTER_HIT) events.splice(size, 0, fv)
    else events.push(fv)
    if (quomodo !== ON_DEATH) checkDeaths(self, target, timer)
    return true
  }

  function die(self: Fighter, target: Fighter, timer: number) {
    trigger(self, target, ON_DEATH, timer)
  }

  function counter(self: Fighter, target: Fighter, timer: number) {
    checkDeaths(self, target, timer)
    if (isBreak(self, target) || randInt(1, 100) > self.counter) return
    const fv = skillEvent(self, target, 7)
    const damage = getDamage(self)
    events.push(fv)
    useSkill(self, target, NORMAL_ATTACK, damage, timer, fv, false)
    checkDeaths(self, target, timer)
  }

  function priorityStrike(defender: Fighter, actor: Fighter, timer: number) {
    if (defender.canMove <= 0 || defender.canUseSkill <= 0) return false
    if (randInt(1, 100) + actor.priority > defender.priority) return false
    const fv = skillEvent(defender, actor, 5)
    const size = events.length
    if (useSkill(defender, actor, NORMAL_ATTACK, getDamage(defender), timer, fv, false) === 0) {
      events.splice(size, 0, fv)
    }
    checkDeaths(defender, actor, timer)
    return true
  }

  function beginFight(self: Fighter, target: Fighter) {
    for (const skill of self.triggerSkills.filter((s) => s.quomodo === FIGHT_BEGIN)) {
      const fv = skillEvent(self, target, 14)
      const damage = getDamage(self)
      if (useSkill(self, target, skill, damage, 0, fv, true) === SKILL_SUCCESS) events.push(fv)
      if (isBreak(self, target)) return false
    }
    return true
  }

  /** SkillSystem.FindAttackSkill: must-skills and the weighted pick, minus what the flags forbid. */
  function findAttackSkill(self: Fighter) {
    if (self.canMove <= 0) return { must: [], pick: null }
    if (self.canUseSkill <= 0 || self.attackSkills.length === 0) {
      return { must: [], pick: NORMAL_ATTACK }
    }
    const usable = self.attackSkills.filter((s) => self.canAttack > 0 || s.quomodo !== 2)
    return {
      must: usable.filter((s) => probability(s) >= 100),
      pick: pickWeighted(usable.filter((s) => probability(s) < 100)) ?? NORMAL_ATTACK,
    }
  }

  function attackSkill(self: Fighter, target: Fighter, timer: number) {
    const { must, pick } = findAttackSkill(self)
    let skill = pick
    // Without CanAttack the normal attack is not allowed (FightSystem.UserAttackSkill).
    if (skill === NORMAL_ATTACK && self.canAttack <= 0) skill = null
    if (!skill && must.length === 0) return
    const fv = skillEvent(self, target, 14)
    const damage = getDamage(self)
    const size = events.length
    let used = must.some(
      (s) => useSkill(self, target, s, damage, timer, fv, true) === SKILL_SUCCESS,
    )
    if (!used) {
      if (!skill) return
      used = useSkill(self, target, skill, damage, timer, fv, true) === SKILL_SUCCESS
      // The fallback skips the CanAttack check, like the original.
      if (!used && skill !== NORMAL_ATTACK) {
        skill = NORMAL_ATTACK
        used = useSkill(self, target, skill, damage, timer, fv, true) === SKILL_SUCCESS
        if (!used) return
      }
    }
    if (used) events.splice(size, 0, fv)
    checkDeaths(self, target, timer)
    // The original checks the weighted pick here even when a must-skill was used.
    if (isBreak(self, target) || !skill || skill.effect !== 1 || fv.hit === false) return
    if (skill.quomodo === 2) trigger(self, target, AFTER_HIT, timer)
    if (isBreak(self, target)) return
    trigger(self, target, AFTER_HIT_PET, timer)
    if (isBreak(self, target)) return
    if (skill.quomodo === 2) trigger(target, self, AFTER_BEING_HIT, timer)
  }

  /** AttackTarget: one action. Returns false when the duel is over. */
  function act(self: Fighter, target: Fighter, timer: number) {
    if (!activateBuffs(self, timer)) return false
    if (self.canMove <= 0) {
      events.push({ actor: self.index, event: 3 })
      return true
    }
    events.push({ actor: self.index, event: 1 })
    if (!priorityStrike(target, self, timer)) {
      trigger(target, self, BEFORE_ATTACKED, timer)
      if (isBreak(self, target)) return false
      trigger(self, target, BEFORE_ATTACK, timer)
      if (isBreak(self, target)) return false
      attackSkill(self, target, timer)
    }
    if (isBreak(self, target)) return false
    events.push({ actor: self.index, event: 2 })
    return true
  }

  function duel(self: Fighter, target: Fighter) {
    self.opponent = target
    target.opponent = self
    self.next = self.atkTime
    target.next = target.atkTime
    if (!beginFight(self, target) || !beginFight(target, self)) return
    let selfTurn = false
    let targetTurn = false
    let time = Math.min(self.atkTime, target.atkTime)
    for (let bout = 0; bout < MAX_BOUT; bout++) {
      selfTurn ||= time === self.next
      targetTurn ||= time === target.next
      if (selfTurn && targetTurn) {
        if (randInt(0, 100) >= randInt(0, 100)) selfTurn = false
        else targetTurn = false
      }
      let ongoing: boolean
      if (selfTurn) {
        ongoing = act(self, target, time)
        self.next += self.atkTime
        selfTurn = false
      } else {
        ongoing = act(target, self, time)
        target.next += target.atkTime
        targetTurn = false
      }
      time = Math.min(self.next, target.next)
      if (!ongoing) return
    }
  }

  const ctx: FightContext = {
    randInt,
    getDamage,
    attack: (self, target, damage, fv, timer, selfDamage = 0) =>
      attack(self, target, Math.trunc(damage), Math.trunc(selfDamage), fv, timer),
    damage: (victim, amount) => damageHp(victim, Math.trunc(amount), 0),
    damageWithValue: (victim, amount, fv, timer) => {
      damageHp(victim, Math.trunc(amount), timer)
      clearTypeBuff(victim, fv, 1, timer)
    },
    addBuff,
    removeBuff,
    getBuff: (target, buffId) => target.buffs?.find((b) => b.id === buffId),
    changeNextAtkTime: (target, amount) => {
      if (Math.trunc(amount) > 0) target.next += Math.trunc(amount)
    },
    changeAtkTime: (target, atkTimeMul) => {
      const atkTime = Math.trunc(f(f(target.initAtkTime * 100) / (100 + atkTimeMul)))
      if (atkTime <= 0) return
      target.atkTime = atkTime
      target.atkTimeMul = atkTimeMul
    },
    changeDodge: (target, dodgeMulAdd) => {
      target.dodgeMulAdd = dodgeMulAdd
      target.dodge = Math.trunc(target.initDodge * 100 * 0.01) + dodgeMulAdd
    },
    changeAtk: (target, minAtkMul, maxAtkMul) => {
      const min = Math.trunc(target.initMinAttack * (100 + minAtkMul) * 0.01)
      const max = Math.trunc(target.initMaxAttack * (100 + maxAtkMul) * 0.01)
      if (min < 0 || max < 0) return
      target.minAttack = min
      target.maxAttack = max
      target.minAtkMul = minAtkMul
      target.maxAtkMul = maxAtkMul
    },
    changeHit: (target, hitMulAdd) => {
      target.hitMulAdd = hitMulAdd
      target.hit = Math.trunc(target.initHit * 100 * 0.01) + hitMulAdd
    },
    changeSkill,
    normalAttack,
  }

  let a = 0
  let d = 0
  while (a < left.length && d < right.length) {
    const self = left[a]!
    const target = right[d]!
    clearAllBuffs(self)
    clearAllBuffs(target)
    duel(self, target)
    if (self.hp > 0 && target.hp > 0) {
      // Timeout: the lower HP percentage loses; a tie kills the target (original behaviour).
      const percent = (x: Fighter) => Math.trunc((x.hp * 100) / x.maxHp) * 100
      if (percent(self) < percent(target)) self.hp = 0
      else target.hp = 0
    }
    if (target.hp <= 0) {
      events.push({ actor: target.index, event: 20 })
      d++
      if (d < right.length) events.push({ actor: right[d]!.index, event: 21 })
    }
    if (d < right.length && self.hp <= 0) {
      events.push({ actor: self.index, event: 20 })
      a++
      if (a < left.length) events.push({ actor: left[a]!.index, event: 21 })
    }
  }

  return {
    seed,
    fighters: [...left, ...right].map((x) => ({
      index: x.index,
      side: x.side,
      name: x.name,
      level: x.level,
      maxHp: x.maxHp,
      startHp: x.startHp,
      hp: x.hp,
      maxMp: x.maxMp,
      startMp: x.startMp,
      mp: x.mp,
    })),
    events,
    winner: a >= left.length ? 'defenders' : 'attackers',
  }
}
