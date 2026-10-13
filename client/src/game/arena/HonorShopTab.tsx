// Honor shop (UI_ArenaShopEquip, scoreprize.ini) and Honor -> EXP (HonorExp.ini) at your tier.
import { useState } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { GameButton, Notice } from '../skin'
import { useArenaPost, useHonorShop } from './api'
import { tierName } from './labels'
import type { HonorShopResult } from '../../../../shared/src/schemas/arena'

const MAX_UNITS = 1000

export function HonorShopTab() {
  const shop = useHonorShop()
  const buy = useArenaPost<HonorShopResult>()
  const exchange = useArenaPost<HonorShopResult>()
  const [units, setUnits] = useState(1)
  const [message, setMessage] = useState<string | null>(null)
  if (shop.isPending) return <p>Loading...</p>
  if (shop.isError) return <Notice tone="error">{errorMessage(shop.error)}</Notice>
  const view = shop.data
  const busy = buy.isPending || exchange.isPending
  const cost = view.exchange.honor * units
  const error = buy.error ?? exchange.error
  return (
    <div className="flex flex-col gap-2">
      <p>
        Honor: <b>{view.honor}</b>
      </p>
      {message && <p role="status">{message}</p>}
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
      <form
        aria-label="Honor to EXP"
        className="game-card flex flex-wrap items-center gap-2 px-2 py-1 text-xs"
        onSubmit={(event) => {
          event.preventDefault()
          exchange.mutate(
            { path: 'shop/exchange', body: { units } },
            {
              onSuccess: (result) =>
                setMessage(
                  `Exchanged ${cost} Honor for ${view.exchange.exp * units} EXP.` +
                    (result.levelsGained ? ` Level up +${result.levelsGained}!` : ''),
                ),
            },
          )
        }}
      >
        <span className="font-bold">Honor to EXP</span>
        <span>
          {view.exchange.honor} Honor = {view.exchange.exp} EXP
        </span>
        <label htmlFor="honor-units">Units</label>
        <input
          id="honor-units"
          type="number"
          min={1}
          max={MAX_UNITS}
          value={units}
          onChange={(event) =>
            setUnits(Math.min(MAX_UNITS, Math.max(1, Math.floor(Number(event.target.value) || 1))))
          }
          className="game-field w-16 px-1"
        />
        <GameButton small type="submit" disabled={busy || cost > view.honor}>
          Exchange
        </GameButton>
      </form>
      <ul aria-label="Honor shop" className="grid grid-cols-2 gap-1">
        {view.offers.map((offer) => {
          const name = itemName(offer.itemId)
          const locked = view.tier < offer.minTier
          return (
            <li key={offer.itemId} className="game-card flex items-center gap-2 px-2 py-1 text-xs">
              <ItemIcon itemId={offer.itemId} name={name} />
              <span className="flex flex-1 flex-col">
                <span className="font-bold">{name}</span>
                <span>{offer.honor} Honor</span>
                {locked && <span>Needs {tierName(offer.minTier)}</span>}
              </span>
              <GameButton
                small
                aria-label={`Buy ${name}`}
                disabled={busy || locked || offer.honor > view.honor}
                onClick={() =>
                  buy.mutate(
                    { path: 'shop/buy', body: { itemId: offer.itemId } },
                    { onSuccess: () => setMessage(`You bought ${name}.`) },
                  )
                }
              >
                Buy
              </GameButton>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
