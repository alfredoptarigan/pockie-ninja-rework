import { useState } from 'react'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { useMarketAction, useMarketMine } from './api'
import { ItemCell, marketItemName, Price, ROW_STYLE } from './parts'

const HOURS = [8, 12, 24] as const
const MAX_PRICE = 1_000_000

/** A price field behind a checkbox: unchecked means "not offered in this currency". */
function PriceField({
  label,
  enabled,
  value,
  onEnabled,
  onValue,
}: {
  label: string
  enabled: boolean
  value: number
  onEnabled: (on: boolean) => void
  onValue: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex w-28 items-center gap-1">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
        {label}
      </label>
      <input
        type="number"
        aria-label={`${label} per unit`}
        min={1}
        max={MAX_PRICE}
        disabled={!enabled}
        value={value}
        onChange={(event) =>
          onValue(Math.min(MAX_PRICE, Math.max(1, Math.floor(Number(event.target.value)) || 1)))
        }
        className="w-28 rounded border border-wood-light bg-white px-1 disabled:opacity-50"
      />
    </div>
  )
}

export function SellTab() {
  const mine = useMarketMine()
  const action = useMarketAction()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [count, setCount] = useState(1)
  const [stone, setStone] = useState({ on: true, value: 100 })
  const [gold, setGold] = useState({ on: false, value: 1 })
  const [hours, setHours] = useState<(typeof HOURS)[number]>(8)
  const [notice, setNotice] = useState('')
  if (mine.isPending) return <p>Loading your bag...</p>
  if (mine.isError) return <Notice tone="error">{errorMessage(mine.error)}</Notice>
  const view = mine.data
  const active = view.listings.filter((listing) => !listing.expired).length
  const selected = view.sellable.find((row) => row.inventoryId === selectedId)
  const full = active >= view.maxListings
  async function submit() {
    if (!selected) return
    setNotice('')
    try {
      await action.mutateAsync({
        action: 'list',
        body: {
          inventoryId: selected.inventoryId,
          count,
          priceStone: stone.on ? stone.value : null,
          priceGold: gold.on ? gold.value : null,
          hours,
        },
      })
      setSelectedId(null)
      setNotice(`${marketItemName(selected)} is on the Market.`)
    } catch {
      /* Rendered below. */
    }
  }
  return (
    <div className="flex gap-3">
      <section aria-label="Items you can sell" className="w-64 shrink-0">
        <p className="mb-1 text-xs">
          Unbound, tradable items in your bag. Equipment needs 2 to 4 identified properties.
        </p>
        <ul className="flex h-[20rem] flex-col gap-1 overflow-auto">
          {view.sellable.map((row) => (
            <li key={row.inventoryId}>
              <button
                type="button"
                aria-pressed={row.inventoryId === selectedId}
                onClick={() => {
                  setSelectedId(row.inventoryId)
                  setCount(row.count)
                  setNotice('')
                }}
                style={ROW_STYLE}
                className="w-full text-left text-xs aria-pressed:brightness-110"
              >
                <ItemCell item={row} />
              </button>
            </li>
          ))}
          {view.sellable.length === 0 && (
            <li className="text-xs">Nothing in your bag can be sold.</li>
          )}
        </ul>
      </section>
      <section aria-label="Listing" className="flex flex-1 flex-col gap-2 text-sm">
        <p>
          Listings: {active} of {view.maxListings}
        </p>
        {notice && <Notice>{notice}</Notice>}
        {full && (
          <Notice>You have the most listings allowed. Wait for a sale or take one down.</Notice>
        )}
        {!selected ? (
          <p>Pick an item to sell.</p>
        ) : (
          <>
            <ItemCell item={selected} />
            <label className="flex items-center gap-2">
              Quantity
              <input
                type="number"
                min={1}
                max={selected.count}
                value={count}
                onChange={(event) =>
                  setCount(
                    Math.min(
                      selected.count,
                      Math.max(1, Math.floor(Number(event.target.value)) || 1),
                    ),
                  )
                }
                className="w-20 rounded border border-wood-light bg-white px-1"
              />
            </label>
            <PriceField
              label="Stone"
              enabled={stone.on}
              value={stone.value}
              onEnabled={(on) => setStone({ ...stone, on })}
              onValue={(value) => setStone({ ...stone, value })}
            />
            <PriceField
              label="Gold"
              enabled={gold.on}
              value={gold.value}
              onEnabled={(on) => setGold({ ...gold, on })}
              onValue={(value) => setGold({ ...gold, value })}
            />
            <p className="text-xs">Prices are per unit. Buyers pay every price you set.</p>
            <fieldset className="flex items-center gap-3">
              <legend className="mb-1">Duration</legend>
              {HOURS.map((h) => (
                <label key={h} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="market-hours"
                    checked={hours === h}
                    onChange={() => setHours(h)}
                  />
                  {h} hours
                </label>
              ))}
            </fieldset>
            <p className="flex items-center gap-1">
              Listing fee: <Price value={view.fees[String(hours) as '8']} currency="stone" />
              <span className="text-xs">(not refunded; 10% tax on every sale)</span>
            </p>
            {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
            <div>
              <GameButton
                disabled={full || (!stone.on && !gold.on) || action.isPending}
                onClick={() => void submit()}
              >
                List item
              </GameButton>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
