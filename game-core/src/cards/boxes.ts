import type { Random } from '../random.js'
import {
  CARD_BOX_ITEMS,
  CARD_BOX_SOURCES,
  CARD_COLLECTIONS,
  cardIdsOf,
  type CardBoxSource,
  type CardRarity,
} from './constants.js'

/** Decision 28: one card, uniform over the cards of every collection of that rarity. */
export function openBox(rarity: CardRarity, random: Random): number {
  const cards = CARD_COLLECTIONS.filter((c) => c.rarity === rarity).flatMap(cardIdsOf)
  return cards[random.int(cards.length)]!
}

/** Decision 29: the box item a source drops, or null when the roll misses. */
export function rollCardBox(source: CardBoxSource, random: Random): string | null {
  const { rarity, chance } = CARD_BOX_SOURCES[source]
  return random.next() < chance ? CARD_BOX_ITEMS[rarity] : null
}
