import { createRandom, ELEMENT_PASSIVES, LEARNABLE_NINJUTSU } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { rollLearning } from './learning.js'

describe('level-up learning', () => {
  it('learns one random unowned ninjutsu per gained level without secondary level gates', () => {
    const learned = rollLearning([], 1, 2, createRandom(7))
    expect(learned).toHaveLength(1)
    expect(LEARNABLE_NINJUTSU).toContain(learned[0]!.skillId)
    expect(learned[0]!.level).toBe(1)
  })
  it('adds one passive when crossing level 10 and handles multi-level rewards', () => {
    const learned = rollLearning([], 1, 21, createRandom(7))
    expect(learned.filter((row) => LEARNABLE_NINJUTSU.includes(row.skillId))).toHaveLength(20)
    expect(learned.filter((row) => ELEMENT_PASSIVES.includes(row.skillId))).toHaveLength(2)
    expect(new Set(learned.map((row) => row.skillId)).size).toBe(22)
  })
  it('caps learned ninjutsu at 40 and original learned levels at 1', () => {
    const learned = rollLearning([], 1, 90, createRandom(2))
    expect(learned.filter((row) => LEARNABLE_NINJUTSU.includes(row.skillId))).toHaveLength(40)
    expect(learned.filter((row) => ELEMENT_PASSIVES.includes(row.skillId))).toHaveLength(9)
    expect(learned.every((row) => row.level === 1)).toBe(true)
    expect(rollLearning(learned, 90, 90, createRandom(2))).toEqual(learned)
  })
})
