// The card flip after a toll gate clear (J/CloneSceneModule/TGCardSystem.java).
import type { Random } from '../random.js'
import { refuse } from './errors.js'

export const CARD_COUNT = 5
export const CARD_NONE = 0
export const CARD_DEALT = 1
export const CARD_SHOWN = 2
export const CARD_SHUFFLED = 3
export type CardState = 0 | 1 | 2 | 3

export interface CardLibRow {
  ItemConfig: string
  Probability: number
  BindingStatus: number
}
export interface CardConfig {
  DropId: number
  LookAddMul: number
  LookCap0: number
  LookCap1: number
  LookCap2: number
  LookCap3: number
  LookCap4: number
}
export interface Card {
  itemId: string
  count: number
  bound: boolean
  revealed: boolean
}
export interface CardFlip {
  state: CardState
  cards: Card[]
  peeks: number
}

function rollCard(lib: CardLibRow[], random: Random): Card {
  const total = lib.reduce((sum, row) => sum + Math.max(0, row.Probability), 0)
  let roll = random.int(total)
  const row =
    lib.find((entry) => (roll -= Math.max(0, entry.Probability)) < 0) ?? lib[lib.length - 1]!
  return { itemId: row.ItemConfig, count: 1, bound: row.BindingStatus === 1, revealed: false }
}

/** DealCard: five independent weighted rolls, face down. */
export function dealCards(lib: CardLibRow[], random: Random): CardFlip {
  if (lib.length === 0) refuse('no_cards', 'This toll gate has no cards.')
  return {
    state: CARD_DEALT,
    cards: Array.from({ length: CARD_COUNT }, () => rollCard(lib, random)),
    peeks: 0,
  }
}

const requireDealt = (flip: CardFlip) => {
  if (flip.state === CARD_NONE) refuse('no_cards', 'There are no cards to flip.')
}

/** Show all (ShowAllCap): every card face up. */
export function showAll(flip: CardFlip): CardFlip {
  requireDealt(flip)
  if (flip.state === CARD_SHOWN) refuse('cards_shown', 'The cards are already face up.')
  return { ...flip, state: CARD_SHOWN, cards: flip.cards.map((c) => ({ ...c, revealed: true })) }
}

/** Shuffle (only after show all): each slot swaps with a random slot, all face down. */
export function shuffleCards(flip: CardFlip, random: Random): CardFlip {
  if (flip.state !== CARD_SHOWN) refuse('cards_hidden', 'Show all cards before shuffling.')
  const cards = flip.cards.map((c) => ({ ...c, revealed: false }))
  for (let i = 0; i < cards.length; i++) {
    const j = random.int(cards.length)
    ;[cards[i], cards[j]] = [cards[j]!, cards[i]!]
  }
  return { ...flip, state: CARD_SHUFFLED, cards }
}

/** Re-deal (ExchangeCap): five new cards, face down, peeks counted afresh. */
export function redeal(flip: CardFlip, lib: CardLibRow[], random: Random): CardFlip {
  requireDealt(flip)
  return dealCards(lib, random)
}

/** n-th peek costs LookCap(n-1); after a shuffle `+ (int)(cost * LookAddMul / 100)`. */
export function peekCost(config: CardConfig, peeks: number, state: CardState) {
  if (peeks < 0 || peeks >= CARD_COUNT) return null
  const cost = Number(config[`LookCap${peeks}` as keyof CardConfig])
  return state === CARD_SHUFFLED ? cost + Math.trunc((cost * config.LookAddMul) / 100) : cost
}

export function peekCard(flip: CardFlip, index: number): CardFlip {
  requireDealt(flip)
  if (flip.state === CARD_SHOWN) refuse('cards_shown', 'The cards are already face up.')
  if (flip.peeks >= CARD_COUNT) refuse('peek_limit', 'You cannot peek at any more cards.')
  const card = flip.cards[index]
  if (!card) refuse('no_card', 'There is no such card.')
  if (card!.revealed) refuse('card_revealed', 'That card is already face up.')
  return {
    ...flip,
    peeks: flip.peeks + 1,
    cards: flip.cards.map((c, i) => (i === index ? { ...c, revealed: true } : c)),
  }
}

/** Take: any state after the deal, so a blind pick is free. */
export function takeCard(flip: CardFlip, index: number): Card {
  requireDealt(flip)
  const card = flip.cards[index]
  if (!card) refuse('no_card', 'There is no such card.')
  return card!
}

/** Leaving (disconnect in the original) grants a random card. */
export const randomCardIndex = (random: Random) => random.int(CARD_COUNT)
