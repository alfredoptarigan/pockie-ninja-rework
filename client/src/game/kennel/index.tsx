// Reborn's Pet Tracing (500x505) and Pet Shop (`ui__kennel_shop`, 480x540) windows
// (reborn-windows-M-Z-hud.md "Pet Tracing", reborn-windows-A-L.md "Pet Shop"). Our rules (M6)
// stay: Pet Tracing is a 3x3 board whose arrows point at the hidden pet, paid in Feathers; the
// shop sells for Feathers with daily limits.
// ponytail: Reborn's tracing powers, Daily Total / High Score, Holding / Into Pack, New Card and
// the 100 GC payment, and the shop's server categories, have no data in our game; add them with
// those systems.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { KennelShopView, TracingView } from '../../../../shared/src/schemas/kennel'
import { api } from '../../lib/api'
import { errorMessage, gameKeys } from '../api'
import { bigBg } from '../bloodlines/panels'
import { ConfirmDialog } from '../inventory/dialogs'
import { ItemIcon } from '../ItemIcon'
import { ItemMenu, menuAt } from '../ItemMenu'
import { Dialog, GameButton, Notice } from '../skin'
import { plainText } from '../text'
import { showToast } from '../toast'

const tracingKey = ['game', 'kennel', 'tracing'] as const
const shopKey = ['game', 'kennel', 'shop'] as const
const FEATHER = 'i150319'
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
const feathers = (count: number) => `${count} ${count === 1 ? 'Feather' : 'Feathers'}`
const ANGLES = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }
const BOARD_COLUMNS = 3
const ATTEMPT_PACK = 10
const ATTEMPT_PACK_GOLD = 10
const SHOP_PAGE = 8
const QUANTITIES = [1, 5, 10]

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

function Arrow({ direction }: { direction: keyof typeof ANGLES }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="size-12 text-[#7a2a0a]">
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
  )
}

export function PetTracingWindow({ onClose }: { onClose: () => void }) {
  const view = useQuery({
    queryKey: tracingKey,
    queryFn: () => api<TracingView>('/api/game/kennel/tracing'),
  })
  const action = useKennelAction<TracingView>(tracingKey, 'tracing')
  const [payment, setPayment] = useState<{ x: number; y: number } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const data = view.data
  const error = action.error ?? view.error
  const reward = action.data?.reward
  return (
    <Dialog title="Pet Tracing" onClose={onClose} className="game-window-bare w-[510px]">
      <div
        data-menu-root
        className="relative flex h-[505px] w-[500px] flex-col text-[12px] text-black"
      >
        <header className="relative h-[61px] w-[500px] shrink-0" style={bigBg(1)}>
          <span
            aria-label="Feathers"
            className="absolute top-[12px] left-[20px] flex items-center gap-1 text-[16px] font-black"
          >
            <ItemIcon itemId={FEATHER} name="Feather" className="size-9" />x{data?.feathers ?? 0}
          </span>
          <p className="absolute top-[12px] left-[155px] w-[330px] text-[11px] leading-[13px]">
            Flip a card. Its arrow points toward the hidden pet. A miss pays 1 Feather, a find 10
            Feathers with a 5% chance of a pet item, and starts a new board.
          </p>
        </header>
        <div className="flex">
          <section
            aria-label="Board"
            className="relative h-[440px] w-[335px] shrink-0"
            style={bigBg(1)}
          >
            {view.isPending && <p className="p-3">Loading Pet Tracing...</p>}
            {data && (
              <ul aria-label="Pet Tracing board">
                {data.cells.map((direction, cell) => (
                  <li
                    key={`${data.boardId}-${cell}`}
                    className="absolute"
                    style={{
                      left: 20 + 105 * (cell % BOARD_COLUMNS),
                      top: 10 + 135 * Math.floor(cell / BOARD_COLUMNS),
                    }}
                  >
                    <button
                      type="button"
                      aria-label={`Cell ${cell + 1}${direction ? `: ${DIRECTIONS[direction]}` : ': hidden'}`}
                      disabled={action.isPending || data.attemptsLeft === 0 || direction !== null}
                      onClick={() =>
                        action.mutate({ action: 'flip', body: { boardId: data.boardId, cell } })
                      }
                      className="grid h-[120px] w-[84px] place-items-center font-bold hover:not-disabled:brightness-110 disabled:cursor-default"
                      style={bigBg(5)}
                    >
                      {direction ? (
                        <Arrow direction={direction} />
                      ) : (
                        <span className="text-[34px] text-[#7a2a0a]">?</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            aria-label="Scoreboard"
            className="relative h-[440px] w-[160px] shrink-0"
            style={bigBg(1)}
          >
            <h3 className="game-title-plate absolute top-[10px] left-[10px] h-[20px] w-[140px] text-center leading-[20px] font-bold text-white">
              Scoreboard
            </h3>
            <dl className="absolute top-[40px] left-[15px] w-[130px]">
              <div className="flex justify-between border-b border-[#e2a72a] py-1">
                <dt>Remaining</dt>
                <dd className="font-bold">{data?.attemptsLeft ?? 0}</dd>
              </div>
              <div className="flex justify-between border-b border-[#e2a72a] py-1">
                <dt>Feathers</dt>
                <dd className="font-bold">{data?.feathers ?? 0}</dd>
              </div>
            </dl>
            <GameButton
              small
              className="absolute! top-[145px] left-[23px] h-[22px] w-[115px]"
              disabled={action.isPending || !data?.canBuy}
              onClick={(event) => setPayment(menuAt(event))}
            >
              Purchase More
            </GameButton>
            <p className="absolute top-[180px] left-[12px] w-[136px] text-[11px] leading-[13px]">
              10 free attempts a day, 10 more can be bought once. Resets daily at 00:00 UTC.
              Requires level 20.
            </p>
            <div className="absolute top-[260px] left-[10px] flex w-[140px] flex-col gap-1">
              {error && <Notice tone="error">{errorMessage(error)}</Notice>}
              {reward && !error && (
                <p role="status" className="text-[11px] font-bold">
                  {reward.feathers === 10 ? 'Pet found! ' : ''}You received{' '}
                  {feathers(reward.feathers)}.
                  {reward.petItem ? ' A pet item was added to your bag.' : ''}
                </p>
              )}
            </div>
          </section>
        </div>
        {payment && (
          <ItemMenu
            title="Choose payment:"
            at={payment}
            entries={[
              { label: `${ATTEMPT_PACK_GOLD} Gold`, onSelect: () => setConfirm(true) },
              { label: 'Cancel', onSelect: () => {} },
            ]}
            onClose={() => setPayment(null)}
          />
        )}
        {confirm && (
          <ConfirmDialog
            text={`Purchase ${ATTEMPT_PACK} more attempts for ${ATTEMPT_PACK_GOLD} Gold?`}
            onAccept={() => action.mutate({ action: 'buy', body: { currency: 'gold' } })}
            onClose={() => setConfirm(false)}
          />
        )}
      </div>
    </Dialog>
  )
}

type Offer = KennelShopView['offers'][number]

export function KennelShopWindow({ onClose }: { onClose: () => void }) {
  const view = useQuery({
    queryKey: shopKey,
    queryFn: () => api<KennelShopView>('/api/game/kennel/shop'),
  })
  const action = useKennelAction<KennelShopView>(shopKey, 'shop')
  const [page, setPage] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [buying, setBuying] = useState<{ offer: Offer; count: number } | null>(null)
  const data = view.data
  const error = action.error ?? view.error
  const pages = Math.max(1, Math.ceil((data?.offers.length ?? 0) / SHOP_PAGE))
  const shown = data?.offers.slice(page * SHOP_PAGE, (page + 1) * SHOP_PAGE) ?? []
  return (
    <Dialog title="Pet Shop" onClose={onClose} className="game-window-bare w-[490px]">
      <div
        className="kennel-shop relative flex h-[540px] w-[480px] flex-col gap-[6px] p-[8px] text-[12px] text-black"
        style={bigBg(1)}
      >
        <div className="flex items-center justify-between">
          <span
            aria-label="Feathers"
            title="Feathers in your bag"
            className="game-text-box flex h-[18px] w-[90px] items-center gap-1 px-1"
          >
            <ItemIcon itemId={FEATHER} name="Feather" className="size-[16px]" />
            {data?.feathers ?? 0}
          </span>
          <span className="text-[11px]">Daily limits reset at 00:00 UTC.</span>
        </div>
        {view.isPending && <p>Loading the Pet Shop...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {data && data.offers.length === 0 && <p className="m-auto">No items available.</p>}
        {data && data.offers.length > 0 && (
          <ul aria-label="Pet Shop items" className="grid grid-cols-4 gap-[8px]">
            {shown.map((offer) => (
              <ShopCard
                key={offer.itemId}
                offer={offer}
                view={data}
                count={counts[offer.itemId] ?? 1}
                busy={action.isPending}
                onCount={(count) => setCounts({ ...counts, [offer.itemId]: count })}
                onBuy={(count) => setBuying({ offer, count })}
              />
            ))}
          </ul>
        )}
        {data && data.offers.length > 0 && (
          <nav
            aria-label="Pages"
            className="game-panel-small mx-auto mt-auto flex h-[20px] w-[176px] items-center justify-center gap-3"
          >
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="font-bold text-white disabled:opacity-40"
            >
              {'<'}
            </button>
            <span className="text-white">
              {page + 1}/{pages}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= pages - 1}
              onClick={() => setPage(page + 1)}
              className="font-bold text-white disabled:opacity-40"
            >
              {'>'}
            </button>
          </nav>
        )}
        {buying && (
          <ConfirmDialog
            text={`Buy ${plainText(buying.offer.nameKey, buying.offer.itemId)} x${buying.count}?\n\nCost: ${feathers(buying.offer.price * buying.count)}`}
            onAccept={() =>
              action.mutate(
                {
                  action: 'buy',
                  body: { itemId: buying.offer.itemId, count: buying.count },
                },
                { onSuccess: () => showToast('Purchase successful!', 'success') },
              )
            }
            onClose={() => setBuying(null)}
          />
        )}
      </div>
    </Dialog>
  )
}

function ShopCard({
  offer,
  view,
  count,
  busy,
  onCount,
  onBuy,
}: {
  offer: Offer
  view: KennelShopView
  count: number
  busy: boolean
  onCount: (count: number) => void
  onBuy: (count: number) => void
}) {
  const name = plainText(offer.nameKey, offer.itemId)
  const remaining = offer.dailyLimit - offer.purchased
  const choices = QUANTITIES.filter((q) => q === 1 || q <= remaining)
  const quantity = Math.min(count, Math.max(1, remaining))
  return (
    <li
      aria-label={name}
      className="game-text-box flex h-[205px] w-[105px] flex-col items-center gap-[6px] px-1 py-2 text-center"
    >
      <h3 className="h-[30px] text-[11px] leading-[13px] font-bold">{name}</h3>
      <ItemIcon itemId={offer.itemId} name={name} className="size-11" />
      <p>{feathers(offer.price)}</p>
      <p title={`Bought ${offer.purchased} of ${offer.dailyLimit} today`}>
        {offer.purchased}/{offer.dailyLimit}
      </p>
      {view.level < offer.level ? (
        <p className="mt-auto font-bold text-[#a01010]">Lv {offer.level}</p>
      ) : (
        <>
          <select
            aria-label="Quantity"
            value={quantity}
            disabled={busy || remaining === 0}
            onChange={(event) => onCount(Number(event.target.value))}
            className="game-card px-1"
          >
            {choices.map((q) => (
              <option key={q} value={q}>
                x{q}
              </option>
            ))}
          </select>
          <GameButton
            small
            className="mt-auto h-[22px] w-[70px]"
            disabled={busy || remaining === 0 || offer.price * quantity > view.feathers}
            onClick={() => onBuy(quantity)}
          >
            {remaining === 0 ? 'Sold Out' : busy ? '...' : 'Buy'}
          </GameButton>
        </>
      )}
    </li>
  )
}
