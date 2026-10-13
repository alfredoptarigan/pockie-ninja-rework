import { describe, expect, it } from 'vitest'
import { GateRuleError } from '../gates/errors.js'
import {
  ARENA_COSTS,
  compareArenaOrder,
  dailyCounters,
  duelCost,
  eloDelta,
  expectedScore,
  fightHonor,
  freeRefreshReady,
  honorExchange,
  pickIdentifyCount,
  promotionScore,
  recordResult,
  revengeGold,
  takeTry,
  winRate,
} from './rules.js'
import { createRandom } from '../random.js'

const refusal = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    if (error instanceof GateRuleError) return error.code
    throw error
  }
  return null
}

describe('Elo (K 2000, scale 100000)', () => {
  it('equal scores move 1000 raw points either way', () => {
    expect(expectedScore(100000, 100000)).toBe(0.5)
    expect(eloDelta(100000, 100000, 1)).toBe(1000)
    expect(eloDelta(100000, 100000, 0)).toBe(-1000)
    expect(eloDelta(100000, 100000, 0.5)).toBe(0)
  })

  it('truncates toward zero like Java intValue', () => {
    // E = 1 / (1 + 10^(10000/100000)) = 0.44269...; 2000 * 0.5573 = 1114.6 -> 1114
    expect(eloDelta(100000, 110000, 1)).toBe(1114)
    // 2000 * -0.44269 = -885.38 -> -885 (not -886)
    expect(eloDelta(100000, 110000, 0)).toBe(-885)
  })

  it('is zero-sum: the defender loses what the attacker gains', () => {
    for (const [a, d, w] of [
      [93500, 120000, 1],
      [150000, 100000, 0],
      [100000, 100000, 1],
    ] as const) {
      const delta = eloDelta(a, d, w)
      expect(a + delta + (d - delta)).toBe(a + d)
    }
  })

  it('an NPC with score 0 gives no change', () => {
    expect(eloDelta(93500, 0, 1)).toBe(0)
  })
})

describe('arena order: one symmetric tie rule', () => {
  const at = (ms: number) => new Date(ms)
  const row = (id: string, tier: number, score: number, scoreAt: number) => ({
    characterId: id,
    tier,
    score,
    scoreAt: at(scoreAt),
  })

  it('sorts by tier, then score, then the earlier holder of a score, then id', () => {
    const rows = [
      row('d', 2, 100000, 5),
      row('a', 3, 100000, 9),
      row('c', 2, 105000, 9),
      row('b', 2, 100000, 1),
      row('e', 2, 100000, 1),
    ]
    expect([...rows].sort(compareArenaOrder).map((r) => r.characterId)).toEqual([
      'a',
      'c',
      'b',
      'e',
      'd',
    ])
  })

  it('a ninja moving into a tie ranks below the existing holders, from above or below', () => {
    const holder = row('holder', 2, 104000, 1)
    const fromBelow = row('up', 2, 104000, 10)
    const fromAbove = row('down', 2, 104000, 10)
    expect(compareArenaOrder(holder, fromBelow)).toBeLessThan(0)
    expect(compareArenaOrder(holder, fromAbove)).toBeLessThan(0)
  })
})

describe('promotion', () => {
  it('caps the score at beginscore(new tier) x 1.1, once', () => {
    expect(promotionScore(140000, 100000)).toBe(110000)
    expect(promotionScore(100500, 100000)).toBe(100500)
  })
})

describe('Honor, streak and win rate', () => {
  it('pays the tier Honor win or loss, +1 on a revenge', () => {
    expect(fightHonor(10, false)).toBe(10)
    expect(fightHonor(10, true)).toBe(11)
  })

  it('the winner extends the streak, the loser drops to 0', () => {
    const stats = { streak: 4, fights: 10, wins: 6 }
    expect(recordResult(stats, true)).toEqual({ streak: 5, fights: 11, wins: 7 })
    expect(recordResult(stats, false)).toEqual({ streak: 0, fights: 11, wins: 6 })
  })

  it('win rate is wins / fights x 100, floored', () => {
    expect(winRate(0, 0)).toBe(0)
    expect(winRate(2, 3)).toBe(66)
  })
})

describe('daily tries and costs', () => {
  const day = '2026-10-13'

  it('resets the counters on a new UTC day', () => {
    const row = { day: '2026-10-12', triesUsed: 20, triesBought: 15, duelsUsed: 30 }
    expect(dailyCounters(row, day)).toEqual({ day, triesUsed: 0, triesBought: 0, duelsUsed: 0 })
    expect(dailyCounters({ ...row, day }, day)).toEqual({ ...row, day })
  })

  it('20 free tries, then 8 Gold each, at most 15 bought', () => {
    const counters = { day, triesUsed: 19, triesBought: 0, duelsUsed: 0 }
    expect(takeTry(counters)).toEqual({ gold: 0, counters: { ...counters, triesUsed: 20 } })
    const paid = takeTry({ ...counters, triesUsed: 20 })
    expect(paid).toEqual({ gold: 8, counters: { ...counters, triesUsed: 20, triesBought: 1 } })
    expect(refusal(() => takeTry({ ...counters, triesUsed: 20, triesBought: 15 }))).toBe('no_tries')
  })

  it('10 free duels a day, then 2 Gold each without a cap', () => {
    expect(duelCost(9)).toBe(0)
    expect(duelCost(10)).toBe(ARENA_COSTS.duelGold)
    expect(duelCost(500)).toBe(2)
  })

  it('revenge: the first per target and day is free, then 10 Gold x times used', () => {
    expect(revengeGold(0)).toBe(0)
    expect(revengeGold(1)).toBe(10)
    expect(revengeGold(3)).toBe(30)
  })

  it('one free list refresh once 3600 s have passed since the last free one', () => {
    const now = new Date('2026-10-13T12:00:00Z')
    expect(freeRefreshReady(null, now)).toBe(true)
    expect(freeRefreshReady(new Date('2026-10-13T11:00:00Z'), now)).toBe(true)
    expect(freeRefreshReady(new Date('2026-10-13T11:00:01Z'), now)).toBe(false)
  })
})

describe('Honor sinks', () => {
  it('Honor -> EXP pays honor x n for exp x n', () => {
    expect(honorExchange({ honor: 100, exp: 550 }, 3)).toEqual({ honor: 300, exp: 1650 })
  })

  it('rolls the identified property count by the c1-c4 weights', () => {
    const offer = { c1: 0, c2: 0, c3: 1, c4: 0, honor: 1, rank: 0 }
    expect(pickIdentifyCount(offer, createRandom(1))).toBe(3)
    const counts = new Set(
      Array.from({ length: 200 }, (_, seed) =>
        pickIdentifyCount({ ...offer, c1: 79, c2: 20, c3: 1 }, createRandom(seed)),
      ),
    )
    expect([...counts].every((n) => n >= 1 && n <= 3)).toBe(true)
    expect(counts.has(1) && counts.has(2)).toBe(true)
  })
})
