// Reborn's Sell Items tab (component S): own listings with Cancel, "Select an item to sell" opening
// the inventory picker (bag tabs I-X, locked and unsellable items greyed), then the Sell Item
// window (currency, quantity, unit price, average price, total, 10% tax, what you receive).
// Ours adds the 2011 duration choice and its Stone listing fee, which Reborn does not show.
import type { Character } from '@pockie/shared'
import { BAG_PAGE_COLUMNS, BAG_PAGE_COUNT, BAG_PAGE_SLOTS } from '@pockie/shared'
import { useState } from 'react'
import {
  MARKET_HOURS,
  MARKET_MAX_UNIT_PRICE,
  type MarketHours,
} from '../../../../game-core/src/economy/market'
import type { MarketOwnListing } from '../../../../shared/src/schemas/market'
import { errorMessage, useInventory } from '../api'
import { ItemPicture, ROMAN, span, TILE } from '../inventory/BagGrid'
import { itemName } from '../inventory/outfits'
import { Prompt } from '../Prompt'
import { Dialog, GameButton } from '../skin'
import { withToast } from '../shop/parts'
import type { InventoryItem } from '../types'
import { useMarketAction, useMarketBoard, useMarketMine } from './api'
import {
  CELL,
  COIN_NAMES,
  Header,
  marketItemName,
  NameCell,
  PriceTag,
  Prices,
  taxOf,
  timeLeft,
  usePages,
  type Coin,
} from './parts'

const COLUMNS: [string, number][] = [
  ['Name', 230],
  ['Count', 44],
  ['Unit Price', 118],
  ['Total', 118],
  ['Expiration', 88],
  ['Action', 60],
]
const TAX_INFO =
  'Every sale pays a 10% tax, taken from what the seller receives. Listing costs a Stone fee by ' +
  'duration and level, which is not refunded. Sales and returned items wait in Storage.'

export function SellTab({ character }: { character: Character }) {
  const mine = useMarketMine()
  const action = useMarketAction()
  const [picking, setPicking] = useState(false)
  const [selling, setSelling] = useState<InventoryItem | null>(null)
  const listings = mine.data?.listings ?? []
  const { shown, pager } = usePages(listings, 'mine')
  const active = listings.filter((listing) => !listing.expired).length

  const cancel = (listing: MarketOwnListing) =>
    withToast(
      action.mutateAsync({ action: 'cancel', body: { listingId: listing.id } }),
      'Listing cancelled. The item is in your Storage.',
    )

  return (
    <div className="flex flex-col gap-[4px]">
      <div className="relative flex h-[20px] items-center justify-center">
        <span className="absolute left-0 text-[11px]">
          Listings: {active}/{mine.data?.maxListings ?? '-'}
        </span>
        <GameButton
          small
          className="h-[20px] w-[150px] min-w-0 px-0"
          disabled={!mine.data}
          onClick={() => setPicking(true)}
        >
          Select an item to sell
        </GameButton>
        <span title={TAX_INFO} className="absolute right-0 cursor-help text-[9px] underline">
          Tax Info
        </span>
      </div>
      <div role="table" aria-label="Your listings" className="flex flex-col gap-[2px]">
        <Header columns={COLUMNS} />
        {shown.map((listing) => (
          <div key={listing.id} role="row" className="flex gap-[2px]">
            <NameCell item={listing} width={230} />
            <span className={CELL} style={{ width: 44 }}>
              {listing.count}
            </span>
            <span className={CELL} style={{ width: 118 }}>
              <Prices listing={listing} />
            </span>
            <span className={CELL} style={{ width: 118 }}>
              <Prices listing={listing} count={listing.count} />
            </span>
            <span className={CELL} style={{ width: 88 }}>
              {listing.expired ? 'Expired' : timeLeft(listing.expiresAt)}
            </span>
            <span className="flex w-[60px] justify-center">
              <GameButton
                small
                aria-label={`Cancel ${marketItemName(listing)}`}
                className="h-[22px] w-[42px] min-w-0 px-0"
                disabled={action.isPending}
                onClick={() => void cancel(listing)}
              >
                Cancel
              </GameButton>
            </span>
          </div>
        ))}
      </div>
      {mine.isError && <p className="text-[#c00]">{errorMessage(mine.error)}</p>}
      {mine.data && listings.length === 0 && <p>You are not selling anything.</p>}
      {pager}
      {picking && mine.data && (
        <InventoryPicker
          sellable={new Set(mine.data.sellable.map((row) => row.inventoryId))}
          onPick={(item) => {
            setPicking(false)
            setSelling(item)
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {selling && mine.data && (
        <SellItem
          item={selling}
          character={character}
          fees={mine.data.fees}
          onClose={() => setSelling(null)}
        />
      )}
    </div>
  )
}

/** Reborn's inventory picker (component x): bag tabs I-X, ten tiles a row, sellable items only. */
function InventoryPicker({
  sellable,
  onPick,
  onClose,
}: {
  sellable: Set<string>
  onPick: (item: InventoryItem) => void
  onClose: () => void
}) {
  const inventory = useInventory()
  const [page, setPage] = useState(0)
  const items = (inventory.data ?? []).filter(
    (item) => item.equippedSlot === null && item.page === page && item.slot != null,
  )
  return (
    <Dialog title="Select an Item" onClose={onClose} className="game-window-bare w-[343px]">
      <div className="game-panel-1 flex w-[333px] flex-col gap-[4px] p-[5px] font-game text-[12px] text-black">
        <div role="tablist" aria-label="Bag tabs" className="flex">
          {ROMAN.slice(0, BAG_PAGE_COUNT).map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={index === page}
              onClick={() => setPage(index)}
              className="game-tab h-[22px] w-[27px] px-0 text-[13px] text-black"
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `repeat(${BAG_PAGE_COLUMNS}, ${TILE}px)`,
            gridAutoRows: `${TILE}px`,
          }}
        >
          {Array.from({ length: BAG_PAGE_SLOTS }, (_, slot) => (
            <span
              key={slot}
              className="game-slot"
              style={{
                gridColumn: (slot % BAG_PAGE_COLUMNS) + 1,
                gridRow: Math.floor(slot / BAG_PAGE_COLUMNS) + 1,
              }}
            />
          ))}
          {items.map((item) => {
            const usable = sellable.has(item.id) && !item.locked
            const name = itemName(item)
            return (
              <button
                key={item.id}
                type="button"
                disabled={!usable}
                aria-label={`${name}${item.count > 1 ? ` x${item.count}` : ''}`}
                title={
                  usable ? name : item.locked ? `${name} (locked)` : `${name} (cannot be sold)`
                }
                onClick={() => onPick(item)}
                className="relative z-[1] disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
                style={{
                  gridColumn: `${(item.slot! % BAG_PAGE_COLUMNS) + 1} / span ${item.info?.w ?? 1}`,
                  gridRow: `${Math.floor(item.slot! / BAG_PAGE_COLUMNS) + 1} / span ${item.info?.h ?? 1}`,
                  width: span(item.info?.w),
                  height: span(item.info?.h),
                }}
              >
                <ItemPicture item={item} decorative />
                {item.count > 1 && (
                  <span className="absolute right-0 bottom-0 text-[9px] leading-none font-bold text-white [text-shadow:var(--shadow-game-text)]">
                    {item.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </Dialog>
  )
}

/** Reborn's Sell Item window, plus our duration and listing fee. */
function SellItem({
  item,
  character,
  fees,
  onClose,
}: {
  item: InventoryItem
  character: Character
  fees: Record<'8' | '12' | '24', number>
  onClose: () => void
}) {
  const action = useMarketAction()
  const board = useMarketBoard()
  const [currency, setCurrency] = useState<Coin>('stone')
  const [quantity, setQuantity] = useState(item.count)
  const [price, setPrice] = useState(1)
  const [hours, setHours] = useState<MarketHours>(MARKET_HOURS[0])
  const name = itemName(item)
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= item.count
  const validPrice = Number.isInteger(price) && price >= 1 && price <= MARKET_MAX_UNIT_PRICE
  const total = validQuantity && validPrice ? price * quantity : 0
  const fee = fees[String(hours) as keyof typeof fees]
  const others = (board.data?.listings ?? []).flatMap((listing) => {
    const value = currency === 'stone' ? listing.priceStone : listing.priceGold
    return listing.itemId === item.itemId && value !== null ? [value] : []
  })
  const avg = others.length
    ? Math.round(others.reduce((sum, value) => sum + value, 0) / others.length)
    : null

  function sell() {
    // Closed first: a toast shows in the topmost open dialog (as in the merchant shop).
    onClose()
    void withToast(
      action.mutateAsync({
        action: 'list',
        body: {
          inventoryId: item.id,
          count: quantity,
          priceStone: currency === 'stone' ? price : null,
          priceGold: currency === 'gold' ? price : null,
          hours,
        },
      }),
      `${name} is on the Market.`,
    )
  }

  const row = 'flex w-full items-center justify-between gap-[6px]'
  return (
    <Prompt
      title="Sell Item"
      width={250}
      message={
        <span className="flex items-center gap-[8px] text-left">
          <span className="game-slot grid h-[78px] w-[51px] shrink-0 place-items-center p-[2px]">
            <ItemPicture item={item} decorative />
          </span>
          <b>
            {name}
            {item.count > 1 && ` x${item.count}`}
          </b>
        </span>
      }
      acceptLabel="Sell"
      denyLabel="Cancel"
      acceptDisabled={!validQuantity || !validPrice || character.stone < fee || action.isPending}
      onAccept={sell}
      onClose={onClose}
    >
      <div className="flex w-full flex-col gap-[4px] text-[11px]">
        <label className={row}>
          Currency
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Coin)}
            className="game-field h-[20px] w-[130px]"
          >
            {(['stone', 'gold'] as const).map((coin) => (
              <option key={coin} value={coin}>
                {COIN_NAMES[coin]} (with tax)
              </option>
            ))}
          </select>
        </label>
        {item.count > 1 && (
          <label className={row}>
            Quantity
            <input
              type="number"
              min={1}
              max={item.count}
              value={Number.isNaN(quantity) ? '' : quantity}
              onChange={(event) => setQuantity(event.target.valueAsNumber)}
              className="game-field h-[20px] w-[80px] px-1"
            />
          </label>
        )}
        <label className={row}>
          Unit Price
          <input
            type="number"
            min={1}
            max={MARKET_MAX_UNIT_PRICE}
            value={Number.isNaN(price) ? '' : price}
            onChange={(event) => setPrice(event.target.valueAsNumber)}
            className="game-field h-[20px] w-[80px] px-1"
          />
        </label>
        <label className={row}>
          Duration
          <select
            value={hours}
            onChange={(event) => setHours(Number(event.target.value) as MarketHours)}
            className="game-field h-[20px] w-[80px]"
          >
            {MARKET_HOURS.map((h) => (
              <option key={h} value={h}>
                {h} hours
              </option>
            ))}
          </select>
        </label>
        <span className={row}>
          Avg. Price:
          {avg === null ? (
            <span>No listings</span>
          ) : (
            <PriceTag
              value={avg}
              currency={currency}
              className={price < avg ? 'text-[#1a7f1a]' : price > avg ? 'text-[#c00]' : ''}
            />
          )}
        </span>
        <span className={row}>
          Total: <PriceTag value={total} currency={currency} />
        </span>
        <span className={row}>
          Tax (10%): <PriceTag value={-taxOf(total)} currency={currency} className="text-[#c00]" />
        </span>
        <span className={row}>
          You receive:{' '}
          <PriceTag value={total - taxOf(total)} currency={currency} className="text-[#1a7f1a]" />
        </span>
        <span className={row}>
          Listing fee:{' '}
          <PriceTag
            value={fee}
            currency="stone"
            className={character.stone < fee ? 'text-[#c00]' : ''}
          />
        </span>
      </div>
    </Prompt>
  )
}
