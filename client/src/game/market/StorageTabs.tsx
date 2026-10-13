// My Listings (take down) and Warehouse (claim items and the wallet).
import { useState } from 'react'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { useMarketAction, useMarketMine, useMarketWarehouse } from './api'
import { ItemCell, marketItemName, Price, ROW_STYLE, timeLeft } from './parts'

function useRun() {
  const action = useMarketAction()
  const [notice, setNotice] = useState('')
  async function run(
    path: string,
    body: object,
    success: (result: { claimed?: number; left?: number }) => string,
  ) {
    setNotice('')
    try {
      setNotice(success(await action.mutateAsync({ action: path, body })))
    } catch {
      /* Rendered by the caller. */
    }
  }
  return { action, notice, run }
}

export function MineTab() {
  const mine = useMarketMine()
  const { action, notice, run } = useRun()
  if (mine.isPending) return <p>Loading your listings...</p>
  if (mine.isError) return <Notice tone="error">{errorMessage(mine.error)}</Notice>
  return (
    <div className="flex flex-col gap-2">
      {notice && <Notice>{notice}</Notice>}
      {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      <ul aria-label="My listings" className="flex flex-col gap-1">
        {mine.data.listings.map((listing) => (
          <li
            key={listing.id}
            style={ROW_STYLE}
            className="grid grid-cols-[1fr_5.5rem_4.5rem_4rem_auto] items-center gap-2 text-xs"
          >
            <ItemCell item={listing} />
            <Price value={listing.priceStone} currency="stone" />
            <Price value={listing.priceGold} currency="gold" />
            <span>{listing.expired ? 'Expired' : timeLeft(listing.expiresAt)}</span>
            <GameButton
              small
              aria-label={`Take down ${marketItemName(listing)}`}
              disabled={action.isPending}
              onClick={() =>
                void run(
                  'cancel',
                  { listingId: listing.id },
                  () => 'Listing taken down. The item is in your warehouse.',
                )
              }
            >
              Take down
            </GameButton>
          </li>
        ))}
        {mine.data.listings.length === 0 && <li>You have no listings.</li>}
      </ul>
      <p className="text-xs">
        Expired listings return to your warehouse on their own. The listing fee is not refunded.
      </p>
    </div>
  )
}

const SOURCES = { 0: 'Bought', 1: 'Returned' } as const

export function WarehouseTab() {
  const warehouse = useMarketWarehouse()
  const { action, notice, run } = useRun()
  if (warehouse.isPending) return <p>Opening the warehouse...</p>
  if (warehouse.isError) return <Notice tone="error">{errorMessage(warehouse.error)}</Notice>
  const { items, capacity, wallet } = warehouse.data
  const claimed = ({ claimed = 0, left = 0 }) =>
    left ? `Claimed ${claimed}. ${left} did not fit in your bag.` : `Claimed ${claimed}.`
  return (
    <div className="flex flex-col gap-2">
      {notice && <Notice>{notice}</Notice>}
      {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      <div className="flex items-center justify-between">
        <p>
          Warehouse: {items.length} of {capacity}
        </p>
        <GameButton
          small
          disabled={!items.length || action.isPending}
          onClick={() => void run('warehouse/claim', {}, claimed)}
        >
          Claim all
        </GameButton>
      </div>
      <ul aria-label="Warehouse" className="flex flex-col gap-1">
        {items.map((row) => (
          <li
            key={row.inventoryId}
            style={ROW_STYLE}
            className="grid grid-cols-[1fr_5rem_auto] items-center gap-2 text-xs"
          >
            <ItemCell item={row} />
            <span>{SOURCES[row.source]}</span>
            <GameButton
              small
              aria-label={`Claim ${marketItemName(row)}`}
              disabled={action.isPending}
              onClick={() =>
                void run('warehouse/claim', { inventoryId: row.inventoryId }, () => 'Item claimed.')
              }
            >
              Claim
            </GameButton>
          </li>
        ))}
        {items.length === 0 && <li>Your warehouse is empty.</li>}
      </ul>
      <section aria-label="Wallet" className="flex items-center gap-3">
        <span>Wallet:</span>
        <Price value={wallet.stone} currency="stone" />
        <Price value={wallet.gold} currency="gold" />
        <GameButton
          small
          disabled={(!wallet.stone && !wallet.gold) || action.isPending}
          onClick={() => void run('wallet/claim', {}, () => 'Wallet claimed.')}
        >
          Claim wallet
        </GameButton>
      </section>
      <p className="text-xs">
        Sale proceeds after the 10% tax wait in the wallet until you claim them.
      </p>
    </div>
  )
}
