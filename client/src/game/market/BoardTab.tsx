// Reborn's Market tab (component N): a toolbar (Refresh, type, level, sort, search), the live
// listings grouped by item with their count, lowest and average price, and a group's detail view
// with Buy Cheapest, every listing and the Confirm Purchase window.
import type { Character } from '@pockie/shared'
import { useState } from 'react'
import type { MarketListing } from '../../../../shared/src/schemas/market'
import { errorMessage } from '../api'
import { ItemPicture } from '../inventory/BagGrid'
import { Prompt } from '../Prompt'
import { GameButton } from '../skin'
import { withToast } from '../shop/parts'
import { useMarketAction, useMarketBoard } from './api'
import {
  asInventoryItem,
  byPrice,
  CELL,
  COIN_NAMES,
  Header,
  mainPrice,
  marketItemName,
  NameCell,
  pricesOf,
  PriceTag,
  timeLeft,
  TypeSelect,
  typeOf,
  usePages,
  type Coin,
  type ItemType,
} from './parts'

const LEVELS = Array.from({ length: 10 }, (_, i) => [i * 10 + 1, i * 10 + 10] as const)
const SORTS = [
  ['price-asc', 'Price ↑'],
  ['price-desc', 'Price ↓'],
  ['level-asc', 'Level ↑'],
  ['level-desc', 'Level ↓'],
  ['ending', 'Ending Soon'],
  ['name', 'Name A-Z'],
] as const
type Sort = (typeof SORTS)[number][0]
const GROUP_COLUMNS: [string, number][] = [
  ['Name', 374],
  ['Avail.', 50],
  ['Lowest', 82],
  ['Avg. Price', 82],
  ['Action', 54],
]
const DETAIL_COLUMNS: [string, number][] = [
  ['Name', 192],
  ['Count', 38],
  ['Unit Price', 92],
  ['Avg. Price', 92],
  ['Total', 98],
  ['Expiration', 84],
  ['Action', 60],
]

interface Group {
  itemId: string
  listings: MarketListing[]
  best: MarketListing
  /** Rounded mean unit price per currency. */
  avg: Partial<Record<Coin, number>>
}

function averages(listings: MarketListing[]) {
  const sums: Partial<Record<Coin, [number, number]>> = {}
  for (const listing of listings)
    for (const { currency, value } of pricesOf(listing)) {
      const [sum, n] = sums[currency] ?? [0, 0]
      sums[currency] = [sum + value, n + 1]
    }
  return Object.fromEntries(
    Object.entries(sums).map(([currency, [sum, n]]) => [currency, Math.round(sum / n)]),
  ) as Partial<Record<Coin, number>>
}

function groupsOf(listings: MarketListing[]): Group[] {
  const byItem = new Map<string, MarketListing[]>()
  for (const listing of listings)
    byItem.set(listing.itemId, [...(byItem.get(listing.itemId) ?? []), listing])
  return [...byItem].map(([itemId, rows]) => {
    const sorted = rows.toSorted(byPrice)
    return { itemId, listings: sorted, best: sorted[0]!, avg: averages(sorted) }
  })
}

const SORTERS: Record<Sort, (a: Group, b: Group) => number> = {
  'price-asc': (a, b) => byPrice(a.best, b.best),
  'price-desc': (a, b) => byPrice(b.best, a.best),
  'level-asc': (a, b) => a.best.info.level - b.best.info.level,
  'level-desc': (a, b) => b.best.info.level - a.best.info.level,
  ending: (a, b) => soonest(a) - soonest(b),
  name: (a, b) => marketItemName(a.best).localeCompare(marketItemName(b.best)),
}
const soonest = (group: Group) => Math.min(...group.listings.map((l) => Date.parse(l.expiresAt)))

/** How many units `character` can pay for (every price the listing sets). */
const affordable = (listing: MarketListing, character: Character) =>
  Math.min(
    listing.count,
    ...pricesOf(listing).map(({ currency, value }) => Math.floor(character[currency] / value)),
  )

/** Green under the average, red over it. */
const priceTone = (listing: MarketListing, avg: Group['avg']) => {
  const { currency, value } = mainPrice(listing)
  const mean = avg[currency]
  if (mean === undefined || value === mean) return ''
  return value < mean ? 'text-[#1a7f1a]' : 'text-[#c00]'
}

export function BoardTab({ character }: { character: Character }) {
  const board = useMarketBoard()
  const [type, setType] = useState<ItemType>('all')
  const [level, setLevel] = useState('all')
  const [sort, setSort] = useState<Sort>('price-asc')
  const [search, setSearch] = useState('')
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [buying, setBuying] = useState<MarketListing | null>(null)

  const needle = search.trim().toLowerCase()
  const range = level === 'all' ? null : LEVELS[Number(level)]!
  const groups = groupsOf(
    (board.data?.listings ?? []).filter(
      (listing) =>
        (!needle || marketItemName(listing).toLowerCase().includes(needle)) &&
        (type === 'all' || typeOf(listing.info) === type) &&
        (!range || (listing.info.level >= range[0] && listing.info.level <= range[1])),
    ),
  ).toSorted(SORTERS[sort])
  const { shown, pager } = usePages(groups, `${type}|${level}|${sort}|${needle}`)
  const open = groups.find((group) => group.itemId === openItem)

  if (open)
    return (
      <>
        <Detail
          group={open}
          character={character}
          onBack={() => setOpenItem(null)}
          onBuy={setBuying}
        />
        {buying && (
          <ConfirmPurchase
            listing={buying}
            avg={open.avg}
            character={character}
            onClose={() => setBuying(null)}
          />
        )}
      </>
    )
  return (
    <div className="flex flex-col gap-[4px]">
      <div className="flex h-[20px] items-center gap-[5px]">
        <GameButton
          small
          className="h-[20px] w-[55px] min-w-0 px-0"
          onClick={() => void board.refetch()}
        >
          Refresh
        </GameButton>
        <TypeSelect value={type} onChange={setType} className="h-[20px] w-[75px]" />
        <select
          aria-label="Level"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className="game-field h-[20px] w-[72px] text-[11px]"
        >
          <option value="all">All Levels</option>
          {LEVELS.map(([lo, hi], index) => (
            <option key={lo} value={index}>
              Lv. {lo}-{hi}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
          className="game-field h-[20px] w-[80px] text-[11px]"
        >
          {SORTS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <input
          aria-label="Search"
          placeholder="Search..."
          value={search}
          maxLength={40}
          onChange={(event) => setSearch(event.target.value)}
          className="game-field h-[16px] w-[130px] px-[3px] text-[11px]"
        />
      </div>
      <div role="table" aria-label="Listings" className="flex flex-col gap-[2px]">
        <Header columns={GROUP_COLUMNS} />
        {shown.map((group) => (
          <div
            key={group.itemId}
            role="row"
            className="flex cursor-pointer gap-[2px]"
            onClick={() => setOpenItem(group.itemId)}
          >
            <NameCell item={group.best} width={374} />
            <span className={CELL} style={{ width: 50 }}>
              {group.listings.length}
            </span>
            <span className={`${CELL} font-bold text-[#1a7f1a]`} style={{ width: 82 }}>
              <PriceTag {...mainPrice(group.best)} />
            </span>
            <span className={CELL} style={{ width: 82 }}>
              <PriceTag
                value={group.avg[mainPrice(group.best).currency]!}
                currency={mainPrice(group.best).currency}
              />
            </span>
            <GameButton
              small
              aria-label={`View ${marketItemName(group.best)}`}
              className="h-[22px] w-[52px] min-w-0 px-0"
              onClick={(event) => {
                event.stopPropagation()
                setOpenItem(group.itemId)
              }}
            >
              View
            </GameButton>
          </div>
        ))}
      </div>
      {board.isPending && <p>Loading the Market...</p>}
      {board.isError && <p className="text-[#c00]">{errorMessage(board.error)}</p>}
      {board.data && groups.length === 0 && <p>No items for sale.</p>}
      {pager}
    </div>
  )
}

function Detail({
  group,
  character,
  onBack,
  onBuy,
}: {
  group: Group
  character: Character
  onBack: () => void
  onBuy: (listing: MarketListing) => void
}) {
  const { shown, pager } = usePages(group.listings, group.itemId)
  const cheapest = group.best
  const name = marketItemName(cheapest)
  return (
    <div className="flex flex-col gap-[4px]">
      <div className="flex h-[24px] items-center gap-[6px]">
        <GameButton small className="h-[22px] w-[50px] min-w-0 px-0" onClick={onBack}>
          Back
        </GameButton>
        <span className="size-[24px]">
          <ItemPicture item={asInventoryItem(cheapest)} gear={cheapest.gear} decorative />
        </span>
        <h3 className="font-bold">{name}</h3>
        <span className="inline-flex items-center gap-[4px]">
          {group.listings.length} Listings · Lowest: <PriceTag {...mainPrice(cheapest)} />
        </span>
        <GameButton
          small
          className="ml-auto h-[22px] w-[112px] min-w-0 px-0"
          disabled={cheapest.mine || affordable(cheapest, character) < 1}
          onClick={() => onBuy(cheapest)}
        >
          Buy Cheapest
        </GameButton>
      </div>
      <div role="table" aria-label={`${name} listings`} className="flex flex-col gap-[2px]">
        <Header columns={DETAIL_COLUMNS} />
        {shown.map((listing) => (
          <div key={listing.id} role="row" className="flex gap-[2px]">
            <NameCell item={listing} width={192} />
            <span className={CELL} style={{ width: 38 }}>
              {listing.count}
            </span>
            <span
              className={`${CELL} font-bold ${priceTone(listing, group.avg)}`}
              style={{ width: 92 }}
            >
              {pricesOf(listing).map((price) => (
                <PriceTag key={price.currency} {...price} />
              ))}
            </span>
            <span className={CELL} style={{ width: 92 }}>
              <PriceTag
                value={group.avg[mainPrice(listing).currency]!}
                currency={mainPrice(listing).currency}
              />
            </span>
            <span className={CELL} style={{ width: 98 }}>
              {pricesOf(listing).map(({ currency, value }) => (
                <PriceTag key={currency} value={value * listing.count} currency={currency} />
              ))}
            </span>
            <span className={CELL} style={{ width: 84 }}>
              {timeLeft(listing.expiresAt)}
            </span>
            <GameButton
              small
              aria-label={listing.mine ? undefined : `Buy ${marketItemName(listing)}`}
              className="h-[22px] w-[60px] min-w-0 px-0"
              disabled={listing.mine || affordable(listing, character) < 1}
              onClick={() => onBuy(listing)}
            >
              {listing.mine ? 'Yours' : 'Buy'}
            </GameButton>
          </div>
        ))}
      </div>
      {pager}
    </div>
  )
}

/** Reborn's "Confirm Purchase" (component L): amount, total against the balance. */
function ConfirmPurchase({
  listing,
  avg,
  character,
  onClose,
}: {
  listing: MarketListing
  avg: Group['avg']
  character: Character
  onClose: () => void
}) {
  const action = useMarketAction()
  const [amount, setAmount] = useState(1)
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= listing.count
  const prices = pricesOf(listing)
  const short = prices.find(({ currency, value }) => value * amount > character[currency])
  const name = marketItemName(listing)
  function confirm() {
    // Closed first: a toast shows in the topmost open dialog (as in the merchant shop).
    onClose()
    void withToast(
      action.mutateAsync({ action: 'buy', body: { listingId: listing.id, count: amount } }),
      `Bought ${name} x${amount}. Claim it in Storage.`,
    )
  }
  return (
    <Prompt
      title="Confirm Purchase"
      width={280}
      message={
        <span className="flex items-center gap-[8px] text-left">
          <span className="game-slot size-[48px] shrink-0 p-[4px]">
            <ItemPicture item={asInventoryItem(listing)} gear={listing.gear} decorative />
          </span>
          <span className="flex flex-col gap-[2px]">
            <b>{name}</b>
            <span className="inline-flex items-center gap-[4px]">
              Unit Price:{' '}
              {prices.map((price) => (
                <PriceTag key={price.currency} {...price} />
              ))}
            </span>
            <span className="inline-flex items-center gap-[4px]">
              Avg. Price:{' '}
              <PriceTag
                value={avg[mainPrice(listing).currency]!}
                currency={mainPrice(listing).currency}
              />
            </span>
          </span>
        </span>
      }
      acceptLabel="Confirm"
      denyLabel="Cancel"
      acceptDisabled={!valid || !!short || action.isPending}
      onAccept={confirm}
      onClose={onClose}
    >
      <label className="flex items-center gap-[4px]">
        Amount:
        <input
          type="number"
          min={1}
          max={Math.max(1, affordable(listing, character))}
          value={Number.isNaN(amount) ? '' : amount}
          onChange={(event) => setAmount(event.target.valueAsNumber)}
          className="game-field h-[20px] w-[60px] px-1"
        />
        / {listing.count}
      </label>
      <div className="game-value-box flex w-full flex-col gap-[2px] p-[4px] text-left">
        <span className="inline-flex items-center gap-[4px]">
          Total:{' '}
          {prices.map(({ currency, value }) => (
            <PriceTag
              key={currency}
              value={value * (valid ? amount : 0)}
              currency={currency}
              className={value * amount > character[currency] ? 'text-[#c00]' : ''}
            />
          ))}
        </span>
        <span className="inline-flex items-center gap-[4px]">
          Your Balance:{' '}
          {prices.map(({ currency }) => (
            <PriceTag key={currency} value={character[currency]} currency={currency} />
          ))}
        </span>
      </div>
      {short && <span className="text-[#c00]">Not enough {COIN_NAMES[short.currency]}.</span>}
    </Prompt>
  )
}
