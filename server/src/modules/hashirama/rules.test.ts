// Hashirama vs Madara rules: phases, the count and payout, the leaders and the Fortune Wheel.
import { createRandom, simulateFight, type Random } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { playerFighterFrom } from '../../game/combat.js'
import { item, outfitForClothing } from '../../game/data.js'
import { HASHIRAMA_PLACEHOLDERS as P, type WheelReward } from './config.js'
import {
  landing,
  leaderFighter,
  payouts,
  phase,
  possibleRewards,
  segments,
  selectionError,
  spin,
  winnerOf,
} from './rules.js'

const HOUR = 3_600_000
const at = (hours: number) => new Date(Date.UTC(2026, 9, 15) + hours * HOUR)
const event = { endsAt: at(48), closesAt: at(72), settled: false, winner: null }

/** A Random whose next() returns the given values in order. */
const fixed = (...values: number[]): Random => {
  const queue = [...values]
  const next = () => queue.shift() ?? 0.99
  return {
    next,
    int: (n) => Math.floor(next() * n),
    between: (a, b) => a + Math.floor(next() * (b - a + 1)),
  }
}

describe('phase', () => {
  it('runs, is counted, stays spendable for a day, then closes', () => {
    expect(phase(event, at(1))).toBe('running')
    expect(phase(event, at(49))).toBe('counting')
    expect(phase({ ...event, settled: true }, at(49))).toBe('finished')
    expect(phase({ ...event, settled: true }, at(72))).toBe('closed')
  })
})

describe('winnerOf and payouts', () => {
  it('picks the side with more damage, a tie or none', () => {
    expect(winnerOf({ madara: 5, hashirama: 3 })).toBe('madara')
    expect(winnerOf({ madara: 3, hashirama: 3 })).toBe('tie')
    expect(winnerOf({ madara: 0, hashirama: 0 })).toBe('none')
  })
  it('pays the winners and each side’s top 3', () => {
    const { winnerSpins, topSpins } = P.rewards
    const fighters = [
      { characterId: 'm1', side: 'madara' as const, damage: 50 },
      { characterId: 'm2', side: 'madara' as const, damage: 40 },
      { characterId: 'm3', side: 'madara' as const, damage: 30 },
      { characterId: 'm4', side: 'madara' as const, damage: 20 },
      { characterId: 'm0', side: 'madara' as const, damage: 0 },
      { characterId: 'h1', side: 'hashirama' as const, damage: 10 },
    ]
    const spins = payouts(fighters, 'madara')
    expect(spins.get('m1')).toBe(winnerSpins + topSpins[0])
    expect(spins.get('m3')).toBe(winnerSpins + topSpins[2])
    expect(spins.get('m4')).toBe(winnerSpins)
    expect(spins.get('m0')).toBeUndefined()
    expect(spins.get('h1')).toBe(topSpins[0])
    expect(payouts(fighters, 'tie').get('h1')).toBe(winnerSpins + topSpins[0])
  })
})

describe('leaderFighter', () => {
  it('is never beaten by an equal ninja, who still takes a good part of its HP', () => {
    const gear = { minAttack: 500, maxAttack: 600, hp: 2000, defense: 100 }
    for (const side of ['madara', 'hashirama'] as const) {
      let share = 0
      const seeds = 6
      for (let seed = 1; seed <= seeds; seed++) {
        const player = playerFighterFrom(
          {
            name: 'P',
            avatarId: outfitForClothing(3).avatarId,
            gender: 0,
            level: 50,
            hp: 1e9,
            mp: 1e9,
            nation: seed % 5,
          },
          [],
          gear,
        )
        const leader = leaderFighter(side, 50, gear)
        const replay = simulateFight({ attackers: [player], defenders: [leader], seed })
        expect(replay.winner).toBe('defenders')
        share +=
          (leader.maxHp - replay.fighters.find((f) => f.side === 'defenders')!.hp) / leader.maxHp
      }
      expect(share / seeds).toBeGreaterThan(0.2)
      expect(share / seeds).toBeLessThan(0.8)
    }
  })
})

describe('the Fortune Wheel', () => {
  const won = {}
  it('lists rewards that are real items', () => {
    const all: WheelReward[] = [
      ...P.wheel.pools.flatMap((pool): readonly WheelReward[] => pool.rewards),
      ...P.wheel.mystery,
      ...Object.values(P.wheel.grand),
    ]
    for (const reward of all) if (reward.itemId) expect(item(reward.itemId)).toBeDefined()
  })
  it('refuses duplicates, unknown rewards, two Uniques and rewards at their limit', () => {
    expect(selectionError(['x-hp', 'x-mp', null], won)).toBeNull()
    expect(selectionError(['x-hp', 'x-hp', 'x-mp'], won)).toMatch(/different/)
    expect(selectionError(['x-hp', 'nope', 'x-mp'], won)).toMatch(/not on this wheel/)
    expect(selectionError(['u-wing', 'u-kyuubi', 'x-mp'], won)).toMatch(/one Unique/)
    expect(selectionError(['u-wing', 'x-hp', 'x-mp'], { 'u-wing': 1 })).toMatch(/as often/)
  })
  it('has 8 slices adding up to 100%, the grand prize by side and gone once won', () => {
    const slices = segments(['x-hp', 'u-wing', 'x-gem'], 'madara', won)
    expect(slices.map((s) => s.kind)).toEqual([
      'choice',
      'mystery',
      'choice',
      'mystery',
      'grand',
      'mystery',
      'choice',
      'mystery',
    ])
    expect(slices.reduce((sum, s) => sum + s.chance, 0)).toBeCloseTo(100)
    expect(slices[0]!.chance).toBe(P.wheel.choiceChance.common)
    expect(slices[4]!.reward!.itemId).toBe('i290170')
    expect(segments([null, null, null], null, won)[4]!.reward!.itemId).toBe('i290188')
    expect(segments([null, null, null], 'madara', { 'grand-madara': 1 })[4]!.chance).toBe(0)
  })
  it('lands by chance and picks a mystery reward evenly', () => {
    const slices = segments(['x-hp', 'x-mp', 'x-exp'], 'hashirama', won)
    expect(landing(slices, 0)).toBe(0)
    expect(landing(slices, 0.2)).toBe(1)
    expect(landing(slices, 0.9999)).toBe(7)
    const mystery = spin(slices, fixed(0.25, 0))
    expect(mystery.winningIndex).toBe(1)
    expect(mystery.reward.id).toBe(P.wheel.mystery[0]!.id)
    expect(spin(slices, fixed(0.05)).reward.id).toBe('x-hp')
    expect(spin(slices, createRandom(3))).toEqual(spin(slices, createRandom(3)))
  })
  it('knows every reward a spin could give', () => {
    const ids = possibleRewards(['x-hp', null, 'u-wing'], 'madara').map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['grand-madara', 'x-hp', 'u-wing', 'm-spin']))
  })
})
