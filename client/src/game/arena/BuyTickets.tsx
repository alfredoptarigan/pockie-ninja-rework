// Buy Arena Tickets / Buy Squad Arena Tickets (Reborn `Lc` / `yd`): a number of tickets (clamped
// to 1..max), "Cost: N Gift Certificates", Buy (disabled when short) and Cancel; a success
// replaces the window with "Purchase successful!" and OK.
import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { useArenaPost } from './api'

export function BuyTickets({
  title,
  path,
  price,
  max,
  hint,
  character,
  onClose,
}: {
  title: string
  /** POST path under /api/game/arena. */
  path: string
  /** Gift Certificates per ticket. */
  price: number
  max: number
  hint?: string
  character: Character
  onClose: () => void
}) {
  const [amount, setAmount] = useState(1)
  const [done, setDone] = useState(false)
  const buy = useArenaPost<{ character: Character }>()
  const cost = price * amount

  if (done)
    return (
      <Dialog title="Purchase successful!" onClose={onClose} className="w-[280px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-bold">Your purchase was successful!</p>
          <GameButton small onClick={onClose}>
            OK
          </GameButton>
        </div>
      </Dialog>
    )
  return (
    <Dialog title={title} onClose={onClose} className="w-[320px]">
      <form
        className="flex flex-col items-center gap-2 text-center"
        onSubmit={(event) => {
          event.preventDefault()
          buy.mutate({ path, body: { amount } }, { onSuccess: () => setDone(true) })
        }}
      >
        <label htmlFor="ticket-amount" className="font-bold">
          Number of tickets to buy
        </label>
        <input
          id="ticket-amount"
          type="number"
          min={1}
          max={max}
          value={amount}
          onChange={(event) =>
            setAmount(Math.max(1, Math.min(max, Math.floor(Number(event.target.value) || 1))))
          }
          className="game-field w-16 px-1 text-center"
        />
        <p>Cost: {cost.toLocaleString('en-US')} Gift Certificates</p>
        {hint && <p className="text-xs">{hint}</p>}
        {buy.isError && <Notice tone="error">{errorMessage(buy.error)}</Notice>}
        <div className="flex gap-2">
          <GameButton small type="submit" disabled={buy.isPending || character.giftCoupon < cost}>
            {buy.isPending ? 'Buying' : 'Buy'}
          </GameButton>
          <GameButton small onClick={onClose}>
            Cancel
          </GameButton>
        </div>
      </form>
    </Dialog>
  )
}
