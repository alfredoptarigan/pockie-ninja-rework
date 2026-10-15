// Ninja Mall (Reborn chunk 185 `Mall`, reborn-lazy-features.md "Ninja Mall"): a 580x455 panel,
// the PropMaketplace banner, one tab per server group, 8 cards a page (2 columns), and a footer
// with the Gold / Gift Certificates / Stones balances and the pager. Buy asks for a quantity (the
// 2011 buy window had one; Reborn always sends 1) and the server prices it.
// ponytail: Reborn's right-side art (PropMaketplace/mm.png) and the card background (PropBG1.png)
// are not on its CDN (403), so the cards use our panel skin and the art is left out. The Change
// Name card is not built (no rename system yet).
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  MALL_MAX_QUANTITY,
  type MallBuyResult,
  type MallCurrency,
  type MallGroupKey,
  type MallItemView,
  type MallView,
} from '../../../../shared/src/schemas/mall'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { ItemPicture } from '../inventory/BagGrid'
import { itemName } from '../inventory/outfits'
import { ItemTooltip } from '../ItemTooltip'
import { asInventoryItem } from '../market/parts'
import { Prompt } from '../Prompt'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { Pager, usePages } from '../social/Pager'
import { showToast } from '../toast'

export const mallKey = ['game', 'mall'] as const
const PATH = '/api/game/mall'
const PER_PAGE = 8
const BANNER = '/assets/reborn/ui/UIResource/PropMaketplace/L.webp'
const COINS: Record<MallCurrency | 'stone', { name: string; icon: string; color: string }> = {
  gold: { name: 'Gold', icon: 'var(--ui-icon-gold)', color: '#ffd76b' },
  coupons: {
    name: 'Coupons',
    icon: 'url(/assets/reborn/ui/UIResource/Icon/Icon_Lottery.webp)',
    color: '#b7e2ff',
  },
  stone: { name: 'Stones', icon: 'var(--ui-icon-stone)', color: '#ddd' },
}
const UNAFFORDABLE = '#ff8a7a'

const balance = (character: Character, currency: MallCurrency | 'stone') =>
  currency === 'gold'
    ? character.gold
    : currency === 'coupons'
      ? character.giftCoupon
      : character.stone
const asItem = (item: MallItemView) =>
  asInventoryItem({ itemId: item.itemId, count: 1, bound: false, info: item.info })
const remaining = (item: MallItemView) =>
  item.dailyLimit === undefined ? Infinity : item.dailyLimit - (item.purchasedToday ?? 0)

function Coin({ currency, size = 16 }: { currency: MallCurrency | 'stone'; size?: number }) {
  return (
    <span
      role="img"
      aria-label={COINS[currency].name}
      className="inline-block shrink-0 bg-contain bg-center bg-no-repeat"
      style={{ width: size, height: size, backgroundImage: COINS[currency].icon }}
    />
  )
}

type Buying = { item: MallItemView; currency: MallCurrency }

export function MallWindow({ character, onClose }: { character: Character; onClose: () => void }) {
  const view = useQuery({ queryKey: mallKey, queryFn: () => api<MallView>(PATH) })
  const [tab, setTab] = useState<MallGroupKey | null>(null)
  const [buying, setBuying] = useState<Buying | null>(null)
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const buy = useMutation({
    mutationFn: (body: { index: number; quantity: number; currency: MallCurrency }) =>
      api<MallBuyResult>(`${PATH}/buy`, { method: 'POST', body }),
    onSuccess: (result) => {
      queryClient.setQueryData(mallKey, result.mall)
      apply(result)
      showToast('Purchase successful!', 'success')
    },
    onError: (error) => showToast(errorMessage(error) || 'Failed to purchase', 'failure'),
  })
  const groups = view.data?.groups ?? []
  const active = groups.find((group) => group.key === tab) ?? groups[0]
  return (
    <Dialog title="Mall" onClose={onClose} className="game-window-bare w-[590px]">
      <div
        className="relative font-game text-[11px] text-white select-none"
        style={{ width: 580, height: 455 }}
      >
        <img src={BANNER} alt="" className="absolute top-0 left-0" />
        {view.error && <Notice tone="error">{errorMessage(view.error)}</Notice>}
        <div className="absolute top-[50px] left-0" style={{ width: 410, height: 403 }}>
          {active ? (
            <>
              <Tabs
                label="Mall tabs"
                panelId="mall-panel"
                tabs={groups.map((group) => ({ id: group.key, title: group.label }))}
                active={active.key}
                onChange={setTab}
              />
              <GroupBody
                key={active.key}
                items={active.items}
                character={character}
                busy={buy.isPending ? buy.variables?.index : undefined}
                onBuy={(item, currency) => setBuying({ item, currency })}
              />
            </>
          ) : (
            <div
              className="game-panel-small absolute top-[26px] grid place-items-center text-[#cbbf9f]"
              style={{ width: 410, height: 377 }}
            >
              {view.isPending ? '...' : 'No items available.'}
            </div>
          )}
        </div>
      </div>
      {buying && (
        <BuyPrompt
          {...buying}
          character={character}
          onClose={() => setBuying(null)}
          onConfirm={(quantity) => {
            setBuying(null)
            buy.mutate({ index: buying.item.index, quantity, currency: buying.currency })
          }}
        />
      )}
    </Dialog>
  )
}

function GroupBody({
  items,
  character,
  busy,
  onBuy,
}: {
  items: MallItemView[]
  character: Character
  busy: number | undefined
  onBuy: (item: MallItemView, currency: MallCurrency) => void
}) {
  const { page, pages, setPage, rows } = usePages(items, PER_PAGE)
  const [tip, setTip] = useState<{ item: MallItemView; at: { x: number; y: number } } | null>(null)
  return (
    <div
      id="mall-panel"
      role="tabpanel"
      className="game-panel-small relative"
      style={{ width: 410, height: 377 }}
    >
      {rows.length === 0 ? (
        <p className="absolute inset-x-0 top-[160px] text-center text-[#cbbf9f]">
          No items available.
        </p>
      ) : (
        <ul className="absolute inset-x-[6px] top-[5px] grid grid-cols-2 gap-x-[6px] gap-y-[2px]">
          {rows.map((item) => (
            <Card
              key={item.index}
              item={item}
              character={character}
              busy={busy === item.index}
              locked={busy !== undefined}
              onBuy={(currency) => onBuy(item, currency)}
              onTip={(at) => setTip(at ? { item, at } : null)}
            />
          ))}
        </ul>
      )}
      <footer className="absolute inset-x-[6px] bottom-[4px] flex items-center justify-between">
        <div role="group" aria-label="Balances" className="flex gap-[8px] tabular-nums">
          {(['gold', 'coupons', 'stone'] as const).map((currency) => {
            const text = balance(character, currency).toLocaleString('en-US')
            return (
              <span
                key={currency}
                className="flex items-center gap-[2px]"
                style={{ color: COINS[currency].color, fontSize: text.length > 15 ? 9 : 11 }}
              >
                <Coin currency={currency} />
                {text}
              </span>
            )
          })}
        </div>
        <Pager page={page} pages={pages} onPage={setPage} className="!mx-0" />
      </footer>
      {tip && <ItemTooltip entry={{ item: asItem(tip.item) }} at={tip.at} />}
    </div>
  )
}

function Card({
  item,
  character,
  busy,
  locked,
  onBuy,
  onTip,
}: {
  item: MallItemView
  character: Character
  busy: boolean
  locked: boolean
  onBuy: (currency: MallCurrency) => void
  onTip: (at: { x: number; y: number } | null) => void
}) {
  const name = itemName(asItem(item))
  const left = remaining(item)
  const prices: [MallCurrency, number][] = [[item.currency, item.price]]
  if (item.altCurrency && item.altPrice !== undefined)
    prices.push([item.altCurrency, item.altPrice])
  return (
    <li
      aria-label={name}
      className="game-panel-1 relative h-[80px] overflow-hidden rounded-[3px] text-black"
    >
      <p className="absolute inset-x-[4px] top-[4px] truncate text-center text-[10px] font-bold">
        {name}
      </p>
      <span
        className="absolute top-[25px] left-[8px] h-[40px] w-[28px] cursor-help"
        onMouseEnter={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          onTip({ x: box.right + 4, y: box.top })
        }}
        onMouseLeave={() => onTip(null)}
      >
        <ItemPicture item={asItem(item)} decorative />
      </span>
      <div className="absolute top-[22px] right-[6px] left-[40px] flex flex-col gap-[3px]">
        {prices.map(([currency, price]) => {
          const short = balance(character, currency) < price
          return (
            <div key={currency} className="flex h-[21px] items-center justify-end gap-[4px]">
              <span className="text-[10px]" style={{ color: short ? UNAFFORDABLE : undefined }}>
                Price: {price.toLocaleString('en-US')}
              </span>
              <Coin currency={currency} size={14} />
              <GameButton
                className="h-[18px] w-[58px] !min-w-0 !px-0 text-[10px]"
                aria-label={`Buy ${name} for ${COINS[currency].name}`}
                disabled={short || locked || left <= 0}
                onClick={() => onBuy(currency)}
              >
                {busy ? '...' : 'Buy'}
              </GameButton>
            </div>
          )
        })}
      </div>
      {item.dailyLimit !== undefined && (
        <span
          className="absolute right-[4px] bottom-[2px] text-[9px]"
          style={{ color: left <= 0 ? '#c0392b' : undefined }}
          title="Daily purchases reset at midnight UTC."
        >
          {left}/{item.dailyLimit} remaining
        </span>
      )}
    </li>
  )
}

/** Reborn's confirm ("Buy {name}?\n\nPrice: ...") with the 2011 quantity field. */
function BuyPrompt({
  item,
  currency,
  character,
  onConfirm,
  onClose,
}: Buying & {
  character: Character
  onConfirm: (quantity: number) => void
  onClose: () => void
}) {
  const price = currency === item.currency ? item.price : item.altPrice!
  const max = Math.max(
    1,
    Math.min(MALL_MAX_QUANTITY, remaining(item), Math.floor(balance(character, currency) / price)),
  )
  const [quantity, setQuantity] = useState(1)
  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= max
  const coin = COINS[currency].name
  return (
    <Prompt
      label="Buy item"
      message={`Buy ${itemName(asItem(item))}?\n\nPrice: ${price.toLocaleString('en-US')} ${coin}`}
      acceptDisabled={!valid}
      onAccept={() => onConfirm(quantity)}
      onClose={onClose}
    >
      <label className="flex items-center gap-2">
        Quantity
        <input
          type="number"
          min={1}
          max={max}
          value={Number.isNaN(quantity) ? '' : quantity}
          onChange={(event) => setQuantity(event.target.valueAsNumber)}
          className="w-16 border border-[#5a5a5a] bg-white px-1 text-black"
        />
      </label>
      <p>
        Total: {valid ? (price * quantity).toLocaleString('en-US') : '-'} {coin}
        {currency === 'coupons' && ' (items bought with Coupons are bound)'}
      </p>
    </Prompt>
  )
}
