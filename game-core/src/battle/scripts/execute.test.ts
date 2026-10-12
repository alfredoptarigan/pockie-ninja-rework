import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput, type SkillInput } from '../fight.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_LOSE, SKILL_SUCCESS, type FightEvent } from '../types.js'
import { avatarLevelFromAvatarId, avatarLevelOf, execute, executeOdds } from './execute.js'

const monster = (overrides = {}) => makeFighter({ index: 1, level: 2, ...overrides })

describe('avatar level (FightObject.getAvatarLevel / skill_aoyi_*.js)', () => {
  it('derives the player avatar level from PlayerAvatarID', () => {
    expect(avatarLevelFromAvatarId(39)).toBe(0)
    expect(avatarLevelFromAvatarId(250)).toBe(2)
    expect(avatarLevelFromAvatarId(4021)).toBe(1)
    expect(avatarLevelFromAvatarId(4640)).toBe(31)
  })

  it('uses trunc(level / 3) - 5 for NPCs without an avatar level', () => {
    expect(avatarLevelOf(makeFighter({ level: 2 }))).toBe(-5)
    expect(avatarLevelOf(makeFighter({ level: 10 }))).toBe(-2)
    expect(avatarLevelOf(makeFighter({ level: 10, avatarLevel: 0 }))).toBe(0)
  })
})

describe('execute skills (skill_aoyi_1903.js and the 65 identical outfit ultimates)', () => {
  it('computes HPCondition = 15 + gap^1.26 and Probability = 10 + gap^1.2', () => {
    expect(executeOdds(5).hpCondition).toBeCloseTo(22.598, 3)
    expect(executeOdds(5).probability).toBeCloseTo(16.8986, 3)
    expect(executeOdds(0)).toEqual({ hpCondition: 15, probability: 10 })
    expect(executeOdds(-3)).toEqual({ hpCondition: 15, probability: 10 })
  })

  it('deals RandInt(300,500)/100 * HP when the roll and the HP condition pass', () => {
    // Avatar level 0 against a level 2 monster: gap 5, probability 16.9 %, HP below 22.59 %.
    const { ctx, calls } = fakeContext({ rolls: [16, 333] })
    const fv: FightEvent = { actor: 0, event: 14, target: 1 }
    const target = monster({ hp: 7 })
    expect(execute(ctx, makeFighter({ avatarLevel: 0 }), target, fv, 0)).toBe(SKILL_SUCCESS)
    // 333 / 100 * 7 = 23.31
    expect(calls).toEqual([['damage', 1, 23]])
    expect(fv).toMatchObject({ damage: 23, hit: true })
  })

  it('fails on a roll at or above the probability', () => {
    const { ctx, calls } = fakeContext({ rolls: [17] })
    const fv: FightEvent = { actor: 0, event: 14 }
    expect(execute(ctx, makeFighter({ avatarLevel: 0 }), monster({ hp: 7 }), fv, 0)).toBe(
      SKILL_LOSE,
    )
    expect(calls).toEqual([])
  })

  it('fails while the target has HP at or above the condition', () => {
    const { ctx } = fakeContext({ rolls: [0] })
    const fv: FightEvent = { actor: 0, event: 14 }
    expect(execute(ctx, makeFighter({ avatarLevel: 0 }), monster({ hp: 23 }), fv, 0)).toBe(
      SKILL_LOSE,
    )
  })
})

describe('execute skills in a fight', () => {
  const aoyi: SkillInput = {
    id: 1903,
    type: 1,
    quomodo: 1,
    effect: 1,
    priority: 1,
    probability: 100,
    javascript: 'skill/skill_aoyi_1903.js',
  }
  const base: FighterInput = { ...makeFighter() }

  it('finishes a low monster with the ultimate and records it as skill 1903', () => {
    let executions = 0
    for (let seed = 1; seed <= 20; seed++) {
      const replay = simulateFight({
        attackers: [{ ...base, avatarLevel: 0, hp: 1000, maxHp: 1000, skills: [aoyi] }],
        defenders: [{ ...base, level: 2, minAttack: 0, maxAttack: 0 }],
        seed,
      })
      let hp = 100
      for (const e of replay.events) {
        if (e.target !== 1 || !e.damage) continue
        if (e.skillId === 1903) {
          executions++
          expect(hp).toBeLessThan(22.6)
          expect(e.damage).toBeGreaterThanOrEqual(3 * hp)
          expect(e.damage).toBeLessThanOrEqual(5 * hp)
        }
        hp = Math.max(0, hp - e.damage)
      }
      expect(replay.winner).toBe('attackers')
    }
    expect(executions).toBeGreaterThan(0)
  })
})
