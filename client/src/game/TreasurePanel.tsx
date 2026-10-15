import { useState } from 'react'
import { errorMessage, useOpenTreasure, usePickTreasure, type PendingTreasure } from './api'
import type { InventoryItem } from './types'
import { GameButton, Notice } from './skin'
import { plainText } from './text'
import { itemNameKey } from './world'

const costs: Record<string, { keys: number; gold: number }> = {
  i159000: { keys: 5, gold: 50 },
  i159001: { keys: 3, gold: 30 },
  i159002: { keys: 2, gold: 20 },
  i159003: { keys: 1, gold: 10 },
}
export function TreasurePanel({
  box,
  pending,
  onClose,
}: {
  box: InventoryItem | null
  pending: PendingTreasure | null
  onClose: () => void
}) {
  const open = useOpenTreasure()
  const pick = usePickTreasure()
  const [treasure, setTreasure] = useState(pending)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const busy = open.isPending || pick.isPending
  const terms = box && costs[box.itemId]
  async function pay(currency: 'gold' | 'giftCoupon') {
    setError('')
    try {
      setTreasure((await open.mutateAsync({ id: box!.id, currency })).treasure)
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  async function choose(slot: number) {
    setError('')
    try {
      const result = await pick.mutateAsync({ id: treasure!.id, slot })
      setMessage(
        `Received ${plainText(itemNameKey(result.reward.itemId), 'treasure')} x${result.reward.count}.`,
      )
      setTreasure(null)
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  return (
    <section
      role="dialog"
      aria-label="Treasure box"
      className="game-panel-1 absolute inset-x-[20px] top-[100px] z-20 space-y-3 p-4 text-ink-game"
    >
      <h2 className="font-bold">Treasure box</h2>
      {message ? (
        <p>{message}</p>
      ) : treasure ? (
        <>
          <p>Pick one of five cards. You receive one reward.</p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }, (_, slot) => (
              <GameButton key={slot} disabled={busy} onClick={() => void choose(slot)}>
                Card {slot + 1}
              </GameButton>
            ))}
          </div>
        </>
      ) : (
        terms && (
          <>
            <p>
              Uses {terms.keys} Seal Breakers first. If you have fewer, opening costs {terms.gold}{' '}
              Gold or Gift Coupons.
            </p>
            <GameButton disabled={busy} onClick={() => void pay('gold')}>
              Open with Gold
            </GameButton>
            <GameButton disabled={busy} onClick={() => void pay('giftCoupon')}>
              Open with Gift Coupons
            </GameButton>
          </>
        )
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <GameButton disabled={busy} onClick={onClose}>
        Close
      </GameButton>
    </section>
  )
}
