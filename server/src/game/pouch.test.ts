import { describe, expect, it } from 'vitest'
import { buyPouches, drawPouch, pouchMax } from './pouch.js'

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

describe('buying pouch refills (OnCustomBuy)', () => {
  const empty = { level: 1, hpPouch: 0, mpPouch: 0 }

  it('charges 1 per 1000 points bought and adds them', () => {
    expect(buyPouches(empty, 5, 10)).toEqual({ cost: 15, hpPouch: 5000, mpPouch: 10_000 })
  })

  it('caps at the pouch size but still charges the full amount', () => {
    expect(buyPouches({ ...empty, hpPouch: 9000 }, 5, 0)).toEqual({
      cost: 5,
      hpPouch: 10_000,
      mpPouch: 0,
    })
  })

  it('fills to the top for (missing - 1) / 1000 + 1', () => {
    expect(buyPouches({ ...empty, hpPouch: 8999 }, 'full', 0)).toEqual({
      cost: 2,
      hpPouch: 10_000,
      mpPouch: 0,
    })
    expect(buyPouches({ ...empty, mpPouch: 9000 }, 0, 'full')).toMatchObject({ cost: 1 })
    expect(buyPouches(empty, 'full', 'full')).toMatchObject({ cost: 20 })
  })

  it('skips (and does not charge) a pouch that is already full', () => {
    expect(buyPouches({ ...empty, hpPouch: 10_000 }, 50, 5)).toEqual({
      cost: 5,
      hpPouch: 10_000,
      mpPouch: 5000,
    })
  })

  it('returns undefined when nothing can be bought', () => {
    expect(buyPouches({ ...empty, hpPouch: 10_000, mpPouch: 10_000 }, 5, 'full')).toBeUndefined()
    expect(buyPouches(empty, 0, 0)).toBeUndefined()
  })
})
