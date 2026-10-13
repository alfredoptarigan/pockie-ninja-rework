import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput } from '../fight.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_SUCCESS, type ActiveBuff, type FightEvent } from '../types.js'
import { INSTANCE_SKILLS } from './instance-skills.js'

const heavyStrike = INSTANCE_SKILLS['skill/skill_guaiwuzhongji_2.js']!
const heavyAttack = INSTANCE_SKILLS['skill/skill_guaiwuqiangligongji_2.js']!
const luckyCat = INSTANCE_SKILLS['skill/skill_zhaocaimao_9999.js']!

const buff = (id: number): ActiveBuff => ({ id, saveData: 0, lifeTime: -1, startTime: 0 })
/** The target of an instance skill always has 8888 once the fight began. */
const player = (overrides = {}) => makeFighter({ index: 0, buffs: [buff(8888)], ...overrides })
const monster = (overrides = {}) => makeFighter({ index: 1, side: 'defenders', ...overrides })
const event = (): FightEvent => ({ actor: 1, event: 14, target: 0 })

describe('2 Heavy Strike (skill_guaiwuzhongji_2.js)', () => {
  it('hits for damage x1 and costs a level-based MP amount', () => {
    // Arrange
    const { ctx, calls } = fakeContext({ damage: 37 })
    const self = monster({ level: 30, mp: 100 })
    const fv = event()

    // Act
    const result = heavyStrike(ctx, self, player(), fv, 0)

    // Assert: (200 + 20 * 29 * (1 + (49 + 11 * 8 + (2 * 7 + 14) / 3 * 8) / 12 * 0.01)) / 30
    // = 29.41, * 0.5 -> 14
    expect(result).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['attack', 37]])
    expect(self.mp).toBe(86)
    expect(fv.decMp).toBe(14)
  })

  it('costs 3 MP at level 1 and twice that with Vessel Destroy (11839)', () => {
    // Arrange
    const { ctx } = fakeContext()
    const self = monster({ level: 1, mp: 100, buffs: [buff(11839)] })
    const fv = event()

    // Act
    heavyStrike(ctx, self, player(), fv, 0)

    // Assert
    expect(self.mp).toBe(94)
    expect(fv.decMp).toBe(6)
  })

  it('falls back to the normal attack without mana or before the target has 8888', () => {
    // Arrange
    const noMana = fakeContext()
    const noInit = fakeContext()
    const self = monster({ level: 1, mp: 2 })

    // Act
    heavyStrike(noMana.ctx, self, player(), event(), 0)
    heavyStrike(noInit.ctx, monster({ level: 1 }), player({ buffs: null }), event(), 0)

    // Assert
    expect(noMana.calls).toEqual([['normalAttack']])
    expect(noInit.calls).toEqual([['normalAttack']])
    expect(self.mp).toBe(2)
  })

  it('removes its own Illusion (11836) after striking', () => {
    // Arrange
    const { ctx, calls } = fakeContext()
    const self = monster({ level: 1, buffs: [buff(11836)] })

    // Act
    heavyStrike(ctx, self, player(), event(), 0)

    // Assert
    expect(calls).toEqual([
      ['attack', 10],
      ['removeBuff', 1, 11836],
    ])
  })
})

describe('3 Heavy Attack (skill_guaiwuqiangligongji_2.js)', () => {
  it('hits for damage x3 at InitMaxMP * 0.1, hit or miss', () => {
    // Arrange
    const { ctx, calls } = fakeContext({ damage: 11, miss: true })
    const self = monster({ mp: 75, maxMp: 75 })
    const fv = event()

    // Act
    const result = heavyAttack(ctx, self, player(), fv, 0)

    // Assert: 75 - 7.5 = 67.5 -> 67; DecMP 7.5 -> 7
    expect(result).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['attack', 33]])
    expect(self.mp).toBe(67)
    expect(fv.decMp).toBe(7)
  })

  it('doubles the cost with Vessel Destroy and falls back without enough MP', () => {
    // Arrange
    const { ctx, calls } = fakeContext()
    const self = monster({ mp: 19, maxMp: 100, buffs: [buff(11839)] })

    // Act
    heavyAttack(ctx, self, player(), event(), 0)

    // Assert
    expect(calls).toEqual([['normalAttack']])
    expect(self.mp).toBe(19)
  })
})

describe('9999 Lucky Cat (skill_zhaocaimao_9999.js) and buff 99999', () => {
  it('puts buff 99999 on the target and records a miss', () => {
    // Arrange
    const { ctx, calls } = fakeContext()
    const fv = event()

    // Act
    const result = luckyCat(ctx, monster(), player(), fv, 0)

    // Assert
    expect(result).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 99999, 0]])
    expect(fv.hit).toBe(false)
  })

  const fighter = (overrides: Partial<FighterInput>): FighterInput => ({
    ...makeFighter(),
    hp: 10000,
    maxHp: 10000,
    minAttack: 100,
    maxAttack: 100,
    skills: [],
    ...overrides,
  })
  const catFight = (level: number) =>
    simulateFight({
      attackers: [fighter({ level, crit: 480, atkTime: 900 })],
      defenders: [
        fighter({
          minAttack: 0,
          maxAttack: 0,
          skills: [
            {
              id: 9999,
              type: 2,
              quomodo: 1,
              effect: 2,
              priority: 2,
              probability: 100,
              javascript: 'skill/skill_zhaocaimao_9999.js',
            },
          ],
        }),
      ],
      seed: 3,
    })
  const strikes = (replay: ReturnType<typeof simulateFight>) =>
    replay.events.filter((e) => e.actor === 0 && e.event === 14)

  it('cuts a level 1 target to 70 % attack and 480 less CritMul for the duel', () => {
    // Act
    const replay = catFight(1)

    // Assert: 480 CritMul alone crits 30 % of the time; every strike is a plain 70.
    expect(replay.events[0]).toMatchObject({
      actor: 1,
      skillId: 9999,
      hit: false,
      addBuffs: [{ role: 0, buff: 99999 }],
    })
    expect(strikes(replay).length).toBeGreaterThan(5)
    for (const strike of strikes(replay)) {
      expect(strike.damage).toBe(70)
      expect(strike.crit).toBeUndefined()
    }
  })

  it('leaves a target above level 1 untouched (original quirk)', () => {
    // Act
    const replay = catFight(2)

    // Assert
    expect(replay.events[0]).toMatchObject({ addBuffs: [{ role: 0, buff: 99999 }] })
    expect(strikes(replay).some((s) => s.crit)).toBe(true)
  })
})
