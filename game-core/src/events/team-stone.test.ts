import { describe, expect, it } from 'vitest'
import {
  fighterPower,
  fillDelayMs,
  leagueIndex,
  planMatches,
  scoreDelta,
  type QueuedNinja,
} from './team-stone.js'

const FILL: [number, number] = [15, 30]

describe('scoreDelta (decision 28)', () => {
  it('pays +22/-18 against a 20% stronger team', () => {
    expect(scoreDelta(100, 120, true)).toBe(22)
    expect(scoreDelta(100, 120, false)).toBe(-18)
  })
  it('pays +20/-20 against an even team', () => {
    expect(scoreDelta(100, 100, true)).toBe(20)
    expect(scoreDelta(100, 100, false)).toBe(-20)
  })
  it('pays +18/-22 against a 20% weaker team', () => {
    expect(scoreDelta(100, 80, true)).toBe(18)
    expect(scoreDelta(100, 80, false)).toBe(-22)
  })
  it('is linear between and capped outside 0.8..1.2', () => {
    expect(scoreDelta(100, 110, true)).toBe(21)
    expect(scoreDelta(100, 90, false)).toBe(-21)
    expect(scoreDelta(100, 500, true)).toBe(22)
    expect(scoreDelta(100, 1, false)).toBe(-22)
  })
  it('treats a powerless own team as even', () => {
    expect(scoreDelta(0, 0, true)).toBe(20)
  })
})

describe('leagueIndex', () => {
  const mins = [0, 300, 700, 1200, 1800, 2500, 3300, 4200]
  it('picks the highest league whose minimum the score meets', () => {
    expect(leagueIndex(mins, 0)).toBe(0)
    expect(leagueIndex(mins, 299)).toBe(0)
    expect(leagueIndex(mins, 300)).toBe(1)
    expect(leagueIndex(mins, 9999)).toBe(7)
  })
})

describe('fighterPower', () => {
  it('weighs HP and average attack', () => {
    expect(fighterPower({ maxHp: 1000, minAttack: 90, maxAttack: 110 })).toBe(2000)
  })
})

describe('fillDelayMs', () => {
  it('stays within the fill window', () => {
    for (const at of [0, 1, 7_777, 15_000, 1_791_932_400_123]) {
      const delay = fillDelayMs(at, FILL)
      expect(delay).toBeGreaterThanOrEqual(15_000)
      expect(delay).toBeLessThanOrEqual(30_000)
    }
  })
})

const now = 1_000_000_000
const ninja = (id: string, score: number, waitedMs: number): QueuedNinja => ({
  id,
  score,
  queuedAt: now - waitedMs,
})

describe('planMatches', () => {
  it('pairs six waiting ninjas into two teams of three without bots', () => {
    const waiting = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ninja(id, i * 100, 1000))
    const plans = planMatches(waiting, now, FILL)
    expect(plans).toHaveLength(1)
    const [plan] = plans
    expect(plan!.sides[0]).toHaveLength(3)
    expect(plan!.sides[1]).toHaveLength(3)
    expect(plan!.bots).toEqual([0, 0])
    expect(new Set([...plan!.sides[0], ...plan!.sides[1]]).size).toBe(6)
  })

  it('leaves fresh ninjas waiting when fewer than six', () => {
    expect(planMatches([ninja('a', 0, 1000), ninja('b', 0, 1000)], now, FILL)).toEqual([])
  })

  it('fills with bots once a ninja has waited 30 s', () => {
    const plans = planMatches([ninja('a', 100, 31_000), ninja('b', 300, 2000)], now, FILL)
    expect(plans).toEqual([{ sides: [['a', 'b'], []], bots: [1, 3], score: 200 }])
  })

  it('never puts a queued ninja in two matches', () => {
    const waiting = Array.from({ length: 17 }, (_, i) => ninja(`n${i}`, (i * 37) % 500, 40_000))
    const plans = planMatches(waiting, now, FILL)
    const ids = plans.flatMap((p) => [...p.sides[0], ...p.sides[1]])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(17)
    for (const plan of plans)
      expect([0, 1].map((i) => plan.sides[i]!.length + plan.bots[i]!)).toEqual([3, 3])
  })
})
