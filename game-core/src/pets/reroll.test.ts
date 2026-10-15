import { describe, expect, it } from 'vitest'
import { createRandom } from '../random.js'
import { REROLL_CONFIG, rerollUntil, rollPet } from './reroll.js'

const COST = REROLL_CONFIG.stonesPerRoll

describe('rollPet', () => {
  it('always lands on another listed pet', () => {
    const random = createRandom(7)
    for (let i = 0; i < 200; i++) {
      const next = rollPet('i320002', random)
      expect(next).not.toBe('i320002')
      expect(REROLL_CONFIG.pets).toContain(next)
    }
  })

  it('reaches every other listed pet', () => {
    const random = createRandom(11)
    const seen = new Set(Array.from({ length: 2000 }, () => rollPet('i320002', random)))
    expect(seen.size).toBe(REROLL_CONFIG.pets.length - 1)
  })
})

describe('rerollUntil', () => {
  it('rolls once on the minimum budget', () => {
    const outcome = rerollUntil('i320002', 'i999999', COST, createRandom(1))
    expect(outcome.rolls).toBe(1)
    expect(outcome.spent).toBe(COST)
    expect(outcome.hit).toBe(false)
  })

  it('stops on the target and charges only the rolls made', () => {
    const outcome = rerollUntil('i320002', 'i320033', REROLL_CONFIG.maxStones, createRandom(3))
    expect(outcome.hit).toBe(true)
    expect(outcome.itemId).toBe('i320033')
    expect(outcome.spent).toBe(outcome.rolls * COST)
    expect(outcome.spent).toBeLessThanOrEqual(REROLL_CONFIG.maxStones)
  })

  it('never spends past the budget', () => {
    const outcome = rerollUntil('i320002', 'i999999', COST * 3 + 1, createRandom(5))
    expect(outcome.rolls).toBe(3)
    expect(outcome.spent).toBe(COST * 3)
  })

  it('makes no roll when the budget is short', () => {
    expect(rerollUntil('i320002', 'i320033', COST - 1, createRandom(5))).toEqual({
      itemId: 'i320002',
      rolls: 0,
      spent: 0,
      hit: false,
    })
  })
})
