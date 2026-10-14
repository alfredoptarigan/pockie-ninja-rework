import { describe, expect, it } from 'vitest'
import { petExpShare, petLevelFromExp } from './exp.js'

describe('petLevelFromExp (PetExp 1-50)', () => {
  it('spends PetExp[level] per level and carries the rest', () => {
    // PetExp 1=5, 2=11, 3=25.
    expect(petLevelFromExp(1, 0, 20, 90)).toEqual({ level: 3, exp: 4, levelsGained: 2 })
  })

  it('stops at the master level and keeps the EXP for later', () => {
    expect(petLevelFromExp(1, 0, 20, 2)).toEqual({ level: 2, exp: 15, levelsGained: 1 })
  })

  it('stops at level 50', () => {
    expect(petLevelFromExp(50, 0, 1_000_000, 90).level).toBe(50)
    expect(petLevelFromExp(1, 0, 10_000_000, 90).level).toBe(50)
  })
})

describe('petExpShare (decision 12)', () => {
  it('is half the master fight EXP, rounded down', () => {
    expect(petExpShare(101)).toBe(50)
  })
})
