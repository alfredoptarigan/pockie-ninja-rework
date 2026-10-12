// The five cards after a clear (TGCardSystem): show all, shuffle, re-deal, peek, take.
import type { CardsView, CardTakeResult, Character, GateRunView } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { GameButton, Notice } from '../skin'
import { useGatePost } from './api'

type Currency = 'gold' | 'giftCoupon'

/** What the take granted and what all five cards held. */
export function TakenCards({ result, onDone }: { result: CardTakeResult; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="font-bold">
        {result.card ? `You took ${itemName(result.card.itemId)}.` : 'You took nothing.'}
      </p>
      <p>The cards held:</p>
      <ul className="flex gap-2">
        {result.cards.map((card, index) => (
          <li key={index}>
            <ItemIcon itemId={card.itemId} name={itemName(card.itemId)} />
          </li>
        ))}
      </ul>
      <GameButton small onClick={onDone}>
        Done
      </GameButton>
    </div>
  )
}

export function CardFlip({
  cards,
  onTaken,
}: {
  cards: CardsView
  onTaken: (result: CardTakeResult) => void
}) {
  const [currency, setCurrency] = useState<Currency>('gold')
  const step = useGatePost<{ run: GateRunView; character: Character }>()
  const take = useGatePost<CardTakeResult>()
  const busy = step.isPending || take.isPending
  const send = (path: string, body: object = {}) => step.mutate({ path: `cards/${path}`, body })
  const pay = { currency }
  const price = (cost: number | null) =>
    cost === null ? 'none left' : `${cost} ${currency === 'gold' ? 'Gold' : 'Gift Coupons'}`

  const faceDown = cards.state !== 2
  return (
    <div className="flex flex-col gap-2">
      <p>Toll gate cleared! Take one of the five cards.</p>
      <label>
        Pay with{' '}
        <select
          aria-label="Card currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value as Currency)}
        >
          <option value="gold">Gold</option>
          <option value="giftCoupon">Gift Coupons</option>
        </select>
      </label>
      <ol className="grid grid-cols-5 gap-2">
        {cards.cards.map((card, index) => (
          <li
            key={index}
            className="flex min-h-28 flex-col items-center gap-1 rounded border border-wood-light bg-white/40 p-2 text-xs"
          >
            <p className="font-bold">Card {index + 1}</p>
            <div className="flex flex-1 items-center">
              {card ? <ItemIcon itemId={card.itemId} name={itemName(card.itemId)} /> : 'Face down'}
            </div>
            {faceDown && (
              <GameButton
                small
                aria-label={`Peek at card ${index + 1}`}
                disabled={busy || Boolean(card) || cards.peekCost === null}
                onClick={() => send('peek', { index, currency })}
              >
                Peek
              </GameButton>
            )}
            <GameButton
              small
              aria-label={`Take card ${index + 1}`}
              disabled={busy}
              onClick={() =>
                take.mutate({ path: 'cards/take', body: { index } }, { onSuccess: onTaken })
              }
            >
              Take
            </GameButton>
          </li>
        ))}
      </ol>
      <p className="text-xs">
        Peeks used {cards.peeks} / 5. Next peek: {price(cards.peekCost)}.
      </p>
      <div className="flex flex-wrap gap-2">
        {cards.state !== 2 && (
          <GameButton small disabled={busy} onClick={() => send('show-all', pay)}>
            Show All ({price(cards.showAllCost)})
          </GameButton>
        )}
        {cards.state === 2 && (
          <GameButton small disabled={busy} onClick={() => send('shuffle')}>
            Shuffle
          </GameButton>
        )}
        <GameButton small disabled={busy} onClick={() => send('redeal', pay)}>
          Re-deal ({price(cards.redealCost)})
        </GameButton>
      </div>
      {(step.error || take.error) && (
        <Notice tone="error">{errorMessage(step.error ?? take.error)}</Notice>
      )}
    </div>
  )
}
