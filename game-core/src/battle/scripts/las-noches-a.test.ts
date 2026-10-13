/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { BUFFS } from '../buffs.js'
import { simulateFight, type FighterInput, type SkillInput } from '../fight.js'
import { SKILL_SCRIPTS } from '../skills.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_SUCCESS, type ActiveBuff, type FightContext, type FightEvent } from '../types.js'
import { LAS_NOCHES_A_SKILLS, LAS_NOCHES_ROWS } from './las-noches-a.js'

const poisonMist = LAS_NOCHES_A_SKILLS['skill/skill_duwu_5.js']!
const darkness = LAS_NOCHES_A_SKILLS['skill/skill_heianxingzhishu_6.js']!
const needles = LAS_NOCHES_A_SKILLS['skill/skill_zhenci_7.js']!
const bigRasengan = LAS_NOCHES_A_SKILLS['skill/skill_dayuluoxuanwan_8.js']!

const buff = (id: number, saveData = 0, saveData1 = 0): ActiveBuff => ({
  id,
  saveData,
  saveData1,
  lifeTime: -1,
  startTime: 0,
})
const boss = (overrides = {}) =>
  makeFighter({ index: 1, side: 'defenders', level: 1, mp: 1000, ...overrides })
const player = (overrides = {}) => makeFighter({ index: 0, buffs: [buff(8888)], ...overrides })
const event = (): FightEvent => ({ actor: 1, event: 14, target: 0 })
const level1: SkillInput = { id: 5, type: 1, level: 1 }

describe('skill rows the scripts change to (SkillSystem.FindSkill)', () => {
  const skills = JSON.parse(
    readFileSync(new URL('../../../../server/data/game/skills.json', import.meta.url), 'utf8'),
  ) as Record<string, Omit<SkillInput, 'id'>>

  it.each(Object.values(LAS_NOCHES_ROWS).map((row) => [row.id, row]))(
    'row %i matches skills.json',
    (id, row) => {
      expect({ id, ...skills[id] }).toMatchObject(row)
    },
  )
})

describe('5 Poison Mist (skill_duwu_5.js)', () => {
  it('once per duel: damage x1 for 4x the base MP, then 11885 for 10000 units, -50 % defence', () => {
    // Arrange
    const { ctx, calls } = fakeContext({ damage: 37 })
    const self = boss()
    const immunity = buff(8888, 0, 3)
    const target = player({ buffs: [immunity] })
    const fv = event()

    // Act
    const result = poisonMist(ctx, self, target, fv, 0, level1)

    // Assert: ToInt(200 / 30 * 4) = 26
    expect(result).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 37],
      ['addBuff', 0, 11885, 10000, 50],
    ])
    expect(immunity.saveData1).toBe(10003)
    expect(self.mp).toBe(974)
    expect(fv.decMp).toBe(26)
  })

  it('replaces an old mist, halves the time on a cursed target and doubles the cost', () => {
    // Arrange
    const { ctx, calls } = fakeContext()
    const self = boss({ buffs: [buff(11839), buff(11836)] })
    const target = player({ buffs: [buff(8888), buff(11885), buff(11823)] })
    const fv = event()

    // Act
    poisonMist(ctx, self, target, fv, 0, level1)

    // Assert
    expect(calls).toEqual([
      ['attack', 10],
      ['removeBuff', 1, 11836],
      ['removeBuff', 0, 11885],
      ['addBuff', 0, 11885, 5000, 50],
    ])
    expect(fv.decMp).toBe(52)
  })

  it('counts the use but adds no mist on a miss or a substitute; death seal deals 30 %', () => {
    // Arrange
    const missed = fakeContext({ miss: true })
    const substituted = fakeContext({ damage: 100 })
    const immunity = buff(8888)

    // Act
    poisonMist(missed.ctx, boss(), player({ buffs: [immunity] }), event(), 0, level1)
    poisonMist(
      substituted.ctx,
      boss({ buffs: [buff(11808)] }),
      player({ buffs: [buff(8888), buff(11840)] }),
      event(),
      0,
      level1,
    )

    // Assert
    expect(missed.calls).toEqual([['attack', 10]])
    expect(immunity.saveData1).toBe(10000)
    expect(substituted.calls).toEqual([['attack', 30]])
  })

  it.each([
    ['no 8888 on the target', player({ buffs: null }), boss()],
    ['already used this duel', player({ buffs: [buff(8888, 0, 10000)] }), boss()],
    ['not enough MP', player(), boss({ mp: 25 })],
  ])('%s: 33 % Fireball, 30 % Darkness, else the normal attack', (_name, target, self) => {
    for (const [roll, expected] of [
      [32, ['changeSkill', 1808]],
      [33, ['changeSkill', 6]],
      [62, ['changeSkill', 6]],
      [63, ['normalAttack']],
    ] as const) {
      const { ctx, calls } = fakeContext({ rolls: [roll] })
      poisonMist(ctx, self, target, event(), 0, level1)
      expect(calls).toEqual([expected])
    }
  })
})

describe('6 Darkness (skill_heianxingzhishu_6.js)', () => {
  it('damage x1 for the base MP, then 11886 for 800 units and a delay of half the AtkTime', () => {
    // Arrange
    const { ctx, calls } = fakeContext({ damage: 21 })
    const self = boss({ buffs: [buff(11836)] })
    const fv = event()

    // Act
    const result = darkness(ctx, self, player({ atkTime: 1001 }), fv, 0, level1)

    // Assert
    expect(result).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 21],
      ['removeBuff', 1, 11836],
      ['addBuff', 0, 11886, 800],
      ['changeNextAtkTime', 0, 500],
    ])
    expect(fv.decMp).toBe(6)
    expect(self.mp).toBe(994)
  })

  it('no slow on a miss or a substitute; death seal deals 30 %', () => {
    // Arrange
    const missed = fakeContext({ miss: true })
    const substituted = fakeContext({ damage: 100 })

    // Act
    darkness(missed.ctx, boss(), player(), event(), 0, level1)
    darkness(
      substituted.ctx,
      boss({ buffs: [buff(11808)] }),
      player({ buffs: [buff(11840)] }),
      event(),
      0,
      level1,
    )

    // Assert
    expect(missed.calls).toEqual([['attack', 10]])
    expect(substituted.calls).toEqual([['attack', 30]])
  })

  it.each([
    ['the target is already slowed', player({ buffs: [buff(11886)] }), boss()],
    ['not enough MP (doubled by Vessel Destroy)', player(), boss({ mp: 11, buffs: [buff(11839)] })],
  ])('%s: 33 % Fireball, else the normal attack', (_name, target, self) => {
    for (const [roll, expected] of [
      [32, ['changeSkill', 1808]],
      [33, ['normalAttack']],
    ] as const) {
      const { ctx, calls } = fakeContext({ rolls: [roll] })
      darkness(ctx, self, target, event(), 0, level1)
      expect(calls).toEqual([expected])
    }
  })
})

describe('7 Needles (skill_zhenci_7.js)', () => {
  it.each([
    [500, 10, 43],
    [1000, 100, 347],
    [2000, 100, 142],
    [0, 10, 76],
  ])('against defence %i turns damage %i into %i for 100 MP', (defense, damage, dealt) => {
    // Arrange
    const { ctx, calls } = fakeContext({ damage })
    const self = boss()
    const fv = event()

    // Act
    const result = needles(ctx, self, player({ defense }), fv, 0, level1)

    // Assert
    expect(result).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['attack', dealt]])
    expect(self.mp).toBe(900)
    expect(fv.decMp).toBe(100)
  })

  it('breaks an earth wall first, drops its own drain, death seal deals 30 %', () => {
    // Arrange
    const { ctx, calls } = fakeContext({ damage: 100 })

    // Act
    needles(
      ctx,
      boss({ buffs: [buff(11808), buff(11836)] }),
      player({ defense: 2000, buffs: [buff(11824)] }),
      event(),
      0,
      level1,
    )

    // Assert: 142.48 * 0.3
    expect(calls).toEqual([
      ['removeBuff', 0, 11824],
      ['attack', 42],
      ['removeBuff', 1, 11836],
    ])
  })

  it('falls back to the normal attack below 100 MP (200 with Vessel Destroy)', () => {
    // Arrange
    const poor = fakeContext()
    const destroyed = fakeContext()

    // Act
    needles(poor.ctx, boss({ mp: 99 }), player(), event(), 0, level1)
    needles(destroyed.ctx, boss({ mp: 199, buffs: [buff(11839)] }), player(), event(), 0, level1)

    // Assert
    expect(poor.calls).toEqual([['normalAttack']])
    expect(destroyed.calls).toEqual([['normalAttack']])
  })
})

describe('8 Big Rasengan (skill_dayuluoxuanwan_8.js)', () => {
  /** fakeContext's attack does not record the self damage. */
  function withSelfDamage(ctx: FightContext, calls: unknown[][]): FightContext {
    return {
      ...ctx,
      attack: (_self, _target, damage, fv, _timer, selfDamage = 0) => {
        calls.push(['attack', Math.trunc(damage), Math.trunc(selfDamage)])
        fv.hit = true
      },
    }
  }

  it('on a marked (11882) target: damage + 2000-3000, the caster takes 10 %', () => {
    // Arrange
    const { ctx, calls } = fakeContext({ rolls: [2345], damage: 55 })
    const self = boss()
    const fv = event()

    // Act
    const result = bigRasengan(
      withSelfDamage(ctx, calls),
      self,
      player({ buffs: [buff(11882)] }),
      fv,
      0,
      level1,
    )

    // Assert: ToInt(200 / 30 * 1.4) = 9
    expect(result).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['attack', 2400, 240]])
    expect(self.mp).toBe(991)
    expect(fv.decMp).toBe(9)
  })

  it('death seal cuts only the bonus to 30 %', () => {
    // Arrange
    const { ctx, calls } = fakeContext({ rolls: [3000], damage: 10 })

    // Act
    bigRasengan(
      withSelfDamage(ctx, calls),
      boss({ buffs: [buff(11808), buff(11836)] }),
      player({ buffs: [buff(11882)] }),
      event(),
      0,
      level1,
    )

    // Assert
    expect(calls).toEqual([
      ['attack', 910, 91],
      ['removeBuff', 1, 11836],
    ])
  })

  it.each([
    ['an unmarked target', player(), boss()],
    ['a sealed caster', player({ buffs: [buff(11882)] }), boss({ buffs: [buff(11812)] })],
    ['not enough MP', player({ buffs: [buff(11882)] }), boss({ mp: 8 })],
  ])('%s: 50 % Heavy Strike, else the normal attack', (_name, target, self) => {
    for (const [roll, expected] of [
      [49, ['changeSkill', 2]],
      [50, ['normalAttack']],
    ] as const) {
      const { ctx, calls } = fakeContext({ rolls: [roll] })
      bigRasengan(ctx, self, target, event(), 0, level1)
      expect(calls).toEqual([expected])
    }
  })
})

const active = (id: number, saveData: number, saveData1 = 0): ActiveBuff => ({
  id,
  saveData,
  saveData1,
  lifeTime: BUFFS[id]!.lifeTime,
  startTime: 0,
})
const tick = (): FightEvent => ({ actor: 0, event: 9 })

describe('11885 poison mist (buff_duwu_11885.js)', () => {
  it('lasts SaveData units: DefenseMul - SaveData1, Pierce -430, Parry -290, Tough -410', () => {
    // Arrange
    const { ctx, calls } = fakeContext()
    const self = makeFighter({ defenseAdd: 7, pierce: 500, tough: 500 })
    const mist = active(11885, 10000, 50)

    // Act
    BUFFS[11885]!.onAdd!(ctx, self, mist, tick(), 0)
    const during = { pierce: self.pierce, parry: self.parryPercent, tough: self.tough }
    BUFFS[11885]!.onRemove!(ctx, self, mist, tick(), 0)

    // Assert
    expect(mist.lifeTime).toBe(10000)
    expect(during).toEqual({ pierce: 70, parry: -290, tough: 90 })
    expect([self.pierce, self.parryPercent, self.tough]).toEqual([500, 0, 500])
    expect(calls).toEqual([
      ['changeDefense', 0, 7, -50],
      ['changeDefense', 0, 7, 50],
    ])
  })
})

describe('in a fight', () => {
  const TEST_SCRIPT = 'test/las_noches_a.js'
  afterEach(() => {
    delete SKILL_SCRIPTS[TEST_SCRIPT]
  })

  const fighter = (overrides: Partial<FighterInput> = {}): FighterInput => ({
    ...makeFighter(),
    hp: 100000,
    maxHp: 100000,
    minAttack: 1000,
    maxAttack: 1000,
    skills: [],
    ...overrides,
  })

  /** First normal-attack damage of the attacker against a defender with `defense`. */
  function firstStrike(defense: number, mist: boolean) {
    SKILL_SCRIPTS[TEST_SCRIPT] = (ctx, _self, target, fv, timer) => {
      ctx.addBuff(target, 11885, timer, fv, 99999, 50)
      return SKILL_SUCCESS
    }
    const begin: SkillInput = {
      id: 99,
      type: 2,
      quomodo: 1,
      probability: 100,
      javascript: TEST_SCRIPT,
    }
    const replay = simulateFight({
      attackers: [fighter({ skills: mist ? [begin] : [] })],
      defenders: [fighter({ defense, atkTime: 99999 })],
      seed: 1,
    })
    return replay.events.find((e) => e.actor === 0 && e.event === 14 && e.skillId === 1)?.damage
  }

  it('11885 halves the defence through ChangeDefense (DefenseMul -50)', () => {
    expect(firstStrike(800, true)).toBe(firstStrike(400, false))
    expect(firstStrike(800, true)).not.toBe(firstStrike(800, false))
  })
})
