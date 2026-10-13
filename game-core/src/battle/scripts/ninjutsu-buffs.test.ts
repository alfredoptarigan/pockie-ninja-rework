// The fight buffs the attack ninjutsu add (RES/javascript/buff/*.js).
import { afterEach, describe, expect, it } from 'vitest'
import { BUFFS } from '../buffs.js'
import { simulateFight, type FighterInput, type SkillInput } from '../fight.js'
import { SKILL_SCRIPTS } from '../skills.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_SUCCESS, type ActiveBuff, type FightEvent } from '../types.js'

const TEST_SCRIPT = 'test/add_ninjutsu_buff.js'

/** A fight-begin trigger that gives its owner `buff` with SaveData / SaveData1. */
function selfBuff(buff: number, saveData: number, saveData1 = 0): SkillInput {
  SKILL_SCRIPTS[TEST_SCRIPT] = (ctx, self, _target, fv, timer) => {
    ctx.addBuff(self, buff, timer, fv, saveData, saveData1)
    return SKILL_SUCCESS
  }
  return { id: 99, type: 2, quomodo: 1, probability: 100, javascript: TEST_SCRIPT }
}

afterEach(() => {
  delete SKILL_SCRIPTS[TEST_SCRIPT]
})

const fighter = (overrides: Partial<FighterInput> = {}): FighterInput => ({
  ...makeFighter(),
  hp: 1000,
  maxHp: 1000,
  minAttack: 0,
  maxAttack: 0,
  skills: [],
  ...overrides,
})

const active = (id: number, saveData: number, saveData1 = 0): ActiveBuff => ({
  id,
  saveData,
  saveData1,
  lifeTime: BUFFS[id]!.lifeTime,
  startTime: 0,
})
const event = (): FightEvent => ({ actor: 0, event: 9 })

describe('11804 burn (buff_ranshao_11804.js)', () => {
  it('deals SaveData on each action of its owner for SaveData1 actions, then goes out', () => {
    const replay = simulateFight({
      attackers: [fighter({ atkTime: 900 })],
      defenders: [fighter({ skills: [selfBuff(11804, 30, 2)] })],
      seed: 1,
    })
    const ticks = replay.events.filter((e) => e.actor === 1 && e.event === 9)
    expect(ticks).toEqual([
      { actor: 1, event: 9, skillId: 11804, selfDamage: 30 },
      {
        actor: 1,
        event: 9,
        skillId: 11804,
        selfDamage: 30,
        delBuffs: [{ role: 1, buff: 11804 }],
      },
    ])
  })
})

describe('11806 wine (buff_jiu_11806.js)', () => {
  it('lowers HitMul by SaveData and raises CritMul by SaveData1 until removed', () => {
    const { ctx, calls } = fakeContext()
    const self = makeFighter({ hitMulAdd: 10, crit: 50 })
    const wine = active(11806, 30, 20)
    BUFFS[11806]!.onAdd!(ctx, self, wine, event(), 0)
    expect(self.crit).toBe(70)
    BUFFS[11806]!.onRemove!(ctx, self, wine, event(), 0)
    expect(self.crit).toBe(50)
    expect(calls).toEqual([
      ['changeHit', 0, -20],
      ['changeHit', 0, 40],
    ])
  })
})

describe('11808 death seal (buff_shigui_11808.js)', () => {
  it('lasts SaveData units and cuts the attack by 70 %', () => {
    const { ctx, calls } = fakeContext()
    const self = makeFighter({ minAtkMul: 10, maxAtkMul: 10 })
    const seal = active(11808, 2500)
    BUFFS[11808]!.onAdd!(ctx, self, seal, event(), 0)
    BUFFS[11808]!.onRemove!(ctx, self, seal, event(), 0)
    expect(seal.lifeTime).toBe(2500)
    expect(calls).toEqual([
      ['changeAtk', 0, -60, -60],
      ['changeAtk', 0, 80, 80],
    ])
  })

  it('weakens the strikes of its owner in a fight (ChangeAtk from the initial attack)', () => {
    const replay = simulateFight({
      attackers: [fighter({ minAttack: 100, maxAttack: 100, skills: [selfBuff(11808, 99999)] })],
      defenders: [fighter()],
      seed: 1,
    })
    const strike = replay.events.find((e) => e.actor === 0 && e.event === 14 && e.skillId === 1)
    expect(strike?.damage).toBe(30)
  })
})

describe('11833 weakness (buff_shili_11833.js)', () => {
  it('lasts SaveData units without normal attacks or skills', () => {
    const { ctx } = fakeContext()
    const self = makeFighter()
    const weak = active(11833, 800)
    BUFFS[11833]!.onAdd!(ctx, self, weak, event(), 0)
    expect(weak.lifeTime).toBe(800)
    expect(self).toMatchObject({ canAttack: 0, canUseSkill: 0 })
    BUFFS[11833]!.onRemove!(ctx, self, weak, event(), 0)
    expect(self).toMatchObject({ canAttack: 1, canUseSkill: 1 })
  })
})
