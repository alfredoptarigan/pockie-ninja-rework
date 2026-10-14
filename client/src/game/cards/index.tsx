// Card Room (M6 decisions 27-30): 10 collection pages with card art, progress and the prize claim.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  CardClaimResult,
  CardCollectionView,
  CardsView,
} from '../../../../shared/src/schemas/cards'
import collections from '../../generated/reborn-cards.json'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { itemName } from '../explore'
import { Dialog, GameButton, Notice } from '../skin'

export const cardsKey = ['game', 'cards'] as const
/** Card art by card id (client/src/generated/reborn-cards.json). */
const CARD_ART = new Map(collections.flatMap((c) => c.cards.map((card) => [card.id, card.image])))
export const cardArt = (id: number) => CARD_ART.get(id)
const text = (key: string, fallback: string) => (names as Record<string, string>)[key] ?? fallback
const RARITY_NAMES = {
  GREEN: 'Green',
  BLUE: 'Blue',
  PURPLE: 'Purple',
  RED: 'Red',
  GOLD: 'Gold',
} as const

// M6 items are not in the generated 2011 item names yet; reborn.json has them.
const prizeName = (itemId: string) => text(`lg_reborn_item_${itemId.slice(1)}`, itemName(itemId))
const prizeText = (collection: CardCollectionView) =>
  collection.prize
    .map(({ itemId, count }) => `${count > 1 ? `${count} x ` : ''}${prizeName(itemId)}`)
    .join(', ')

export function CardRoomWindow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('')
  const cards = useQuery({ queryKey: cardsKey, queryFn: () => api<CardsView>('/api/game/cards') })
  const claim = useMutation({
    mutationFn: (id: number) =>
      api<CardClaimResult>(`/api/game/cards/collections/${id}/claim`, { method: 'POST' }),
    onSuccess: (result, id) => {
      const claimed = result.collections.find((c) => c.id === id)
      setMessage(claimed ? `Prize claimed: ${prizeText(claimed)}.` : '')
      queryClient.setQueryData(cardsKey, result)
      apply(result)
    },
  })
  const collection = cards.data?.collections.find((c) => c.id === page)
  const error = cards.error ?? claim.error
  return (
    <Dialog title="Card Room" onClose={onClose} className="game-window-bare w-[640px]">
      <div className="game-inset flex flex-col gap-2 p-[10px] font-game text-[12px] text-black">
        {cards.isPending && <p>Loading cards...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {cards.data && (
          <nav aria-label="Collections" className="flex flex-wrap gap-1">
            {cards.data.collections.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === page}
                onClick={() => {
                  setPage(c.id)
                  setMessage('')
                }}
                className={`game-card px-2 py-0.5 text-[11px] ${
                  c.id === page ? 'outline-2 outline-[#c98a1a]' : ''
                }`}
              >
                {text(c.nameKey, `Collection ${c.id}`)} ({c.owned}/{c.total})
              </button>
            ))}
          </nav>
        )}
        {collection && (
          <section
            aria-label={text(collection.nameKey, `Collection ${collection.id}`)}
            className="flex flex-col gap-2"
          >
            <h3 className="font-bold">
              {text(collection.nameKey, `Collection ${collection.id}`)} -{' '}
              {RARITY_NAMES[collection.rarity]} - {collection.owned}/{collection.total} cards
            </h3>
            <ul aria-label="Cards" className="grid grid-cols-6 gap-2">
              {collection.cards.map((card) => (
                <li
                  key={card.id}
                  className={`game-card flex flex-col items-center gap-0.5 p-1 text-center text-[11px] ${
                    card.count ? '' : 'opacity-40 grayscale'
                  }`}
                >
                  <img src={cardArt(card.id)} alt="" className="h-[72px] w-auto" />
                  <span>{text(card.nameKey, `Card ${card.id}`)}</span>
                  <span>{card.count ? `x${card.count}` : 'Missing'}</span>
                </li>
              ))}
            </ul>
            <p>Prize: {prizeText(collection)}</p>
            <GameButton
              disabled={
                claim.isPending || collection.claimed || collection.owned < collection.total
              }
              onClick={() => claim.mutate(collection.id)}
            >
              {collection.claimed ? 'Prize claimed' : 'Claim prize'}
            </GameButton>
          </section>
        )}
        {message && <Notice>{message}</Notice>}
      </div>
      <div className="mt-[10px] flex justify-end">
        <GameButton onClick={onClose}>Close</GameButton>
      </div>
    </Dialog>
  )
}
