import { describe, expect, it } from 'vitest'
import { createRandom, type Random } from '../random.js'
import { openBox, rollCardBox } from './boxes.js'
import {
  CARD_BOX_SOURCES,
  CARD_COLLECTIONS,
  collectionOfCard,
  type CardRarity,
} from './constants.js'

const fixed = (value: number): Random => ({
  next: () => value,
  int: (n) => Math.floor(value * n),
  between: (min, max) => min + Math.floor(value * (max - min + 1)),
})

describe('card collections (decision 27)', () => {
  it('numbers 74 cards 1-74 across 10 collections without gaps', () => {
    expect(CARD_COLLECTIONS).toHaveLength(10)
    let next = 1
    for (const collection of CARD_COLLECTIONS) {
      expect(collection.firstCard).toBe(next)
      next = collection.lastCard + 1
    }
    expect(next).toBe(75)
  })

  it('finds the collection of a card', () => {
    expect(collectionOfCard(1)?.id).toBe(1)
    expect(collectionOfCard(74)?.id).toBe(10)
    expect(collectionOfCard(75)).toBeUndefined()
  })
})

describe('openBox (decision 28)', () => {
  it.each<[CardRarity, number[]]>([
    ['GREEN', [1, 21]],
    ['BLUE', [22, 37]],
    ['PURPLE', [38, 46]],
    ['RED', [47, 63]],
    ['GOLD', [64, 74]],
  ])('gives a %s card from that rarity only', (rarity, [low, high]) => {
    expect(openBox(rarity, fixed(0))).toBe(low)
    expect(openBox(rarity, fixed(0.9999))).toBe(high)
  })

  it('is uniform over the cards of the rarity', () => {
    const random = createRandom(7)
    const counts = new Map<number, number>()
    for (let i = 0; i < 21_000; i++) {
      const card = openBox('GREEN', random)
      counts.set(card, (counts.get(card) ?? 0) + 1)
    }
    expect(counts.size).toBe(21)
    for (const count of counts.values()) expect(count).toBeGreaterThan(800)
  })
})

describe('rollCardBox (decision 29)', () => {
  it('drops the source box under its chance only', () => {
    expect(rollCardBox('fieldWin', fixed(0.0099))).toBe('i171001')
    expect(rollCardBox('fieldWin', fixed(0.01))).toBeNull()
    expect(rollCardBox('pubFightWin', fixed(0.04))).toBe('i171002')
    expect(rollCardBox('lasNochesTenthFloor', fixed(0.09))).toBe('i171004')
    expect(rollCardBox('lasNochesTenthFloor', fixed(0.1))).toBeNull()
  })

  it('always gives the guaranteed boxes', () => {
    expect(rollCardBox('tailedBeastBox', fixed(0.9999))).toBe('i171003')
    expect(rollCardBox('teamStoneWeekly', fixed(0.9999))).toBe('i171005')
  })

  it('matches the source odds on a seeded run', () => {
    const random = createRandom(42)
    const runs = 100_000
    for (const [source, { chance }] of Object.entries(CARD_BOX_SOURCES)) {
      let drops = 0
      for (let i = 0; i < runs; i++)
        if (rollCardBox(source as keyof typeof CARD_BOX_SOURCES, random)) drops++
      expect(Math.abs(drops / runs - chance)).toBeLessThan(0.005)
    }
  })
})
