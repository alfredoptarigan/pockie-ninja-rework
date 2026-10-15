// Squad Arena Exchange (Team Coins) and Championship Shop (Hero Coins): the balance and one card
// per offer with "Purchase", disabled when the balance is short.
import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice } from '../skin'
import { useArenaPost } from './api'
import type { CoinOfferView } from '../../../../shared/src/schemas/arena-extras'

export function CoinShop({
  title,
  coin,
  balance,
  offers,
  path,
  info,
  onClose,
}: {
  title: string
  /** "Team Coins" / "Hero Coins". */
  coin: string
  balance: number
  offers: CoinOfferView[]
  path: string
  info?: string[]
  onClose: () => void
}) {
  const buy = useArenaPost<{ character: Character }>()
  const [message, setMessage] = useState<string | null>(null)
  return (
    <Dialog title={title} onClose={onClose} className="w-[620px]">
      <p>
        {coin}: <b>{balance.toLocaleString('en-US')}</b>
      </p>
      {info && (
        <ul aria-label={`How to get ${coin}`} className="text-xs">
          {info.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {message && <p role="status">{message}</p>}
      {buy.isError && <Notice tone="error">{errorMessage(buy.error)}</Notice>}
      <ul aria-label={title} className="mt-2 grid grid-cols-3 gap-2">
        {offers.map((offer) => {
          const name = itemName(offer.itemId)
          return (
            <li key={offer.id} className="game-card flex flex-col items-center gap-1 p-2 text-xs">
              <ItemIcon itemId={offer.itemId} name={name} />
              <span className="text-center font-bold">
                {name}
                {offer.amount > 1 ? ` x${offer.amount}` : ''}
              </span>
              <span>
                {offer.price.toLocaleString('en-US')} {coin}
              </span>
              <GameButton
                small
                aria-label={`Purchase ${name}`}
                disabled={buy.isPending || balance < offer.price}
                onClick={() =>
                  buy.mutate(
                    { path, body: { id: offer.id } },
                    { onSuccess: () => setMessage(`Purchased ${name}!`) },
                  )
                }
              >
                Purchase
              </GameButton>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}
