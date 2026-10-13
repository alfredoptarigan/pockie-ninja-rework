/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUFFS } from '../buffs.js'
import { simulateFight, type FighterInput, type SkillInput } from '../fight.js'
import { SKILL_SCRIPTS } from '../skills.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_LOSE, SKILL_SUCCESS, type ActiveBuff, type FightEvent } from '../types.js'
import { LAS_NOCHES_B_SKILLS } from './las-noches-b.js'

const script = (name: string) => LAS_NOCHES_B_SKILLS[`skill/${name}.js`]!
const evilSeal = script('skill_fengxiefayin_4')
const bugTracking = script('skill_chongzhuizongshu_60001')
const spiritRage = script('skill_lingyakuangbao_60002')

const buff = (id: number, saveData = 0, saveData1 = 0): ActiveBuff => ({
  id,
  saveData,
  saveData1,
  lifeTime: -1,
  startTime: 0,
})
// Level 30 base MP cost: 29.41, so 5000 costs ToInt(29.41 * 3.1) = 91.
const self = (overrides = {}) => makeFighter({ index: 0, level: 30, buffs: [], ...overrides })
const foe = (overrides = {}) =>
  makeFighter({ index: 1, side: 'defenders', buffs: [buff(8888)], ...overrides })
const event = (): FightEvent => ({ actor: 0, event: 14, target: 1 })
const LEVEL_1: SkillInput = { id: 5000, type: 1, level: 1 }

describe('5000 Evil Sealing (skill_fengxiefayin_4.js)', () => {
  it('strikes for full damage, marks 8888 and seals the target for 18000 units', () => {
    const { ctx, calls } = fakeContext()
    const target = foe()
    const caster = self()
    const fv = event()
    expect(evilSeal(ctx, caster, target, fv, 0, LEVEL_1)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 10],
      ['addBuff', 1, 11884, 18000, 70],
    ])
    expect(target.buffs![0]!.saveData).toBe(10000)
    expect(caster.mp).toBe(9)
    expect(fv.decMp).toBe(91)
  })

  it('switches to skill 5 without the 8888 buff, once used, or without the MP', () => {
    const cases = [
      { target: foe({ buffs: [] }), caster: self() },
      { target: foe({ buffs: [buff(8888, 10000)] }), caster: self() },
      { target: foe(), caster: self({ mp: 90 }) },
      { target: foe(), caster: self({ mp: 181, buffs: [buff(11839)] }) },
    ]
    for (const { target, caster } of cases) {
      const { ctx, calls } = fakeContext()
      evilSeal(ctx, caster, target, event(), 0, LEVEL_1)
      expect(calls).toEqual([['changeSkill', 5]])
    }
  })

  it('is weakened by its own Ghost (11808), halved by Curse and drops Illusion (11836)', () => {
    const { ctx, calls } = fakeContext()
    const target = foe({ buffs: [buff(8888), buff(11823), buff(11884)] })
    const caster = self({ mp: 182, buffs: [buff(11808), buff(11836), buff(11839)] })
    evilSeal(ctx, caster, target, event(), 0, LEVEL_1)
    expect(calls).toEqual([
      ['attack', 3],
      ['removeBuff', 0, 11836],
      ['removeBuff', 1, 11884],
      ['addBuff', 1, 11884, 9000, 70],
    ])
    expect(caster.mp).toBe(0)
  })

  it('adds no seal on a miss or through a Peg (11840)', () => {
    for (const [target, miss] of [
      [foe(), true],
      [foe({ buffs: [buff(8888), buff(11840)] }), false],
    ] as const) {
      const { ctx, calls } = fakeContext({ miss })
      evilSeal(ctx, self(), target, event(), 0, LEVEL_1)
      expect(calls).toEqual([['attack', 10]])
    }
  })
})

describe('60001 Bug Tracking (skill_chongzhuizongshu_60001.js)', () => {
  it('marks the target with 11882 for 1 MP and 500 HP', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ hp: 600 })
    const fv = event()
    expect(bugTracking(ctx, caster, foe(), fv, 0)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 1, 11882, 0]])
    expect(caster).toMatchObject({ hp: 100, mp: 99 })
    expect(fv).toMatchObject({ decMp: 1, selfDamage: 500 })
  })

  it('fails when already marked or short of MP or HP', () => {
    const cases = [
      { caster: self({ hp: 600 }), target: foe({ buffs: [buff(11882)] }) },
      { caster: self({ hp: 499 }), target: foe() },
      { caster: self({ hp: 600, mp: 1, buffs: [buff(11839)] }), target: foe() },
    ]
    for (const { caster, target } of cases) {
      const { ctx, calls } = fakeContext()
      expect(bugTracking(ctx, caster, target, event(), 0)).toBe(SKILL_LOSE)
      expect(calls).toEqual([])
    }
  })
})

describe('60002 Spiritual Pressure Rage (skill_lingyakuangbao_60002.js)', () => {
  it('adds 11883 (attack +200 %, CritMul x3) once', () => {
    const { ctx, calls } = fakeContext()
    expect(spiritRage(ctx, self(), foe(), event(), 0, LEVEL_1)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 11883, 200, 3]])
    const again = fakeContext()
    expect(spiritRage(again.ctx, self({ buffs: [buff(11883)] }), foe(), event(), 0)).toBe(
      SKILL_LOSE,
    )
  })
})

describe('Las Noches buffs', () => {
  const fv: FightEvent = { actor: 0, event: 9 }

  it('11882 Bug Tracking is a scriptless marker', () => {
    expect(BUFFS[11882]).toMatchObject({ type: 2, lifeTime: 600 })
    expect(BUFFS[11882]!.onAdd).toBeUndefined()
  })

  it('11883 Spiritual Pressure Rage: attack + SaveData, CritMul x SaveData1, defence + 11352', () => {
    const { ctx, calls } = fakeContext()
    const owner = self({ crit: 100 })
    const b = buff(11883, 200, 3)
    BUFFS[11883]!.onAdd!(ctx, owner, b, fv, 0)
    expect(b.lifeTime).toBe(6000)
    expect(owner.crit).toBe(300)
    BUFFS[11883]!.onRemove!(ctx, owner, b, fv, 0)
    expect(owner.crit).toBe(100)
    expect(calls).toEqual([
      ['changeAtk', 0, 200, 200],
      ['changeDefense', 0, 11352],
      ['changeAtk', 0, -200, -200],
      ['changeDefense', 0, -11352],
    ])
  })

  it('11884 Evil Sealing: attack - SaveData1, CritMul - 270, NeglectDefAttach - 450', () => {
    const { ctx, calls } = fakeContext()
    const owner = self({ crit: 300, neglectDefense: 500 })
    const b = buff(11884, 18000, 70)
    BUFFS[11884]!.onAdd!(ctx, owner, b, fv, 0)
    expect(b.lifeTime).toBe(18000)
    expect(owner).toMatchObject({ crit: 30, neglectDefense: 50 })
    BUFFS[11884]!.onRemove!(ctx, owner, b, fv, 0)
    expect(owner).toMatchObject({ crit: 300, neglectDefense: 500 })
    expect(calls).toEqual([
      ['changeAtk', 0, -70, -70],
      ['changeAtk', 0, 70, 70],
    ])
  })

  it('11886 Dark Walk: AtkTime x2, hit - 430 and dodge - 290 for SaveData units', () => {
    const { ctx, calls } = fakeContext()
    const b = buff(11886, 3000)
    BUFFS[11886]!.onAdd!(ctx, self(), b, fv, 0)
    expect(b).toMatchObject({ lifeTime: 3000, saveData1: 50 })
    BUFFS[11886]!.onRemove!(ctx, self(), b, fv, 0)
    expect(calls).toEqual([
      ['changeAtkTime', 0, -50, 0],
      ['changeHit', 0, -430],
      ['changeDodge', 0, -290],
      ['changeAtkTime', 0, 50, 0],
      ['changeHit', 0, 430],
      ['changeDodge', 0, 290],
    ])
  })
})

describe('Las Noches skills in a fight', () => {
  const skills = JSON.parse(
    readFileSync(new URL('../../../../server/data/game/skills.json', import.meta.url), 'utf8'),
  ) as Record<string, Omit<SkillInput, 'id'>>
  const row = (id: number): SkillInput => ({ id, ...skills[id]! })
  const ids = [5000, 60001, 60002]

  it('registers every script and runs a deterministic fight using them', () => {
    for (const id of ids) expect(SKILL_SCRIPTS[row(id).javascript!]).toBeTypeOf('function')
    const fighter = (skillIds: number[]): FighterInput => ({
      name: 'x',
      level: 40,
      hp: 6000,
      maxHp: 6000,
      mp: 3000,
      maxMp: 3000,
      minAttack: 80,
      maxAttack: 100,
      atkTime: 1000,
      hit: 0,
      dodge: 0,
      crit: 0,
      critAttach: 230,
      tough: 0,
      parry: 0,
      pierce: 0,
      defense: 150,
      neglectDefense: 0,
      counter: 0,
      priority: 0,
      skills: skillIds.map(row),
    })
    const run = () =>
      simulateFight({
        attackers: [fighter([7777, 8888, ...ids])],
        defenders: [fighter([7777, 8888])],
        seed: 5,
      })
    const replay = run()
    const used = new Set(replay.events.map((e) => e.skillId))
    expect(ids.filter((id) => used.has(id))).toEqual(ids)
    const added = replay.events.flatMap((e) => e.addBuffs ?? []).map((b) => b.buff)
    expect(added).toEqual(expect.arrayContaining([11882, 11883, 11884]))
    expect(replay).toEqual(run())
  })
})
