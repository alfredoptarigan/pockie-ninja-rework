import type { Character } from '@pockie/shared'
import { useState, type FormEvent } from 'react'
import type { MarketListing } from '../../../../shared/src/schemas/market'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { searchItemIds, useMarketAction, useMarketBrowse, useMarketCategories } from './api'
import { CategoryTree, ItemCell, marketItemName, Pager, Price, ROW_STYLE, timeLeft } from './parts'

type Sort = 'time' | 'stone' | 'gold'

export function BrowseTab({ character }: { character: Character }) {
  const categories = useMarketCategories()
  const [category, setCategory] = useState<string>()
  const [text, setText] = useState('')
  const [search, setSearch] = useState<string[] | 'too_many' | undefined>()
  const [sort, setSort] = useState<Sort>('time')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [buying, setBuying] = useState<MarketListing | null>(null)
  const [notice, setNotice] = useState('')
  const noMatch = search === 'too_many' || search?.length === 0
  const browse = useMarketBrowse(
    { category, itemIds: Array.isArray(search) ? search.join(',') : undefined, sort, order, page },
    !noMatch,
  )
  function submit(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    setSearch(text.trim() ? searchItemIds(text) : undefined)
  }
  return (
    <div className="flex gap-3">
      <div className="h-[22rem] w-44 shrink-0 overflow-auto rounded bg-white/30 p-1">
        {categories.data && (
          <CategoryTree
            categories={categories.data}
            selected={category}
            onSelect={(path) => {
              setCategory(path)
              setPage(1)
            }}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            Name
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={40}
              className="w-32 rounded border border-wood-light bg-white px-1"
            />
          </label>
          <GameButton small type="submit">
            Search
          </GameButton>
          <label className="flex items-center gap-1">
            Sort by
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as Sort)
                setPage(1)
              }}
              className="rounded border border-wood-light bg-white"
            >
              <option value="time">Time left</option>
              <option value="stone">Stone price</option>
              <option value="gold">Gold price</option>
            </select>
          </label>
          <GameButton
            small
            onClick={() => {
              setOrder(order === 'asc' ? 'desc' : 'asc')
              setPage(1)
            }}
          >
            {order === 'asc' ? 'Lowest first' : 'Highest first'}
          </GameButton>
        </form>
        {notice && <Notice>{notice}</Notice>}
        {search === 'too_many' && <Notice>Type more of the name to search.</Notice>}
        {browse.isError && <Notice tone="error">{errorMessage(browse.error)}</Notice>}
        <ul aria-label="Listings" className="flex min-h-[16rem] flex-col gap-1">
          {(noMatch ? [] : (browse.data?.listings ?? [])).map((listing) => (
            <li
              key={listing.id}
              style={ROW_STYLE}
              className="grid grid-cols-[1fr_5rem_5.5rem_4.5rem_3rem_auto] items-center gap-2 text-xs"
            >
              <ItemCell item={listing} />
              <span className="truncate">{listing.sellerName}</span>
              <Price value={listing.priceStone} currency="stone" />
              <Price value={listing.priceGold} currency="gold" />
              <span>{timeLeft(listing.expiresAt)}</span>
              <GameButton
                small
                disabled={listing.mine}
                aria-label={`Buy ${marketItemName(listing)}`}
                onClick={() => {
                  setNotice('')
                  setBuying(listing)
                }}
              >
                Buy
              </GameButton>
            </li>
          ))}
          {(noMatch || browse.data?.listings.length === 0) && <li>No listings found.</li>}
        </ul>
        {browse.data && !noMatch && (
          <Pager page={browse.data.page} pages={browse.data.pages} onPage={setPage} />
        )}
      </div>
      {buying && (
        <BuyDialog
          listing={buying}
          character={character}
          onClose={() => setBuying(null)}
          onBought={() => {
            setBuying(null)
            setNotice('Purchase complete. Claim the item in the Warehouse tab.')
          }}
        />
      )}
    </div>
  )
}

function BuyDialog({
  listing,
  character,
  onClose,
  onBought,
}: {
  listing: MarketListing
  character: Character
  onClose: () => void
  onBought: () => void
}) {
  const action = useMarketAction()
  const [count, setCount] = useState(1)
  const stone = (listing.priceStone ?? 0) * count
  const gold = (listing.priceGold ?? 0) * count
  const short = stone > character.stone || gold > character.gold
  async function confirm() {
    try {
      await action.mutateAsync({ action: 'buy', body: { listingId: listing.id, count } })
      onBought()
    } catch {
      /* Rendered below. */
    }
  }
  return (
    <Dialog title="Buy" onClose={onClose} className="w-[22rem]">
      <div className="flex flex-col gap-2">
        <ItemCell item={listing} />
        <p className="text-xs">Seller: {listing.sellerName}</p>
        <label className="flex items-center gap-2">
          Quantity
          <input
            type="number"
            aria-label="Quantity"
            min={1}
            max={listing.count}
            value={count}
            onChange={(event) =>
              setCount(
                Math.min(listing.count, Math.max(1, Math.floor(Number(event.target.value)) || 1)),
              )
            }
            className="w-20 rounded border border-wood-light bg-white px-1"
          />
          <span className="text-xs">of {listing.count}</span>
        </label>
        <p className="flex items-center gap-3">
          Total:
          {listing.priceStone !== null && <Price value={stone} currency="stone" />}
          {listing.priceGold !== null && <Price value={gold} currency="gold" />}
        </p>
        <p className="text-xs">
          You have {character.stone.toLocaleString('en-US')} Stone and{' '}
          {character.gold.toLocaleString('en-US')} Gold. You pay every price shown.
        </p>
        {short && <Notice tone="error">You cannot afford this purchase.</Notice>}
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        <div className="flex justify-end gap-2">
          <GameButton onClick={onClose}>Cancel</GameButton>
          <GameButton disabled={short || action.isPending} onClick={() => void confirm()}>
            Confirm purchase
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}
