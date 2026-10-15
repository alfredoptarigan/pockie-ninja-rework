import { describe, expect, it } from 'vitest'
import { APPRENTICE_CONFIG, canGraduate, senderRole } from './apprentice.js'

const { masterMinLevel, apprenticeMinLevel, apprenticeMaxLevel, graduateLevel } = APPRENTICE_CONFIG

describe('senderRole', () => {
  it('makes the high-level sender the master', () => {
    expect(senderRole(masterMinLevel, apprenticeMinLevel)).toBe('master')
  })

  it('makes the low-level sender the apprentice', () => {
    expect(senderRole(apprenticeMaxLevel, masterMinLevel)).toBe('apprentice')
  })

  it('refuses levels outside both ranges', () => {
    expect(senderRole(masterMinLevel - 1, apprenticeMinLevel)).toBeNull()
    expect(senderRole(masterMinLevel, apprenticeMinLevel - 1)).toBeNull()
    expect(senderRole(masterMinLevel, apprenticeMaxLevel + 1)).toBeNull()
    expect(senderRole(masterMinLevel, masterMinLevel)).toBeNull()
    expect(senderRole(apprenticeMinLevel, apprenticeMinLevel)).toBeNull()
  })
})

describe('canGraduate', () => {
  it('opens at the graduation level', () => {
    expect(canGraduate(graduateLevel - 1)).toBe(false)
    expect(canGraduate(graduateLevel)).toBe(true)
  })
})
