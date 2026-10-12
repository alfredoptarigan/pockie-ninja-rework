// Fight simulation ported from FightSystem.java (docs/original-data/battle.md): sequential 1v1
// duels, an AtkTime timeline with at most 60 actions per duel, priority strikes, hit / crit /
// parry / defence, counters, and the generic parry skill 7777.
// ponytail: scripted skills (javascript in skill.ini) are not ported yet, so every fighter uses the
// normal attack (skill 1), exactly what the original does when a skill fails. Port per skill.
import { createRandom } from '../random.js'
import { applyCrit, applyDefense, applyParry, hitChance } from './damage.js'

export interface FighterInput {
  name: string
  level: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  minAttack: number
  maxAttack: number
  atkTime: number
  hit: number
  dodge: number
  /** CritMul */
  crit: number
  critAttach: number
  tough: number
  /** ParryMul: chance source of the generic parry skill 7777 */
  parry: number
  pierce: number
  defense: number
  neglectDefense: number
  /** CounterMul: percent chance to strike back after being hit */
  counter: number
  /** PriorityMul: chance to strike first when attacked */
  priority: number
}

export type Side = 'attackers' | 'defenders'

/** Event ids follow the original replay: 1 begin, 2 end, 5 priority, 7 counter, 14 skill, 20 death, 21 next. */
export interface FightEvent {
  actor: number
  event: number
  target?: number
  skillId?: number
  damage?: number
  hit?: boolean
  crit?: boolean
  parry?: boolean
}

export interface Replay {
  seed: number
  fighters: {
    index: number
    side: Side
    name: string
    level: number
    maxHp: number
    startHp: number
    hp: number
  }[]
  events: FightEvent[]
  winner: Side
}

interface State extends FighterInput {
  index: number
  side: Side
  startHp: number
  next: number
  parryActive: boolean
}

const MAX_BOUT = 60
const NORMAL_ATTACK = 1
const PARRY_PERCENT = 40
const PARRY_DELAY = 0.6

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

  const toState =
    (side: Side, offset: number) =>
    (input: FighterInput, i: number): State => ({
      ...input,
      // FightObject.Set rescales Tough.
      tough: Math.ceil(input.tough / 1.5),
      index: offset + i,
      side,
      startHp: input.hp,
      next: 0,
      parryActive: false,
    })
  const left = attackers.map(toState('attackers', 0))
  const right = defenders.map(toState('defenders', attackers.length))

  function strike(attacker: State, defender: State, event: number, canCounter: boolean) {
    const base: FightEvent = {
      actor: attacker.index,
      event,
      target: defender.index,
      skillId: NORMAL_ATTACK,
    }
    let damage =
      attacker.maxAttack <= attacker.minAttack
        ? attacker.maxAttack
        : randInt(attacker.minAttack, attacker.maxAttack)
    if (defender.hp <= 0 || damage === 0) {
      events.push({ ...base, damage: 0 })
      return
    }
    if (randInt(1, 100) > hitChance(defender.dodge, attacker.hit)) {
      events.push({ ...base, hit: false })
      return
    }

    const c = attacker.crit - defender.tough
    const crit = c > 0 && randInt(1, 100) <= Math.trunc(c / 16)
    if (crit) damage = applyCrit(damage, attacker.critAttach, c)
    const parried = defender.parryActive
    if (parried) {
      // Buff 11841: parry 40%, consumed by this hit, and the attacker is slowed down.
      damage = applyParry(damage, PARRY_PERCENT)
      defender.parryActive = false
      attacker.next += Math.trunc(attacker.atkTime * PARRY_DELAY)
    }
    damage = applyDefense(damage, defender.defense, attacker.neglectDefense)
    defender.hp = Math.max(0, defender.hp - damage)
    events.push({
      ...base,
      damage,
      hit: true,
      ...(crit ? { crit } : {}),
      ...(parried ? { parry: true } : {}),
    })

    // Skill 7777 (on being damaged): may prepare a parry for the next hit.
    if (damage > 0 && defender.hp > 0 && attacker.hp > 0 && !defender.parryActive) {
      const chance = Math.fround((defender.parry - attacker.pierce) / 16)
      if (randInt(0, 99) < chance) defender.parryActive = true
    }
    if (canCounter && defender.hp > 0 && attacker.hp > 0 && randInt(1, 100) <= defender.counter) {
      strike(defender, attacker, 7, false)
    }
  }

  function act(actor: State, target: State) {
    events.push({ actor: actor.index, event: 1 })
    if (randInt(1, 100) + actor.priority <= target.priority) {
      strike(target, actor, 5, false)
    } else {
      strike(actor, target, 14, true)
    }
    events.push({ actor: actor.index, event: 2 })
    return actor.hp > 0 && target.hp > 0
  }

  function duel(self: State, target: State) {
    for (const fighter of [self, target]) {
      fighter.next = fighter.atkTime
      fighter.parryActive = false
    }
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
        ongoing = act(self, target)
        self.next += self.atkTime
        selfTurn = false
      } else {
        ongoing = act(target, self)
        target.next += target.atkTime
        targetTurn = false
      }
      time = Math.min(self.next, target.next)
      if (!ongoing) return
    }
    // Timeout: the lower HP percentage loses; a tie kills the target (original behaviour).
    const percent = (f: State) => Math.trunc((f.hp * 100) / f.maxHp) * 100
    if (percent(self) < percent(target)) self.hp = 0
    else target.hp = 0
  }

  let a = 0
  let d = 0
  while (a < left.length && d < right.length) {
    const self = left[a]!
    const target = right[d]!
    duel(self, target)
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
    fighters: [...left, ...right].map((f) => ({
      index: f.index,
      side: f.side,
      name: f.name,
      level: f.level,
      maxHp: f.maxHp,
      startHp: f.startHp,
      hp: f.hp,
    })),
    events,
    winner: a >= left.length ? 'defenders' : 'attackers',
  }
}
