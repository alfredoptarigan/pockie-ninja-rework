import { describe, expect, it } from 'vitest'
import { createRandom, type Random } from '../random.js'
import {
  canUnlockSlot,
  learnSkill,
  lockCost,
  pickLearnSkill,
  skillCap,
  slotCost,
  type LearnedSkill,
} from './skills.js'

const skill = (skillId: number, learnedOrder: number, locked = false): LearnedSkill => ({
  skillId,
  level: 1,
  learnedOrder,
  locked,
  kind: 3,
  slot: null,
})
const five = () => [skill(1, 0), skill(2, 1, true), skill(3, 2), skill(4, 3), skill(5, 4)]

describe('learnSkill (PetRealizeSkill, decision 14)', () => {
  it('adds a new skill at level 1 after the others', () => {
    expect(learnSkill([skill(1, 0)], 9, 2, 1)).toEqual([
      skill(1, 0),
      { skillId: 9, level: 1, learnedOrder: 1, locked: false, kind: 2, slot: null },
    ])
  })

  it('levels a known skill up to its max level and refuses past it', () => {
    expect(learnSkill([skill(1, 0)], 1, 3, 3)).toEqual([{ ...skill(1, 0), level: 2 }])
    expect(learnSkill([{ ...skill(1, 0), level: 3 }], 1, 3, 3)).toBeNull()
  })

  it('drops the oldest unlocked skill for a sixth one', () => {
    const learned = learnSkill([skill(1, 0, true), ...five().slice(1)], 6, 3, 1)
    expect(learned?.map((s) => s.skillId)).toEqual([1, 2, 4, 5, 6])
    expect(learned?.at(-1)?.learnedOrder).toBe(5)
  })

  it('refuses a sixth skill when all five are locked', () => {
    const locked = five().map((s) => ({ ...s, locked: true }))
    expect(learnSkill(locked, 6, 3, 1)).toBeNull()
  })
})

describe('pickLearnSkill (LearnSkill)', () => {
  it('picks uniformly from the pool minus known skills', () => {
    const random: Random = { ...createRandom(1), between: (min, max) => (min === 0 ? max : min) }
    expect(pickLearnSkill([10, 11, 12, 13], [skill(13, 0)], random)).toBe(12)
    expect(pickLearnSkill([10], [skill(10, 0)], random)).toBeNull()
  })
})

describe('skill slots (OnCustomActSkill)', () => {
  it('costs PetActCapital[n] Stone for slot n', () => {
    expect(slotCost(7)).toBe(26000)
    expect(slotCost(8)).toBe(40000)
    expect(slotCost(18)).toBe(820000)
    expect(slotCost(19)).toBeNull()
  })

  it('caps the total by PetSkillCnt[level] and a kind at 6', () => {
    expect(skillCap(0)).toBe(7)
    expect(skillCap(4)).toBe(8)
    expect(skillCap(50)).toBe(18)
    expect(canUnlockSlot(7, 3, 4)).toBe(true)
    expect(canUnlockSlot(8, 3, 4)).toBe(false)
    expect(canUnlockSlot(7, 6, 50)).toBe(false)
  })
})

describe('lockCost (OnCustomPetSkillLock)', () => {
  it('is 1 item for the first lock, 2 for the second, none for a third', () => {
    expect(lockCost(0)).toBe(1)
    expect(lockCost(1)).toBe(2)
    expect(lockCost(2)).toBeNull()
  })
})
