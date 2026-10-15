// Shichibukai rules: Reborn's boards, movement, landing events, card costs, the unlock rule and the
// boss curve.
import { createRandom, simulateFight } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { floorUnlocked } from '../../../../shared/src/schemas/shichibukai.js'
import { playerFighterFrom } from '../../game/combat.js'
import { outfitForClothing } from '../../game/data.js'
import { boardOf, layEvents, rollsFor, walk } from './board.js'
import { SHICHIBUKAI_PLACEHOLDERS as P } from './config.js'
import { bossRewards, enterFloor, floorBossFighter, land, peekCost, type Run } from './rules.js'

const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/** A floor-1 run whose tile 1 holds `event` and every other tile is empty. */
function runWith(event: number, values: Partial<Run> = {}): Run {
  const run = enterFloor(1, 2, createRandom(1))
  return { ...run, events: run.events.map((_, i) => (i === 1 ? event : 0)), ...values }
}

describe('boards', () => {
  it('has Reborn’s 9 boards: the start reaches the boss, chests only on floors 1-3', () => {
    for (const floor of FLOORS) {
      const board = boardOf(floor)
      expect(board.reachesBoss.has(0)).toBe(true)
      expect(board.shortest).toBeGreaterThan(20)
      expect(rollsFor(floor)).toBeGreaterThanOrEqual(Math.ceil(board.shortest / 6))
      const events = layEvents(floor, createRandom(floor))
      expect(events[board.bossIndex]).toBe(9)
      expect(events[0]).toBe(0)
      expect(events.filter((e) => e === 5).length).toBe(floor <= 3 ? 1 : 0)
    }
  })

  it('a walk follows links, never enters a dead end and stops on the boss', () => {
    const random = createRandom(11)
    for (const floor of FLOORS) {
      const board = boardOf(floor)
      let pos = 0
      for (let roll = 0; roll < 200 && pos !== board.bossIndex; roll++) {
        const path = walk(board, pos, 6, random)
        for (let i = 1; i < path.length; i++) {
          expect(board.next[path[i - 1]!]).toContain(path[i])
          expect(board.reachesBoss.has(path[i]!)).toBe(true)
        }
        pos = path[path.length - 1]!
      }
      expect(pos).toBe(board.bossIndex)
      expect(walk(board, board.bossIndex, 6, random)).toEqual([board.bossIndex])
    }
  })
})

describe('landing', () => {
  const random = createRandom(5)

  it('fires an unvisited tile once', () => {
    const first = land(runWith(3), 1, random)
    expect(first.run.runPoints).toBe(P.tilePoints * 1 * 2)
    expect(first.steps).toEqual([{ index: 1, event: 3, text: '+20 pts' }])
    expect(first.run.visited).toContain(1)
    expect(land(first.run, 1, random).run.runPoints).toBe(first.run.runPoints)
  })

  it('blessing heals, curse and marauders hurt but never under the floor', () => {
    expect(land(runWith(1, { hpPct: 50, mpPct: 90 }), 1, random).run).toMatchObject({
      hpPct: 80,
      mpPct: 100,
    })
    expect(land(runWith(2, { hpPct: 15 }), 1, random).run.hpPct).toBe(P.minHpPct)
    const marauded = land(runWith(4), 1, random).run
    expect(marauded.hpPct).toBe(100 - P.marauderPct)
    expect(marauded.card).toMatchObject({ reason: 'monster', peeked: [], flipped: null })
    expect(marauded.card!.items).toHaveLength(5)
  })

  it('energy and snare change the rolls; a chest opens cards', () => {
    expect(land(runWith(6, { rollsLeft: 2 }), 1, random).run.rollsLeft).toBe(3)
    expect(land(runWith(7, { rollsLeft: 0 }), 1, random).run.rollsLeft).toBe(0)
    expect(land(runWith(5), 1, random).run.card?.reason).toBe('chest')
  })

  it('a whirlpool carries the ninja further on', () => {
    const swept = land(runWith(8), 1, random)
    expect(swept.run.pos).not.toBe(1)
    expect(swept.steps[0]).toMatchObject({ index: 1, event: 8 })
    expect(swept.run.visited).toContain(swept.run.pos)
  })

  it('reaching the boss tile stops for the boss fight', () => {
    const board = boardOf(1)
    expect(land(runWith(0), board.bossIndex, random).run.atBoss).toBe(true)
  })
})

describe('rules', () => {
  it('peeks cost 50k, 100k, 150k Stone, then none', () => {
    expect([0, 1, 2, 3].map(peekCost)).toEqual([50_000, 100_000, 150_000, null])
  })

  it('opens a floor once the previous floor and the easier difficulty have a star', () => {
    expect(floorUnlocked({}, 1, 1)).toBe(true)
    expect(floorUnlocked({}, 2, 1)).toBe(false)
    expect(floorUnlocked({ '1-1': 1 }, 2, 1)).toBe(true)
    expect(floorUnlocked({ '1-1': 1 }, 1, 2)).toBe(true)
    expect(floorUnlocked({ '1-1': 1, '2-1': 3 }, 2, 2)).toBe(false)
    expect(floorUnlocked({ '1-1': 1, '2-1': 3, '1-2': 1 }, 2, 2)).toBe(true)
  })

  it('pays more for a stronger boss', () => {
    const run = enterFloor(3, 2, createRandom(1))
    const weak = bossRewards(run, 50, 40)
    const strong = bossRewards(run, 150, 40)
    expect(strong.exp).toBeGreaterThan(weak.exp)
    expect(strong.points).toBeGreaterThan(weak.points)
    expect([weak.stars, strong.stars]).toEqual([1, 5])
  })

  it('the boss meets an equal level-30 ninja: Easy floor 1 is far easier than Nightmare floor 9', () => {
    const gear = { minAttack: 200, maxAttack: 250, hp: 800, defense: 40 }
    const winRate = (floor: number, difficulty: number, power: 50 | 100 | 150) => {
      let wins = 0
      const seeds = 12
      for (let seed = 1; seed <= seeds; seed++) {
        const player = playerFighterFrom(
          {
            name: 'P',
            avatarId: outfitForClothing(3).avatarId,
            gender: 0,
            level: 30,
            hp: 1e9,
            mp: 1e9,
            nation: seed % 5,
          },
          [],
          gear,
        )
        const boss = floorBossFighter({ floor, difficulty }, power, 30, gear)
        if (simulateFight({ attackers: [player], defenders: [boss], seed }).winner === 'attackers')
          wins++
      }
      return wins / seeds
    }
    expect(floorBossFighter({ floor: 1, difficulty: 1 }, 100, 20, {})).toMatchObject({ level: 30 })
    expect(winRate(1, 1, 100)).toBeGreaterThan(0.7)
    expect(winRate(9, 4, 150)).toBeLessThan(0.2)
  })
})
