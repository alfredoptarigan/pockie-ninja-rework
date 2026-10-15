// Impel Down rules and floors: drop tables, the crystal roll, Auto Sell and the difficulty curve.
import { simulateFight, type Random } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { crystalInfo } from '../../../../game-core/src/zanpakuto/zanpakuto.js'
import { refreshCost } from '../../../../shared/src/schemas/impel-down.js'
import { playerFighterFrom } from '../../game/combat.js'
import { outfitForClothing } from '../../game/data.js'
import { sumBonuses } from '../../game/nonfight-buffs.js'
import { BOSSES, bossFighter } from '../dungeons/bosses.js'
import { enemyLevel, floorBonuses, floorDrops, floorEnemy, floorExp, guaranteed } from './floors.js'
import { autoSells, rollCrystal, usedToday } from './rules.js'

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
const total = (drops: [number, number][]) => drops.reduce((sum, [, chance]) => sum + chance, 0)

describe('refreshCost', () => {
  it('is Reborn’s 1000 x (1 + refreshes + gate index) coupons', () => {
    expect(refreshCost(0, 0)).toBe(1000)
    expect(refreshCost(4, 5)).toBe(10_000)
    expect(refreshCost(2, 1)).toBe(4000)
  })
})

describe('floorDrops', () => {
  it('drops gate N’s crystal N of every weapon tab', () => {
    expect(floorDrops(0, 0).map(([iid]) => crystalInfo(iid)!.name)).toEqual([
      'Sharp Blue Crystal I',
      'Blunt Blue Crystal I',
      'Fist Blue Crystal I',
    ])
    expect(floorDrops(2, 0).every(([iid]) => crystalInfo(iid)!.position === 3)).toBe(true)
  })
  it('guarantees a crystal on every 5th floor and has better tiers there', () => {
    expect([4, 9, 14, 19, 24].every(guaranteed)).toBe(true)
    expect(guaranteed(0) || guaranteed(23)).toBe(false)
    expect(total(floorDrops(0, 0))).toBeLessThan(100)
    expect(total(floorDrops(0, 4))).toBeCloseTo(100, 1)
    expect(floorDrops(0, 4).some(([iid]) => crystalInfo(iid)!.category === 1)).toBe(true)
    expect(floorDrops(5, 24).some(([iid]) => crystalInfo(iid)!.category === 2)).toBe(true)
  })
})

describe('rollCrystal', () => {
  it('drops the row the roll lands in, or nothing past the floor’s chance', () => {
    const drops = floorDrops(0, 0)
    expect(rollCrystal(drops, false, fixed(0.01))).toBe(drops[0]![0])
    expect(rollCrystal(drops, false, fixed(0.99))).toBeNull()
  })
  it('always drops on a guaranteed floor, even at the top of the roll', () => {
    const drops = floorDrops(0, 4)
    expect(rollCrystal(drops, true, fixed(0.999999))).toBe(drops.at(-1)![0])
  })
})

describe('autoSells', () => {
  it('sells the selected tier and below; 0 sells nothing', () => {
    const [blue, purple, orange] = [480001, 480011, 480021]
    expect(autoSells(blue, 0)).toBe(false)
    expect(autoSells(blue, 1)).toBe(true)
    expect(autoSells(purple, 1)).toBe(false)
    expect(autoSells(purple, 2)).toBe(true)
    expect(autoSells(orange, 3)).toBe(true)
  })
})

describe('usedToday', () => {
  it('counts only on the same UTC day', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    expect(usedToday('2026-10-15', 2, now)).toBe(2)
    expect(usedToday('2026-10-14', 2, now)).toBe(0)
    expect(usedToday(null, 2, now)).toBe(0)
  })
})

describe('floors', () => {
  it('levels the enemy from the gate’s entry level and pays more EXP higher up', () => {
    expect(enemyLevel(0, 0)).toBe(61)
    expect(enemyLevel(0, 24)).toBe(70)
    expect(enemyLevel(5, 0)).toBe(90)
    expect(floorExp(0, 24)).toBeGreaterThan(floorExp(0, 0))
    expect(floorEnemy(0, 0, {})).toMatchObject({ level: 61 })
    // A challenger without a weapon still meets an armed enemy.
    expect(floorEnemy(0, 0, {}).maxAttack).toBeGreaterThan(0)
  })

  it('gets harder: an equal level-61 ninja wins floor 1 far more often than floor 25', () => {
    const gear = { minAttack: 500, maxAttack: 600, hp: 2000, defense: 100 }
    const winRate = (floor: number) => {
      let wins = 0
      for (const boss of BOSSES)
        for (const seed of [1, 2, 3]) {
          const player = playerFighterFrom(
            {
              name: 'P',
              avatarId: outfitForClothing(3).avatarId,
              gender: 0,
              level: 61,
              hp: 1e9,
              mp: 1e9,
              nation: seed,
            },
            [],
            gear,
          )
          const enemy = bossFighter(
            boss,
            enemyLevel(0, floor),
            sumBonuses(gear, floorBonuses(floor)),
          )
          const replay = simulateFight({ attackers: [player], defenders: [enemy], seed })
          if (replay.winner === 'attackers') wins++
        }
      return wins / (BOSSES.length * 3)
    }
    expect(winRate(0)).toBeGreaterThan(0.6)
    expect(winRate(24)).toBeLessThan(0.45)
  })
})
