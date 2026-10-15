// Sannin Test rules: dice, Change Luck, Perfect, rewards, the title path and the examiner's curve.
import { createRandom, simulateFight } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { playerFighterFrom } from '../../game/combat.js'
import { outfitForClothing } from '../../game/data.js'
import { maxRank, rankHp } from '../../game/sannin.js'
import { SANNIN_PLACEHOLDERS as P } from './config.js'
import {
  changeLuck,
  examinerFighter,
  ninjaCount,
  pendingOf,
  perfectDice,
  rewardOf,
  rollDice,
} from './rules.js'

describe('dice', () => {
  it('rolls six faces from 1 to 6 and counts the Ninja dice (face 1)', () => {
    const random = createRandom(7)
    for (let i = 0; i < 50; i++) {
      const dice = rollDice(random)
      expect(dice).toHaveLength(6)
      expect(dice.every((face) => face >= 1 && face <= 6)).toBe(true)
    }
    expect(ninjaCount([1, 1, 3, 4, 1, 6])).toBe(3)
    expect(pendingOf([1, 2, 3, 4, 5, 6])).toEqual({ dice: [1, 2, 3, 4, 5, 6], ninjaCount: 1 })
  })

  it('Change Luck keeps the Ninja dice and rerolls the rest', () => {
    const random = createRandom(3)
    for (let i = 0; i < 30; i++) {
      const changed = changeLuck([1, 2, 1, 5, 6, 3], random)
      expect(changed[0]).toBe(1)
      expect(changed[2]).toBe(1)
      expect(ninjaCount(changed)).toBeGreaterThanOrEqual(2)
    }
  })

  it('Perfect makes six Ninja dice, the best reward', () => {
    expect(perfectDice()).toEqual([1, 1, 1, 1, 1, 1])
    expect(rewardOf(perfectDice(), 60)).toEqual({
      experience: P.expPerLevel[6] * 60,
      growthPoints: P.growthPoints[6],
    })
    expect(rewardOf([2, 3, 4, 5, 6, 2], 60).growthPoints).toBe(P.growthPoints[0])
  })
})

describe('title path', () => {
  it('starts at rank 0 without HP and grows with each rank', () => {
    expect(rankHp(0)).toBe(0)
    for (let rank = 1; rank <= maxRank; rank++) {
      expect(rankHp(rank)).toBeGreaterThan(rankHp(rank - 1))
      expect(P.rankBonuses[rank]!.requiredPoints).toBeGreaterThan(
        P.rankBonuses[rank - 1]!.requiredPoints,
      )
    }
    expect(rankHp(maxRank + 5)).toBe(rankHp(maxRank))
  })

  it('the examiner meets an equal level-60 ninja: early ranks are easier than the last', () => {
    const gear = { minAttack: 450, maxAttack: 550, hp: 1800, defense: 90 }
    const winRate = (rank: number) => {
      let wins = 0
      const seeds = 12
      for (let seed = 1; seed <= seeds; seed++) {
        const player = playerFighterFrom(
          {
            name: 'P',
            avatarId: outfitForClothing(3).avatarId,
            gender: 0,
            level: 60,
            hp: 1e9,
            mp: 1e9,
            nation: seed % 5,
          },
          [],
          gear,
        )
        const replay = simulateFight({
          attackers: [player],
          defenders: [examinerFighter(rank, 60, gear)],
          seed,
        })
        if (replay.winner === 'attackers') wins++
      }
      return wins / seeds
    }
    expect(examinerFighter(1, 50, {})).toMatchObject({ level: 60 })
    expect(winRate(1)).toBeGreaterThan(0.6)
    expect(winRate(maxRank)).toBeLessThan(0.45)
  })
})
