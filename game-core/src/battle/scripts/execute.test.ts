import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput, type SkillInput } from '../fight.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_LOSE, SKILL_SUCCESS, type FightEvent } from '../types.js'
import {
  avatarLevelFromAvatarId,
  avatarLevelOf,
  execute,
  executeOdds,
  executeOrNewUltimate,
  NEW_ULTIMATE_SKILL_IDS,
  newUltimate,
  newUltimateSkill,
} from './execute.js'

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

describe('execute skills with the +9 ultimate (skill_aoyi_1901.js and 47 more)', () => {
  // Avatar level 9 against a level 2 monster (-5): gap 14, Probability 10 + 14^1.2 = 33.74,
  // HPCondition 15 + 14^1.26 = 42.85.
  const nine = () => makeFighter({ avatarLevel: 9 })

  it('switches to skill id * 10 on a 50 % roll at avatar level 9+', () => {
    const { ctx, calls } = fakeContext({ rolls: [33, 49] })
    const fv: FightEvent = { actor: 0, event: 14, target: 1 }
    expect(executeOrNewUltimate(19010)(ctx, nine(), monster({ hp: 42 }), fv, 0)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['changeSkill', 19010]])
  })

  it('executes like the other ultimates when the 50 % roll fails', () => {
    const { ctx, calls } = fakeContext({ rolls: [33, 50, 400] })
    const fv: FightEvent = { actor: 0, event: 14, target: 1 }
    executeOrNewUltimate(19010)(ctx, nine(), monster({ hp: 42 }), fv, 0)
    // 400 / 100 * 42 = 168
    expect(calls).toEqual([['damage', 1, 168]])
    expect(fv).toMatchObject({ damage: 168, hit: true })
  })

  it('never rolls for the new ultimate below avatar level 9', () => {
    const { ctx, calls } = fakeContext({ rolls: [0, 300] })
    const fv: FightEvent = { actor: 0, event: 14, target: 1 }
    executeOrNewUltimate(19010)(ctx, makeFighter({ avatarLevel: 8 }), monster({ hp: 7 }), fv, 0)
    expect(calls).toEqual([['damage', 1, 21]])
  })

  it('fails like the other ultimates on the chance or HP condition', () => {
    const { ctx, calls } = fakeContext({ rolls: [34] })
    const fv: FightEvent = { actor: 0, event: 14 }
    expect(executeOrNewUltimate(19010)(ctx, nine(), monster({ hp: 1 }), fv, 0)).toBe(SKILL_LOSE)
    expect(calls).toEqual([])
  })
})

describe('new ultimates (skill_aoyi_19010.js and the other 113 ids * 10)', () => {
  it('deals RandInt(300,500)/100 * HP without any condition', () => {
    const { ctx, calls } = fakeContext({ rolls: [500] })
    const fv: FightEvent = { actor: 0, event: 14, target: 1 }
    expect(newUltimate(ctx, makeFighter(), monster({ hp: 1000 }), fv, 0)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['damage', 1, 5000]])
  })

  it('matches the skill.ini rows of every new ultimate', () => {
    expect(NEW_ULTIMATE_SKILL_IDS).toHaveLength(114)
    expect(newUltimateSkill(19010)).toEqual({
      id: 19010,
      type: 1,
      quomodo: 1,
      effect: 1,
      priority: 1,
      probability: 0,
      canbecounter: 0,
      decmp: 0,
      secondid: 19010,
      javascript: 'skill/skill_aoyi_19010.js',
    })
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

  it('records the new ultimate as skill 19450 for Naruto (1945) at avatar level 9', () => {
    const naruto: SkillInput = { ...aoyi, id: 1945, javascript: 'skill/skill_aoyi_1945.js' }
    const used = new Set<number | undefined>()
    for (let seed = 1; seed <= 20; seed++) {
      const replay = simulateFight({
        attackers: [{ ...base, avatarLevel: 9, hp: 1000, maxHp: 1000, skills: [naruto] }],
        defenders: [{ ...base, level: 2, hp: 300, maxHp: 1000, minAttack: 0, maxAttack: 0 }],
        seed,
      })
      for (const e of replay.events) if (e.actor === 0 && e.damage) used.add(e.skillId)
    }
    expect(used).toEqual(new Set([1, 1945, 19450]))
  })
})
