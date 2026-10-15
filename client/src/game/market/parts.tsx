// Row pieces shared by the Market Board tabs (reborn-lazy-features.md "Market Board"): the item
// name cell (TextBG2, 18px icon, underlined name, tooltip on hover), 22px data cells, the column
// header, prices with their currency icon, the 10-row paginator and the item type filter.
import { useState, type ReactNode } from 'react'
import { sellerPayout } from '../../../../game-core/src/economy/market'
import type { MarketItem } from '../../../../shared/src/schemas/market'
import { ItemPicture } from '../inventory/BagGrid'
import { itemName } from '../inventory/outfits'
import { ItemTooltip } from '../ItemTooltip'
import type { BagItemInfo } from '@pockie/shared'
import type { InventoryItem } from '../types'
import { itemNameKey } from '../world'

export type Coin = 'stone' | 'gold'
const ICONS = { stone: 'var(--ui-icon-stone)', gold: 'var(--ui-icon-gold)' } as const
export const COIN_NAMES = { stone: 'Stones', gold: 'Gold' } as const
/** Reborn orders a group's currency stones < gift certificates < gold. */
const COIN_RANK = { stone: 0, gold: 1 } as const

/** Reborn's paginator: 10 rows a page. */
export const ROWS_PER_PAGE = 10
export const CELL = 'game-value-box flex h-[22px] items-center justify-center px-[3px] truncate'

/** An amount with its currency icon. */
export function PriceTag({
  value,
  currency,
  className = '',
}: {
  value: number
  currency: Coin
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-[2px] whitespace-nowrap ${className}`}>
      <span className="tabular-nums">{value.toLocaleString('en-US')}</span>
      <span
        role="img"
        aria-label={COIN_NAMES[currency]}
        className="inline-block size-[14px] shrink-0 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: ICONS[currency] }}
      />
    </span>
  )
}

export interface Priced {
  priceStone: number | null
  priceGold: number | null
}

/** The prices a listing sets (one in Reborn; a 2011 listing may set both, and both are paid). */
export const pricesOf = ({ priceStone, priceGold }: Priced) =>
  (
    [
      ['stone', priceStone],
      ['gold', priceGold],
    ] as const
  ).flatMap(([currency, value]) => (value === null ? [] : [{ currency, value }]))

/** The price that ranks a listing: its first currency in Reborn's order. */
export const mainPrice = (listing: Priced) => pricesOf(listing)[0]!

/** Cheaper first: by currency rank, then amount. */
export const byPrice = (a: Priced, b: Priced) => {
  const [x, y] = [mainPrice(a), mainPrice(b)]
  return COIN_RANK[x.currency] - COIN_RANK[y.currency] || x.value - y.value
}

/** Every price of a listing times `count`. */
export function Prices({ listing, count = 1 }: { listing: Priced; count?: number }) {
  return (
    <span className="inline-flex gap-[4px]">
      {pricesOf(listing).map(({ currency, value }) => (
        <PriceTag key={currency} value={value * count} currency={currency} />
      ))}
    </span>
  )
}

/** What the seller loses of a sale total: the 10% tax (as the server rounds it). */
export const taxOf = (total: number) => total - sellerPayout(total)

/** A Market item as a bag item, for the shared name, picture and tooltip helpers. */
export function asInventoryItem(
  item: Pick<MarketItem, 'itemId' | 'count' | 'bound' | 'info'> & { inventoryId?: string },
): InventoryItem {
  const { equipSlot, ...info } = item.info
  return {
    id: item.inventoryId ?? item.itemId,
    itemId: item.itemId,
    count: item.count,
    bound: item.bound,
    equippedSlot: null,
    nameKey: itemNameKey(item.itemId),
    info: equipSlot ? { ...info, equipSlot } : info,
  }
}

export const marketItemName = (
  item: Pick<MarketItem, 'itemId' | 'count' | 'bound' | 'info'> & { enhanceLevel?: number },
) => `${itemName(asInventoryItem(item))}${item.enhanceLevel ? ` +${item.enhanceLevel}` : ''}`

/** Reborn's type filter (ITEMS[iid][3]) over our item facts. */
export const ITEM_TYPES = [
  ['all', 'All Types'],
  ['avatar', 'Avatar'],
  ['weapon', 'Weapon'],
  ['gloves', 'Gloves'],
  ['pet', 'Pet'],
  ['ring', 'Ring'],
  ['amulet', 'Amulet'],
  ['helm', 'Helm'],
  ['body', 'Body'],
  ['belt', 'Belt'],
  ['shoes', 'Shoes'],
  ['gem', 'Gem'],
  ['box', 'Box'],
  ['etc', 'Etc'],
] as const
export type ItemType = (typeof ITEM_TYPES)[number][0]
const SLOT_TYPES: Record<string, ItemType> = {
  Outfit: 'avatar',
  Weapon: 'weapon',
  Glove: 'gloves',
  Ring: 'ring',
  Amulet: 'amulet',
  Hat: 'helm',
  Cloth: 'body',
  Girdle: 'belt',
  Shoes: 'shoes',
}
const CLASS_TYPES: Record<string, ItemType> = {
  PetItem: 'pet',
  JewelItem: 'gem',
  GiftBagItem: 'box',
  CardBox: 'box',
}
export const typeOf = (info: BagItemInfo): ItemType =>
  (info.equipSlot && SLOT_TYPES[info.equipSlot]) || CLASS_TYPES[info.class] || 'etc'

export function TypeSelect({
  value,
  onChange,
  className,
}: {
  value: ItemType
  onChange: (value: ItemType) => void
  className: string
}) {
  return (
    <select
      aria-label="Item type"
      value={value}
      onChange={(event) => onChange(event.target.value as ItemType)}
      className={`game-field text-[11px] ${className}`}
    >
      {ITEM_TYPES.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  )
}

/** The item name cell: TextBG2, an 18px picture and the underlined name; hover shows the tooltip. */
export function NameCell({
  item,
  width,
  children,
}: {
  item: Pick<MarketItem, 'itemId' | 'count' | 'bound' | 'info' | 'gear'> & {
    inventoryId?: string
    enhanceLevel?: number
  }
  width: number
  children?: ReactNode
}) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const inventoryItem = asInventoryItem(item)
  return (
    <span
      className="game-value-box flex h-[22px] items-center gap-[3px] p-[2px]"
      style={{ width }}
      onPointerMove={(event) => setTip({ x: event.clientX + 12, y: event.clientY + 12 })}
      onPointerLeave={() => setTip(null)}
    >
      <span className="size-[18px] shrink-0">
        <ItemPicture item={inventoryItem} gear={item.gear} decorative />
      </span>
      <span className="truncate underline">{marketItemName(item)}</span>
      {children}
      {tip && <ItemTooltip entry={{ item: inventoryItem, gear: item.gear }} at={tip} />}
    </span>
  )
}

/** Column headers (BigBG3 in Reborn), 20px high. */
export function Header({ columns }: { columns: [label: string, width: number][] }) {
  return (
    <div role="row" className="flex gap-[2px]">
      {columns.map(([label, width]) => (
        <span
          key={label}
          role="columnheader"
          className="game-panel-small flex h-[20px] shrink-0 items-center justify-center text-[11px] font-bold text-white"
          style={{ width }}
        >
          {label}
        </span>
      ))}
    </div>
  )
}

/** "HH:MM" left, or "Expired". */
export function timeLeft(expiresAt: string, now = Date.now()) {
  const minutes = Math.floor((Date.parse(expiresAt) - now) / 60_000)
  if (minutes <= 0) return 'Expired'
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** The rows of the current page and the pager under them (shown with more than one page). */
export function usePages<T>(items: T[], resetKey: string) {
  const [state, setState] = useState({ page: 1, key: resetKey })
  const page = state.key === resetKey ? state.page : 1
  const pages = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE))
  const current = Math.min(page, pages)
  return {
    shown: items.slice((current - 1) * ROWS_PER_PAGE, current * ROWS_PER_PAGE),
    pager:
      pages > 1 ? (
        <Pager
          page={current}
          pages={pages}
          onPage={(next) => setState({ page: next, key: resetKey })}
        />
      ) : null,
  }
}

const PAGE_BUTTONS = [
  ['first', 'First page'],
  ['prev', 'Previous page'],
  ['next', 'Next page'],
  ['last', 'Last page'],
] as const

export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
}) {
  const target = { first: 1, prev: page - 1, next: page + 1, last: pages }
  return (
    <div className="flex items-center justify-center gap-1 text-xs">
      {PAGE_BUTTONS.map(([kind, label], i) => {
        const disabled = target[kind] < 1 || target[kind] > pages || target[kind] === page
        return (
          <span key={kind} className="contents">
            {i === 2 && (
              <span className="px-2">
                Page {page} of {pages}
              </span>
            )}
            <button
              type="button"
              aria-label={label}
              disabled={disabled}
              onClick={() => onPage(target[kind])}
              className="size-5 bg-contain bg-center bg-no-repeat disabled:opacity-40"
              style={{ backgroundImage: `var(--ui-page-${kind}-up)` }}
            />
          </span>
        )
      })}
    </div>
  )
}
