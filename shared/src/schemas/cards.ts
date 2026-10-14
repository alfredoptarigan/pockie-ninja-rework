// Card Room (M6 decisions 27-30): GET /api/game/cards and POST /api/game/cards/collections/:id/claim.
import { z } from 'zod'
import type { Character } from './game.js'

export const cardCollectionParamsSchema = z.object({ id: z.coerce.number().int().min(1).max(10) })

export type CardRarity = 'GREEN' | 'BLUE' | 'PURPLE' | 'RED' | 'GOLD'

export interface CardEntry {
  id: number
  nameKey: string
  /** Copies owned; duplicates stack (decision 28). */
  count: number
}
export interface CardCollectionView {
  id: number
  nameKey: string
  rarity: CardRarity
  cards: CardEntry[]
  /** Distinct cards owned. */
  owned: number
  total: number
  /** Paid once when every card is owned (decision 30). */
  prize: { itemId: string; count: number }[]
  claimed: boolean
}
export interface CardsView {
  collections: CardCollectionView[]
}
export interface CardClaimResult extends CardsView {
  character: Character
}
