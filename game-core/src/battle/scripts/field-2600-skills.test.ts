import { describe, expect, it } from 'vitest'
import { BUFFS } from '../buffs.js'
import { simulateFight, type FighterInput, type SkillInput } from '../fight.js'
import { SKILL_SCRIPTS } from '../skills.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_LOSE, SKILL_SUCCESS, type ActiveBuff, type FightEvent } from '../types.js'
import { FIELD_2600_SKILLS } from './field-2600-skills.js'

const devourSelf = FIELD_2600_SKILLS['skill/skill_tunchi_40018.js']!
const devour = FIELD_2600_SKILLS['skill/skill_tunchi_40019.js']!
const peck = FIELD_2600_SKILLS['skill/skill_zhuoshi_40021.js']!
const drain = FIELD_2600_SKILLS['skill/skill_xixue_40022.js']!
const pollen = FIELD_2600_SKILLS['skill/skill_huafen_40025.js']!
const bind = FIELD_2600_SKILLS['skill/skill_chanrao_40026.js']!
const lash = FIELD_2600_SKILLS['skill/skill_fanyao_40030.js']!

const player = (overrides = {}) => makeFighter({ index: 0, ...overrides })
const monster = (overrides = {}) => makeFighter({ index: 1, side: 'defenders', ...overrides })
const event = (): FightEvent => ({ actor: 1, event: 14, target: 0 })
const buff = (id: number, saveData = 0): ActiveBuff => ({
  id,
  saveData,
  lifeTime: -1,
  startTime: 0,
})

describe('40018 Devour (skill_tunchi_40018.js)', () => {
  it('removes a random buff of its own for InitMaxMP * 0.15', () => {
    const { ctx, calls } = fakeContext({ rolls: [1] })
    const self = monster({ mp: 30, maxMp: 30, buffs: [buff(8888), buff(11811)] })
    const fv = event()
    expect(devourSelf(ctx, self, player(), fv, 0)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['removeBuff', 1, 11811]])
    // 30 - 4.5 = 25.5 -> 25; DecMP 4.5 -> 4
    expect(self.mp).toBe(25)
    expect(fv.decMp).toBe(4)
  })

  it('attacks normally without buffs or without mana', () => {
    const noBuffs = fakeContext()
    devourSelf(noBuffs.ctx, monster(), player(), event(), 0)
    expect(noBuffs.calls).toEqual([['normalAttack']])

    const noMana = fakeContext({ rolls: [0] })
    const self = monster({ mp: 4, maxMp: 30, buffs: [buff(8888)] })
    devourSelf(noMana.ctx, self, player(), event(), 0)
    expect(noMana.calls).toEqual([['normalAttack']])
    expect(self.mp).toBe(4)
  })
})

describe('40019 Devour (skill_tunchi_40019.js, also 60004)', () => {
  // Level 30: (200 + 20 * 29 * (1 + (20 + 29 + 11 * 8 + (2 * 7 + 14) / 3 * 8) / 12 * 0.01)) / 30
  // = 29.41 -> 29.
  it('removes a random overlying-0 buff of the target for a level-based MP cost', () => {
    const { ctx, calls } = fakeContext({ rolls: [0] })
    const self = monster({ level: 30, mp: 100 })
    const fv = event()
    expect(devour(ctx, self, player({ buffs: [buff(11817)] }), fv, 0)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['removeBuff', 0, 11817]])
    expect(self.mp).toBe(71)
    expect(fv.decMp).toBe(29)
  })

  it('costs twice as much under Vessel Destroy (11839)', () => {
    const { ctx } = fakeContext({ rolls: [0] })
    const self = monster({ level: 30, mp: 100, buffs: [buff(11839)] })
    devour(ctx, self, player({ buffs: [buff(11817)] }), event(), 0)
    expect(self.mp).toBe(42)
  })

  it('fails on overlying buffs, buff 8888, no buffs or too little mana', () => {
    const cases = [
      { mp: 100, buffs: [buff(11811)] },
      { mp: 100, buffs: [] },
      { mp: 28, buffs: [buff(11817)] },
    ]
    for (const { mp, buffs } of cases) {
      const { ctx, calls } = fakeContext({ rolls: [0] })
      const self = monster({ level: 30, mp })
      expect(devour(ctx, self, player({ buffs }), event(), 0)).toBe(SKILL_LOSE)
      expect(calls).toEqual([])
      expect(self.mp).toBe(mp)
    }
  })
})

describe('40021 Peck (skill_zhuoshi_40021.js)', () => {
  it('hits for damage * 1.2 and bleeds with SaveData MaxMP * AtkTime / 8000', () => {
    const { ctx, calls } = fakeContext({ damage: 9 })
    const self = monster({ mp: 100, maxMp: 100 })
    const fv = event()
    expect(peck(ctx, self, player({ atkTime: 900 }), fv, 0)).toBe(SKILL_SUCCESS)
    // 100 * 900 / 8000 = 11.25 -> 11
    expect(calls).toEqual([
      ['attack', 10],
      ['addBuff', 0, 11838, 11],
    ])
    expect(self.mp).toBe(85)
  })

  it('does not bleed on a miss and attacks normally without mana', () => {
    const miss = fakeContext({ miss: true })
    peck(miss.ctx, monster(), player(), event(), 0)
    expect(miss.calls).toEqual([['attack', 12]])

    const noMana = fakeContext()
    peck(noMana.ctx, monster({ mp: 14 }), player(), event(), 0)
    expect(noMana.calls).toEqual([['normalAttack']])
  })
})

describe('40022 Drain (skill_xixue_40022.js)', () => {
  it('strikes with VampiricHP + 50 for InitMaxMP * 0.12', () => {
    const { ctx, calls } = fakeContext({ damage: 9 })
    const self = monster({ vampiricHp: 5 })
    let during = 0
    ctx.attack = (_s, _t, amount, fv) => {
      during = self.vampiricHp
      calls.push(['attack', amount])
      fv.hit = true
    }
    const fv = event()
    expect(drain(ctx, self, player(), fv, 0)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['attack', 9]])
    expect(during).toBe(55)
    expect(self.vampiricHp).toBe(5)
    expect(fv.decMp).toBe(12)
  })

  it('poisons itself when it drains a poisoned target (original quirk)', () => {
    const { ctx, calls } = fakeContext({ damage: 9 })
    drain(ctx, monster(), player({ buffs: [buff(11811)] }), event(), 0)
    expect(calls).toEqual([
      ['attack', 9],
      ['addBuff', 1, 11811, 0],
    ])
  })
})

describe('40025 Pollen (skill_huafen_40025.js)', () => {
  it('hits for damage * 1.2 and dazes (11826) on a hit', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    expect(pollen(ctx, monster(), player(), event(), 0)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 12],
      ['addBuff', 0, 11826, 0],
    ])
  })
})

describe('40026 Bind (skill_chanrao_40026.js)', () => {
  it('binds the target (11837, SaveData 2) for InitMaxMP * 0.23 without attacking', () => {
    const { ctx, calls } = fakeContext()
    const self = monster()
    const fv = event()
    expect(bind(ctx, self, player(), fv, 0)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 11837, 2]])
    expect(self.mp).toBe(77)
    expect(fv.decMp).toBe(23)
  })

  it('attacks normally when it is bound itself (the original checks self) or lacks mana', () => {
    const bound = fakeContext()
    bind(bound.ctx, monster({ buffs: [buff(11837)] }), player(), event(), 0)
    expect(bound.calls).toEqual([['normalAttack']])

    const targetBound = fakeContext()
    bind(targetBound.ctx, monster(), player({ buffs: [buff(11837)] }), event(), 0)
    expect(targetBound.calls).toEqual([['addBuff', 0, 11837, 2]])

    const noMana = fakeContext()
    bind(noMana.ctx, monster({ mp: 22 }), player(), event(), 0)
    expect(noMana.calls).toEqual([['normalAttack']])
  })
})

describe('40030 Lash (skill_fanyao_40030.js, after hit)', () => {
  it('strikes for InitMaxMP * 0.11 * 1.2 and pays InitMaxMP * 0.11', () => {
    const { ctx, calls } = fakeContext()
    const self = monster({ mp: 50, maxMp: 50 })
    const fv = event()
    expect(lash(ctx, self, player(), fv, 0)).toBe(SKILL_SUCCESS)
    // 5.5 * 1.2 = 6.6 -> 6; 50 - 5.5 = 44.5 -> 44
    expect(calls).toEqual([['attack', 6]])
    expect(self.mp).toBe(44)
    expect(fv.decMp).toBe(5)
  })

  it('fails without mana', () => {
    const { ctx, calls } = fakeContext()
    expect(lash(ctx, monster({ mp: 5, maxMp: 50 }), player(), event(), 0)).toBe(SKILL_LOSE)
    expect(calls).toEqual([])
  })
})

describe('field 2600 buffs', () => {
  it('11837 bind: no action, Dodge -99, Counter -999, 5 % MaxHP per tick', () => {
    const { ctx, calls } = fakeContext()
    const self = player({ maxHp: 230, counter: 10 })
    const b = buff(11837, 2)
    const fv: FightEvent = { actor: 0, event: 9 }
    BUFFS[11837]!.onAdd!(ctx, self, b, fv, 0)
    expect(b.lifeTime).toBe(2)
    expect(self).toMatchObject({ canMove: 0, counter: -989 })
    BUFFS[11837]!.onActivation!(ctx, self, b, fv, 0)
    expect(fv.selfDamage).toBe(11)
    BUFFS[11837]!.onRemove!(ctx, self, b, fv, 0)
    expect(self).toMatchObject({ canMove: 1, counter: 10 })
    expect(calls).toEqual([
      ['changeDodge', 0, -99],
      ['damage', 0, 11],
      ['changeDodge', 0, 99],
    ])
  })

  it('11838 bleed: lasts SaveData, 10 % of current HP per tick', () => {
    const { ctx, calls } = fakeContext()
    const b = buff(11838, 40)
    const fv: FightEvent = { actor: 0, event: 9 }
    BUFFS[11838]!.onAdd!(ctx, player(), b, fv, 0)
    expect(b.lifeTime).toBe(40)
    BUFFS[11838]!.onActivation!(ctx, player({ hp: 57 }), b, fv, 0)
    expect(calls).toEqual([['damage', 0, 5]])
    expect(fv.selfDamage).toBe(5)
  })

  it('registers every script with skills.ts', () => {
    for (const [path, script] of Object.entries(FIELD_2600_SKILLS)) {
      expect(SKILL_SCRIPTS[path]).toBe(script)
    }
  })
})

describe('field 2600 skills in a fight', () => {
  const base: FighterInput = { ...makeFighter(), hp: 1000, maxHp: 1000, minAttack: 1, maxAttack: 1 }
  const must = (id: number, script: string): SkillInput => ({
    id,
    type: 1,
    effect: 1,
    probability: 100,
    javascript: `skill/${script}_${id}.js`,
  })

  it('a bound player loses 5 % MaxHP at its next action, then the bind expires', () => {
    const replay = simulateFight({
      attackers: [{ ...base, atkTime: 1100 }],
      defenders: [{ ...base, skills: [must(40026, 'skill_chanrao')] }],
      seed: 2,
    })
    const tick = replay.events.find((e) => e.event === 9 && e.skillId === 11837)
    expect(tick).toMatchObject({
      actor: 0,
      selfDamage: 50,
      delBuffs: [{ role: 0, buff: 11837 }],
    })
  })
})
