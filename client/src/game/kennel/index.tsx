import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { KennelShopView, TracingView } from '../../../../shared/src/schemas/kennel'
import { api } from '../../lib/api'
import { errorMessage, gameKeys } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { plainText } from '../text'

const tracingKey = ['game', 'kennel', 'tracing'] as const
const shopKey = ['game', 'kennel', 'shop'] as const
const DIRECTIONS = {
  N: 'North',
  NE: 'Northeast',
  E: 'East',
  SE: 'Southeast',
  S: 'South',
  SW: 'Southwest',
  W: 'West',
  NW: 'Northwest',
}
const ANGLES = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }

function useKennelAction<T>(key: readonly string[], path: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: ({ action, body }: { action: string; body: object }) =>
      api<T>(`/api/game/kennel/${path}/${action}`, { method: 'POST', body }),
    onSuccess: (result) => {
      cache.setQueryData(key, result)
      void cache.invalidateQueries({
        queryKey: gameKeys.all,
        predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(key),
      })
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: key })
    },
  })
}

export function PetTracingWindow({ onClose }: { onClose: () => void }) {
  const view = useQuery({
    queryKey: tracingKey,
    queryFn: () => api<TracingView>('/api/game/kennel/tracing'),
  })
  const action = useKennelAction<TracingView>(tracingKey, 'tracing')
  const data = view.data
  const error = action.error ?? view.error
  const reward = action.data?.reward
  return (
    <Dialog title="Pet Tracing" onClose={onClose} className="w-[440px]">
      <div className="flex flex-col gap-3 text-xs text-black">
        {view.isPending && <p>Loading Pet Tracing...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {data && (
          <>
            <p>
              Attempts left today: {data.attemptsLeft}. Feathers: {data.feathers}.
            </p>
            <p>
              Follow the arrows to find the hidden pet. A miss earns 1 Feather; a find earns 10
              Feathers with a 5% chance of a pet item. Each find starts a new board.
            </p>
            <div aria-label="Pet Tracing board" className="mx-auto grid w-72 grid-cols-3 gap-2">
              {data.cells.map((direction, cell) => (
                <button
                  key={`${data.boardId}-${cell}`}
                  type="button"
                  aria-label={`Cell ${cell + 1}${direction ? `: ${DIRECTIONS[direction]}` : ': face down'}`}
                  disabled={action.isPending || data.attemptsLeft === 0 || direction !== null}
                  onClick={() =>
                    action.mutate({ action: 'flip', body: { boardId: data.boardId, cell } })
                  }
                  className="game-slot grid aspect-square place-items-center p-2 font-bold disabled:cursor-default"
                >
                  {direction ? (
                    <svg aria-hidden="true" viewBox="0 0 40 40" className="size-10">
                      <path
                        d="M20 33V7M9 18L20 7L31 18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        transform={`rotate(${ANGLES[direction]} 20 20)`}
                      />
                    </svg>
                  ) : (
                    <span className="text-2xl">?</span>
                  )}
                </button>
              ))}
            </div>
            {reward && !error && (
              <p role="status">
                {reward.feathers === 10 ? 'Pet found! ' : ''}You received {reward.feathers}{' '}
                {reward.feathers === 1 ? 'Feather' : 'Feathers'}.
                {reward.petItem ? ' A pet item was added to your bag.' : ''}
              </p>
            )}
            <GameButton
              disabled={action.isPending || !data.canBuy}
              onClick={() => action.mutate({ action: 'buy', body: { currency: 'gold' } })}
            >
              Buy 10 attempts (10 Gold)
            </GameButton>
            <p>
              10 free attempts and one paid refill each day. Resets at 00:00 UTC. Requires level 20.
            </p>
          </>
        )}
      </div>
    </Dialog>
  )
}

export function KennelShopWindow({ onClose }: { onClose: () => void }) {
  const view = useQuery({
    queryKey: shopKey,
    queryFn: () => api<KennelShopView>('/api/game/kennel/shop'),
  })
  const action = useKennelAction<KennelShopView>(shopKey, 'shop')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const error = action.error ?? view.error
  return (
    <Dialog title="Kennel Shop" onClose={onClose} className="w-[600px]">
      <div className="flex flex-col gap-2 text-xs text-black">
        {view.isPending && <p>Loading Kennel Shop...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {view.data && (
          <>
            <p>Feathers: {view.data.feathers}. Daily limits reset at 00:00 UTC.</p>
            <ul aria-label="Kennel shop offers" className="grid grid-cols-2 gap-2">
              {view.data.offers.map((offer) => {
                const count = counts[offer.itemId] ?? 1
                const remaining = offer.dailyLimit - offer.purchased
                const locked = view.data!.level < offer.level
                const name = plainText(offer.nameKey, offer.itemId)
                return (
                  <li key={offer.itemId} className="game-card flex flex-col gap-1 p-2">
                    <h3 className="font-bold">{name}</h3>
                    <p>
                      {offer.price} {offer.price === 1 ? 'Feather' : 'Feathers'} each. Level{' '}
                      {offer.level}.
                    </p>
                    <p>
                      Purchased today: {offer.purchased}/{offer.dailyLimit}.
                    </p>
                    <label className="flex items-center gap-2">
                      Quantity
                      <input
                        aria-label={`${name} quantity`}
                        type="number"
                        min={1}
                        max={Math.max(1, remaining)}
                        step={1}
                        value={count}
                        disabled={action.isPending || locked || remaining === 0}
                        onChange={(event) =>
                          setCounts({
                            ...counts,
                            [offer.itemId]: Math.max(
                              1,
                              Math.min(
                                Math.max(1, remaining),
                                Math.trunc(Number(event.target.value)) || 1,
                              ),
                            ),
                          })
                        }
                        className="w-16 border border-[#5c4a2a] bg-white p-1"
                      />
                    </label>
                    <GameButton
                      small
                      disabled={
                        action.isPending ||
                        locked ||
                        count > remaining ||
                        offer.price * count > view.data!.feathers
                      }
                      onClick={() =>
                        action.mutate({ action: 'buy', body: { itemId: offer.itemId, count } })
                      }
                    >
                      {locked
                        ? `Requires level ${offer.level}`
                        : remaining === 0
                          ? 'Daily limit reached'
                          : `Buy ${name} (${offer.price * count} Feathers)`}
                    </GameButton>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  )
}
