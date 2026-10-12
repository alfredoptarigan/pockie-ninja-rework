import { describe, expect, it } from 'vitest'
import { createRandom } from '../random.js'
import {
  CARD_DEALT,
  CARD_SHOWN,
  CARD_SHUFFLED,
  dealCards,
  peekCard,
  peekCost,
  randomCardIndex,
  redeal,
  showAll,
  shuffleCards,
  takeCard,
  type CardFlip,
} from './cards.js'

// TGCardConfig 100001.
const config = {
  DropId: 1001,
  LookAddMul: 138,
  LookCap0: 15,
  LookCap1: 23,
  LookCap2: 34,
  LookCap3: 51,
  LookCap4: 76,
}
const lib = [
  { ItemConfig: 'i1', Probability: 1, BindingStatus: 1 },
  { ItemConfig: 'i2', Probability: 0, BindingStatus: 0 },
  { ItemConfig: 'i3', Probability: 3, BindingStatus: 0 },
]
const dealt = (): CardFlip => dealCards(lib, createRandom(7))

describe('dealCards (TGCardSystem.DealCard)', () => {
  it('rolls five face-down cards from the weighted library', () => {
    const flip = dealt()
    expect(flip.state).toBe(CARD_DEALT)
    expect(flip.peeks).toBe(0)
    expect(flip.cards).toHaveLength(5)
    for (const card of flip.cards) {
      expect(['i1', 'i3']).toContain(card.itemId)
      expect(card.revealed).toBe(false)
      expect(card.bound).toBe(card.itemId === 'i1')
      expect(card.count).toBe(1)
    }
  })

  it('follows the weights', () => {
    const random = createRandom(1)
    const counts = { i1: 0, i3: 0 } as Record<string, number>
    for (let i = 0; i < 400; i++) {
      for (const card of dealCards(lib, random).cards) counts[card.itemId]! += 1
    }
    expect(counts.i3! / 2000).toBeGreaterThan(0.7)
    expect(counts.i3! / 2000).toBeLessThan(0.8)
  })
})

describe('peekCost (LookCap + LookAddMul)', () => {
  it('charges LookCap(n-1) for the n-th peek on a fresh deal', () => {
    expect([0, 1, 2, 3, 4].map((n) => peekCost(config, n, CARD_DEALT))).toEqual([
      15, 23, 34, 51, 76,
    ])
  })
  it('adds LookAddMul percent after a shuffle: 100001 first peek = 35', () => {
    expect(peekCost(config, 0, CARD_SHUFFLED)).toBe(35)
    expect(peekCost(config, 1, CARD_SHUFFLED)).toBe(23 + Math.trunc((23 * 138) / 100))
  })
  it('has no sixth peek', () => expect(peekCost(config, 5, CARD_DEALT)).toBeNull())
})

describe('card flip transitions', () => {
  it('show all reveals every card', () => {
    const shown = showAll(dealt())
    expect(shown.state).toBe(CARD_SHOWN)
    expect(shown.cards.every((c) => c.revealed)).toBe(true)
    expect(() => showAll(shown)).toThrow()
  })

  it('shuffle only follows show all and turns the same cards face down', () => {
    expect(() => shuffleCards(dealt(), createRandom(2))).toThrow()
    const shown = showAll(dealt())
    const shuffled = shuffleCards(shown, createRandom(2))
    expect(shuffled.state).toBe(CARD_SHUFFLED)
    expect(shuffled.cards.every((c) => !c.revealed)).toBe(true)
    const ids = (flip: CardFlip) => flip.cards.map((c) => c.itemId).sort()
    expect(ids(shuffled)).toEqual(ids(shown))
  })

  it('peek reveals one card and counts it; a revealed card cannot be peeked', () => {
    const peeked = peekCard(dealt(), 2)
    expect(peeked.peeks).toBe(1)
    expect(peeked.cards[2]!.revealed).toBe(true)
    expect(peeked.cards.filter((c) => c.revealed)).toHaveLength(1)
    expect(() => peekCard(peeked, 2)).toThrow()
    expect(() => peekCard(showAll(dealt()), 0)).toThrow()
  })

  it('re-deal draws five new cards, face down, and resets the peeks', () => {
    const again = redeal(peekCard(dealt(), 0), lib, createRandom(3))
    expect(again.state).toBe(CARD_DEALT)
    expect(again.peeks).toBe(0)
    expect(again.cards.every((c) => !c.revealed)).toBe(true)
  })

  it('take returns the chosen card in any state after the deal', () => {
    const flip = dealt()
    expect(takeCard(flip, 4)).toEqual(flip.cards[4])
    expect(() => takeCard({ state: 0, cards: [], peeks: 0 }, 0)).toThrow()
  })

  it('a random card index is one of the five', () => {
    const index = randomCardIndex(createRandom(9))
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(5)
  })
})
