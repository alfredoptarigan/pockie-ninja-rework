// Festival Shop (reborn-windows-A-L.md "Festival Shop", Reborn's Xmas "Christmas Shop"): the
// Festival Tokens balance top right, eight 105x190 cards a page (name, icon with xN and its
// tooltip, price with "(purchased/limit)"), "Redeem" / "Sold Out", and the confirm "Buy {name} for
// {cost} Tokens?". The server prices everything (server/src/modules/festival-shop).
// ponytail: Reborn's token icon (events/christmas/token.png) is not exported, so the balance and
// prices read "Tokens"; export it with the Xmas event art when that event is built.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  FestivalOfferView,
  FestivalShopBuyResult,
  FestivalShopView,
} from '../../../../shared/src/schemas/festival-shop'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { itemName } from '../explore'
import { Prompt } from '../Prompt'
import { CardGrid, ShopCard } from '../shop/parts'
import { Dialog, Notice } from '../skin'
import { showToast } from '../toast'

export const festivalShopKey = ['game', 'festival-shop'] as const
const PATH = '/api/game/festival-shop'
const SOLD_OUT = '#c0392b'

export function FestivalShopWindow({ onClose }: { onClose: () => void }) {
  const view = useQuery({ queryKey: festivalShopKey, queryFn: () => api<FestivalShopView>(PATH) })
  const [asking, setAsking] = useState<FestivalOfferView | null>(null)
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const buy = useMutation({
    mutationFn: (index: number) =>
      api<FestivalShopBuyResult>(`${PATH}/buy`, { method: 'POST', body: { index } }),
    onSuccess: (result) => {
      queryClient.setQueryData(festivalShopKey, result.shop)
      apply(result)
      showToast('Purchase successful!', 'success')
    },
    onError: (error) => showToast(errorMessage(error) || 'Failed to purchase', 'failure'),
  })
  const tokens = view.data?.tokens ?? 0
  return (
    <Dialog title="Festival Shop" onClose={onClose} className="w-[480px]">
      <div className="flex flex-col gap-[6px]">
        <div className="flex justify-end">
          <span
            role="group"
            aria-label="Balance"
            title="Festival Tokens"
            className="game-text-box flex h-[30px] w-[100px] items-center justify-center text-[11px]"
          >
            {view.data ? `${tokens.toLocaleString('en-US')} Tokens` : '...'}
          </span>
        </div>
        {view.error && <Notice tone="error">{errorMessage(view.error)}</Notice>}
        <CardGrid
          label="Festival wares"
          items={view.data?.offers ?? []}
          empty={view.isPending ? 'Loading...' : 'No wares.'}
          card={(offer) => {
            const soldOut = offer.purchased >= offer.limit
            return (
              <ShopCard
                key={offer.index}
                itemId={offer.itemId}
                count={offer.amount}
                info={offer.info}
                lines={
                  <span>
                    {offer.cost.toLocaleString('en-US')} Tokens{' '}
                    <span style={{ color: soldOut ? SOLD_OUT : undefined }}>
                      ({offer.purchased}/{offer.limit})
                    </span>
                  </span>
                }
                button={
                  soldOut
                    ? 'Sold Out'
                    : buy.isPending && buy.variables === offer.index
                      ? '...'
                      : 'Redeem'
                }
                buttonLabel={`Redeem ${itemName(offer.itemId)}`}
                disabled={soldOut || tokens < offer.cost || buy.isPending}
                onClick={() => setAsking(offer)}
              />
            )
          }}
        />
      </div>
      {asking && (
        <Prompt
          message={`Buy ${itemName(asking.itemId)} for ${asking.cost} Tokens?`}
          acceptLabel="Confirm"
          denyLabel="Cancel"
          onAccept={() => {
            buy.mutate(asking.index)
            setAsking(null)
          }}
          onClose={() => setAsking(null)}
        />
      )}
    </Dialog>
  )
}
