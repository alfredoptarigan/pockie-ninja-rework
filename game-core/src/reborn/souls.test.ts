import { describe, expect, it } from 'vitest'
import { createRandom, type Random } from '../random.js'
import {
  discoverPerDay,
  feedPrayer,
  prayerNeeded,
  prayerPoints,
  refineType,
  rollSoul,
  soulLevelGate,
  synthesisGroups,
} from './souls.js'

/** Random whose `int` returns the queued values in order. */
const queued = (...values: number[]): Random => ({
  next: () => 0,
  int: () => values.shift()!,
  between: (min) => min,
})

describe('discover (decision 15)', () => {
  it('allows 10 a day, 30 with VIP', () => {
    expect(discoverPerDay(false)).toBe(10)
    expect(discoverPerDay(true)).toBe(30)
  })

  it('rolls a uniform type and 70/25/5 levels', () => {
    expect(rollSoul(queued(0, 0))).toEqual({ type: 1, level: 1 })
    expect(rollSoul(queued(12, 69))).toEqual({ type: 13, level: 1 })
    expect(rollSoul(queued(4, 70))).toEqual({ type: 5, level: 2 })
    expect(rollSoul(queued(4, 94))).toEqual({ type: 5, level: 2 })
    expect(rollSoul(queued(4, 95))).toEqual({ type: 5, level: 3 })
    expect(rollSoul(queued(4, 99))).toEqual({ type: 5, level: 3 })
  })

  it('stays in range over many rolls', () => {
    const random = createRandom(7)
    for (let i = 0; i < 500; i++) {
      const soul = rollSoul(random)
      expect(soul.type).toBeGreaterThanOrEqual(1)
      expect(soul.type).toBeLessThanOrEqual(13)
      expect([1, 2, 3]).toContain(soul.level)
    }
  })
})

describe('level gate (decision 13)', () => {
  it('needs 25, 36, 51, 71 and a clamped 90', () => {
    expect(soulLevelGate(1)).toBe(25)
    expect(soulLevelGate(3)).toBe(25)
    expect(soulLevelGate(4)).toBe(36)
    expect(soulLevelGate(6)).toBe(51)
    expect(soulLevelGate(8)).toBe(71)
    expect(soulLevelGate(10)).toBe(90)
  })
})

describe('synthesis', () => {
  it('turns each 3 souls of one level into 1 of level + 1', () => {
    expect(synthesisGroups([1, 1, 1])).toEqual([2])
    expect(synthesisGroups([1, 1, 1, 4, 4, 4])).toEqual([2, 5])
  })

  it('refuses mixed levels, counts that are not a multiple of 3 and level 10', () => {
    expect(synthesisGroups([1, 1, 2])).toBeNull()
    expect(synthesisGroups([1, 1])).toBeNull()
    expect(synthesisGroups([])).toBeNull()
    expect(synthesisGroups([10, 10, 10])).toBeNull()
  })
})

describe('refine', () => {
  it('always rerolls to a different type', () => {
    expect(refineType(1, queued(0))).toBe(2)
    expect(refineType(5, queued(3))).toBe(4)
    expect(refineType(5, queued(4))).toBe(6)
    expect(refineType(13, queued(11))).toBe(12)
    const random = createRandom(3)
    for (let i = 0; i < 200; i++) expect(refineType(7, random)).not.toBe(7)
  })
})

describe('prayer (decision 16)', () => {
  it('needs 5000 x 2^level and a soul gives 100 x 3^(level - 1)', () => {
    expect(prayerNeeded(0)).toBe(5000)
    expect(prayerNeeded(8)).toBe(1_280_000)
    expect(prayerPoints(1)).toBe(100)
    expect(prayerPoints(3)).toBe(900)
    expect(prayerPoints(10)).toBe(1_968_300)
  })

  it('adds progress below the next level', () => {
    expect(feedPrayer({ level: 0, progress: 4800 }, 100)).toEqual({ level: 0, progress: 4900 })
  })

  it('levels up once and carries the rest', () => {
    expect(feedPrayer({ level: 0, progress: 4900 }, 300)).toEqual({ level: 1, progress: 200 })
  })

  it('levels up several times at once', () => {
    // 5000 + 10000 + 20000 = 35000 to reach level 3, 1000 left.
    expect(feedPrayer({ level: 0, progress: 0 }, 36_000)).toEqual({ level: 3, progress: 1000 })
  })

  it('stops at level 9 with no progress', () => {
    expect(feedPrayer({ level: 8, progress: 0 }, 2_000_000)).toEqual({ level: 9, progress: 0 })
    expect(feedPrayer({ level: 0, progress: 0 }, 10_000_000)).toEqual({ level: 9, progress: 0 })
  })
})
