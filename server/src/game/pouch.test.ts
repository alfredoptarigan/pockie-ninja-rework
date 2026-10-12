import { describe, expect, it } from 'vitest'
import { drawPouch, pouchMax } from './pouch.js'

describe('HP/MP pouch (RoleUseSystem)', () => {
  it('holds 9000 + level * 1000 (RefreshExtendMax)', () => {
    expect(pouchMax(1)).toBe(10_000)
    expect(pouchMax(90)).toBe(99_000)
  })

  it('tops the bar up and keeps the rest (UseHPContainer)', () => {
    expect(drawPouch(40, 220, 1000)).toEqual({ value: 220, pouch: 820 })
  })

  it('empties into the bar when it cannot fill it', () => {
    expect(drawPouch(0, 220, 100)).toEqual({ value: 100, pouch: 0 })
  })

  it('does nothing at full value or with an empty pouch', () => {
    expect(drawPouch(220, 220, 500)).toEqual({ value: 220, pouch: 500 })
    expect(drawPouch(10, 220, 0)).toEqual({ value: 10, pouch: 0 })
  })
})
