import { describe, expect, it } from 'vitest'
import { canSwitchLasNochesScene, lasNochesFloorBroadcast } from './las-noches.js'

describe('Las Noches broadcasts', () => {
  it.each([
    [50, 'SingleGate_231'],
    [100, 'SingleGate_232'],
    [150, 'SingleGate_213'],
    [151, 'SingleGate_303'],
  ])('formats floor %i', (floor, key) => {
    expect(lasNochesFloorBroadcast('Ninja', floor as number, 0, false, 'Fire', 123)).toMatchObject({
      key,
    })
  })
  it('suppresses floor 50 repeats and existing records', () => {
    expect(lasNochesFloorBroadcast('Ninja', 50, 50, true, 'Fire', 0)).toBeNull()
    expect(lasNochesFloorBroadcast('Ninja', 151, 151, false, 'Fire', 0)).toBeNull()
  })
  it('includes nation and pot at floor 150', () => {
    expect(lasNochesFloorBroadcast('Ninja', 150, 0, false, 'Fire', 123)?.message).toContain('Fire')
    expect(lasNochesFloorBroadcast('Ninja', 150, 0, false, 'Fire', 123)?.message).toContain(
      '123 EXP',
    )
  })
  it('locks travel only from the gate scenes during auto', () => {
    expect(canSwitchLasNochesScene(1, 171, 2601)).toBe(false)
    expect(canSwitchLasNochesScene(1, 171, 3101)).toBe(true)
    expect(canSwitchLasNochesScene(2, 171, 2601)).toBe(true)
    expect(canSwitchLasNochesScene(1, 2601, 171)).toBe(true)
  })
})
