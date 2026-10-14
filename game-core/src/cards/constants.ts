// Cards (m6-companions decisions 27-30). Collections and card ids mirror
// server/data/game/reborn/cards.json (a server test checks they match); prizes and odds are ours.

export type CardRarity = 'GREEN' | 'BLUE' | 'PURPLE' | 'RED' | 'GOLD'

export interface CardPrize {
  itemId: string
  count: number
}

export interface CardCollection {
  id: number
  rarity: CardRarity
  firstCard: number
  lastCard: number
  /** Paid once when every card of the collection is owned (decision 30). */
  prize: readonly CardPrize[]
}

const GREEN_PRIZE = [{ itemId: 'i218021', count: 3 }]
const BLUE_PRIZE = [
  { itemId: 'i218022', count: 2 },
  { itemId: 'i218050', count: 1 }, // Talisman of Luck [D]
]
const one = (itemId: string) => [{ itemId, count: 1 }]

export const CARD_COLLECTIONS: readonly CardCollection[] = [
  { id: 1, rarity: 'GREEN', firstCard: 1, lastCard: 7, prize: GREEN_PRIZE },
  { id: 2, rarity: 'GREEN', firstCard: 8, lastCard: 12, prize: GREEN_PRIZE },
  { id: 3, rarity: 'GREEN', firstCard: 13, lastCard: 21, prize: GREEN_PRIZE },
  { id: 4, rarity: 'BLUE', firstCard: 22, lastCard: 29, prize: BLUE_PRIZE },
  { id: 5, rarity: 'BLUE', firstCard: 30, lastCard: 37, prize: BLUE_PRIZE },
  // The only PURPLE collection takes the first of the 218009-218018 wings.
  { id: 6, rarity: 'PURPLE', firstCard: 38, lastCard: 46, prize: one('i218009') },
  { id: 7, rarity: 'RED', firstCard: 47, lastCard: 52, prize: one('i218200') },
  { id: 8, rarity: 'RED', firstCard: 53, lastCard: 59, prize: one('i218201') },
  { id: 9, rarity: 'RED', firstCard: 60, lastCard: 63, prize: one('i218202') },
  { id: 10, rarity: 'GOLD', firstCard: 64, lastCard: 74, prize: one('i218207') },
]

export const CARD_BOX_ITEMS: Readonly<Record<CardRarity, string>> = {
  GREEN: 'i171001',
  BLUE: 'i171002',
  PURPLE: 'i171003',
  RED: 'i171004',
  GOLD: 'i171005',
}

/** Box drop sources (decision 29); callers check the source's own condition first. */
export const CARD_BOX_SOURCES = {
  fieldWin: { rarity: 'GREEN', chance: 0.01 },
  pubFightWin: { rarity: 'BLUE', chance: 0.05 },
  /** Every 10th Las Noches floor cleared. */
  lasNochesTenthFloor: { rarity: 'RED', chance: 0.1 },
  /** The Tailed Beast 10-fight box. */
  tailedBeastBox: { rarity: 'PURPLE', chance: 1 },
  /** Team Stone weekly pay, leagues 7-8. */
  teamStoneWeekly: { rarity: 'GOLD', chance: 1 },
} as const satisfies Record<string, { rarity: CardRarity; chance: number }>

export type CardBoxSource = keyof typeof CARD_BOX_SOURCES

export const collectionOfCard = (cardId: number) =>
  CARD_COLLECTIONS.find((c) => cardId >= c.firstCard && cardId <= c.lastCard)

export const cardIdsOf = (collection: CardCollection) =>
  Array.from(
    { length: collection.lastCard - collection.firstCard + 1 },
    (_, i) => collection.firstCard + i,
  )
