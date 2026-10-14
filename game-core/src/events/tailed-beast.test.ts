import { describe, expect, it } from 'vitest'
import { GateRuleError } from '../gates/errors.js'
import {
  beastLevel,
  claimableBox,
  closestByLevel,
  honorFor,
  spendTickets,
  ticketCost,
  todaysBeasts,
  weekday,
} from './tailed-beast.js'

describe('beast rotation (decision 27)', () => {
  it('numbers days Monday 1 to Sunday 7 in UTC', () => {
    expect(weekday(new Date('2026-10-12T00:00:00Z'))).toBe(1)
    expect(weekday(new Date('2026-10-13T23:59:59Z'))).toBe(2)
    expect(weekday(new Date('2026-10-18T12:00:00Z'))).toBe(7)
  })

  it('has two beasts a day, wrapping after 9', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(todaysBeasts)).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 1],
      [2, 3],
      [4, 5],
    ])
  })

  it('matches the captured Tuesday (Isobu and Son Goku)', () => {
    expect(todaysBeasts(weekday(new Date('2026-10-13T10:00:00Z')))).toEqual([3, 4])
  })
})

describe('beast level', () => {
  it('is 25 + 5(id-1) + 25 mode', () => {
    expect(beastLevel(1, 0)).toBe(25)
    expect(beastLevel(9, 0)).toBe(65)
    expect(beastLevel(3, 1)).toBe(60)
    expect(beastLevel(9, 2)).toBe(115)
  })

  it('picks the closest-level row, the higher one on a tie', () => {
    const rows = [
      { npc: 'a', level: 20 },
      { npc: 'b', level: 30 },
      { npc: 'c', level: 40 },
    ]
    expect(closestByLevel(rows, 33).npc).toBe('b')
    expect(closestByLevel(rows, 35).npc).toBe('c')
    expect(closestByLevel(rows, 999).npc).toBe('c')
    // Las Noches ends with several level-100 bosses: the last (strongest) one is used.
    expect(closestByLevel([...rows, { npc: 'd', level: 40 }], 115).npc).toBe('d')
  })
})

describe('tickets', () => {
  it('costs 1, 3 or 5 by mode', () => {
    expect([0, 1, 2].map(ticketCost)).toEqual([1, 3, 5])
  })

  it('spends from 10 free tickets a day', () => {
    expect(spendTickets(0, 0)).toBe(1)
    expect(spendTickets(5, 2)).toBe(10)
    expect(spendTickets(7, 1)).toBe(10)
  })

  it('refuses a fight the tickets left cannot pay', () => {
    expect(() => spendTickets(8, 1)).toThrow(GateRuleError)
    expect(() => spendTickets(10, 0)).toThrow(/tickets/)
  })
})

describe('Honor', () => {
  it('is one per 100,000 damage, truncated', () => {
    expect(honorFor(99_999)).toBe(0)
    expect(honorFor(100_000)).toBe(1)
    expect(honorFor(2_550_000)).toBe(25)
  })
})

describe('fight boxes', () => {
  it('opens at 5, 10 and 20 fights', () => {
    expect(claimableBox(4, [], 5)).toBe(false)
    expect(claimableBox(5, [], 5)).toBe(true)
    expect(claimableBox(9, [5], 10)).toBe(false)
    expect(claimableBox(20, [5, 10], 20)).toBe(true)
  })

  it('opens each box once', () => {
    expect(claimableBox(30, [5], 5)).toBe(false)
  })

  it('knows no other thresholds', () => {
    expect(claimableBox(30, [], 7)).toBe(false)
  })
})
