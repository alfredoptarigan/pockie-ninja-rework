// Test helpers: a fighter in its fight state and a scripted FightContext that records calls.
import type { FightContext, Fighter, FighterInput, FightEvent } from './types.js'

export function makeFighter(overrides: Partial<Fighter> = {}): Fighter {
  const input: FighterInput = {
    name: 'Ninja',
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 100,
    maxMp: 100,
    minAttack: 10,
    maxAttack: 10,
    atkTime: 1000,
    hit: 0,
    dodge: 0,
    crit: 0,
    critAttach: 230,
    tough: 0,
    parry: 0,
    pierce: 0,
    defense: 0,
    neglectDefense: 0,
    counter: 0,
    priority: 0,
  }
  return {
    ...input,
    skillAdd: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    decDamage: 0,
    rebound: 0,
    absorb: 0,
    vampiricHp: 0,
    vampiricMp: 0,
    index: 0,
    side: 'attackers',
    startHp: input.hp,
    startMp: input.mp,
    initAtkTime: input.atkTime,
    atkTimeMul: 0,
    atkTimeAdd: 0,
    initDefense: input.defense,
    defenseMul: 0,
    defenseAdd: 0,
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
    attackSkills: [],
    triggerSkills: [],
    opponent: null,
    ...overrides,
  }
}

/** `rolls` are returned by randInt in order; `damage` by getDamage; attacks hit unless `miss`. */
export function fakeContext({
  rolls = [],
  damage = 10,
  miss = false,
}: { rolls?: number[]; damage?: number; miss?: boolean } = {}) {
  const calls: unknown[][] = []
  const queue = [...rolls]
  const ctx: FightContext = {
    randInt: () => {
      const r = queue.shift()
      if (r === undefined) throw new Error('unexpected randInt')
      return r
    },
    getDamage: () => damage,
    attack: (_self, _target, amount, fv: FightEvent) => {
      calls.push(['attack', Math.trunc(amount)])
      fv.hit = !miss
    },
    damage: (victim, amount) => calls.push(['damage', victim.index, Math.trunc(amount)]),
    damageWithValue: (victim, amount) => calls.push(['damage', victim.index, Math.trunc(amount)]),
    addBuff: (target, buffId, _timer, _fv, saveData = 0, saveData1 = 0) =>
      calls.push([
        'addBuff',
        target.index,
        buffId,
        Math.trunc(saveData),
        ...(saveData1 ? [Math.trunc(saveData1)] : []),
      ]),
    removeBuff: (target, buffId) => calls.push(['removeBuff', target.index, buffId]),
    getBuff: (target, buffId) => target.buffs?.find((b) => b.id === buffId),
    changeNextAtkTime: (target, amount) =>
      calls.push(['changeNextAtkTime', target.index, Math.trunc(amount)]),
    changeHit: (target, add) => calls.push(['changeHit', target.index, add]),
    changeAtkTime: (target, mul, add) => calls.push(['changeAtkTime', target.index, mul, add]),
    changeDefense: (target, add, mul) =>
      calls.push(['changeDefense', target.index, add, ...(mul === undefined ? [] : [mul])]),
    changeDodge: (target, add) => calls.push(['changeDodge', target.index, add]),
    changeAtk: (target, min, max) => calls.push(['changeAtk', target.index, min, max]),
    changeSkill: (_self, _target, skill) => {
      calls.push(['changeSkill', skill.id])
      return 0
    },
    normalAttack: () => {
      calls.push(['normalAttack'])
      return 0
    },
  }
  return { ctx, calls }
}
