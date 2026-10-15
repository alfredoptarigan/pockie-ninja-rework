// Konoha Boutique rules: paylines, the bonus symbol, levels, Double Chance and the payout rate.
import { createRandom, type Random } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import type { BoutiqueSymbol } from '../../../../shared/src/schemas/konoha-boutique.js'
import { item } from '../../game/data.js'
import { BOUTIQUE_PLACEHOLDERS as P } from './config.js'
import { chestCoins, evaluate, guess, levelFor, maxBet, rollPieces } from './rules.js'

/** 15 pieces of `fill`, with `cells` (row * 5 + reel) set to other symbols. */
const board = (fill: BoutiqueSymbol, cells: Record<number, BoutiqueSymbol> = {}) =>
  Array.from({ length: 15 }, (_, i) => cells[i] ?? fill)

const fixed = (value: number): Random => ({
  next: () => value,
  int: (n) => Math.floor(value * n),
  between: (min, max) => min + Math.floor(value * (max - min + 1)),
})

describe('evaluate', () => {
  it('pays 3 in a row from reel 1 on the middle line', () => {
    // Middle row j j j q q, everything else alternating so no other line matches.
    const pieces = board('pic1', { 5: 'j', 6: 'j', 7: 'j', 8: 'q', 9: 'q', 0: 'k', 10: 'a' })
    const { winningLines, coins, winningPieces } = evaluate(pieces, 2, 2)
    expect(winningLines).toEqual([1])
    expect(winningPieces).toEqual([5, 6, 7])
    expect(coins).toBe(2 * P.values.j * 3)
  })

  it('pays x10 and x50 for 4 and 5 in a row and only counts the first `lines` lines', () => {
    const all = board('pic4')
    expect(evaluate(all, 1, 1).coins).toBe(P.values.pic4 * 50)
    expect(evaluate(all, 25, 1).winningLines).toHaveLength(25)
    const four = board('pic4', { 4: 'j' })
    expect(evaluate(four, 1, 1).coins).toBe(P.values.pic4 * 10)
  })

  it('never pays a line of bonus symbols but starts a Bonus Round with three anywhere', () => {
    const pieces = board('pic5')
    const result = evaluate(pieces, 25, 1)
    expect(result.coins).toBe(0)
    expect(result.bonus).toBe(true)
    const two = board('j', { 0: 'pic5', 14: 'pic5' })
    expect(evaluate(two, 1, 1).bonus).toBe(false)
  })
})

describe('levels', () => {
  it('follow the EXP table and cap the bet', () => {
    expect(levelFor(0)).toBe(1)
    expect(levelFor(999)).toBe(1)
    expect(levelFor(1_000)).toBe(2)
    expect(levelFor(10_000_000)).toBe(10)
    expect(maxBet(1)).toEqual({ multiplier: 1, lines: 5 })
    expect(maxBet(10)).toEqual({ multiplier: 10, lines: 25 })
  })
})

describe('chests and Double Chance', () => {
  it('pays a chest the bet times a multiplier', () => {
    expect(chestCoins(10, fixed(0))).toBe(10)
    expect(chestCoins(10, fixed(0.99))).toBe(50)
  })

  it('wins when the picked box beats the number the way the operator asks', () => {
    expect(guess(0, 5, 'higher', fixed(0.99))).toMatchObject({ picked: 9, won: true })
    expect(guess(0, 5, 'lower', fixed(0.99))).toMatchObject({ picked: 9, won: false })
    expect(guess(3, 5, 'higher', fixed(0.5)).won).toBe(false) // 5 is not higher than 5
  })
})

describe('placeholders', () => {
  it('sell items that exist', () => {
    for (const reward of P.rewards) expect(item(reward.itemId), reward.itemId).toBeTruthy()
  })

  it('pay back less than the bet over many spins (lines and chests)', () => {
    const random = createRandom(11)
    let bet = 0
    let won = 0
    for (let i = 0; i < 40_000; i++) {
      const result = evaluate(rollPieces(random), 25, 1)
      bet += 25
      won += result.coins
      if (result.bonus) for (let c = 0; c < 3; c++) won += chestCoins(25, random)
    }
    expect(won / bet).toBeGreaterThan(0.7)
    expect(won / bet).toBeLessThan(1)
  })
})
