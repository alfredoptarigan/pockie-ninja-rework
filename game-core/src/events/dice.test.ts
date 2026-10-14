import { describe, expect, it } from 'vitest'
import { createRandom } from '../random.js'
import { diceTier, rollDice } from './dice.js'

describe('diceTier', () => {
  it.each([
    [-6, 80202],
    [-4, 80202],
    [-3, 80201],
    [-2, 80201],
    [-1, null],
    [0, null],
    [1, null],
    [2, 80101],
    [3, 80101],
    [4, 80102],
    [6, 80102],
  ])('maps net %i to buff %s', (net, buffId) => {
    expect(diceTier(net)).toBe(buffId)
  })
})

describe('rollDice', () => {
  it('rolls all six faces at their random boundaries', () => {
    const values = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]
    let calls = 0
    expect(rollDice(() => values[calls++]!)).toEqual({
      dice: [1, 2, 3, 4, 5, 6],
      net: 0,
      buffId: null,
    })
    expect(calls).toBe(6)
  })

  it('replays seeded rolls and reaches all five reward tiers', () => {
    const tiers = new Set<number | null>()
    for (let seed = 0; seed < 1000; seed++) {
      const a = createRandom(seed)
      const b = createRandom(seed)
      const result = rollDice(a.next)
      expect(result).toEqual(rollDice(b.next))
      expect(result.net).toBe(
        result.dice.filter((face) => face >= 5).length -
          result.dice.filter((face) => face <= 2).length,
      )
      tiers.add(result.buffId)
    }
    expect(tiers).toEqual(new Set([80102, 80101, null, 80201, 80202]))
  })
})
