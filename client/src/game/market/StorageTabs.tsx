// My Listings (take down). The Warehouse tab lives in Warehouse.tsx.
import { useState } from 'react'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { useMarketAction, useMarketMine } from './api'
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
