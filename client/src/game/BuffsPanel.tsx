import { useState } from 'react'
import { errorMessage, useBuffs, useRemoveBuff } from './api'
import { GameButton, Notice } from './skin'
import { GameText, plainText } from './text'

/** The equipped title in Reborn's engraved plate lettering, or "No title". */
export function TitleText({ className = 'text-base' }: { className?: string }) {
  const title = useBuffs().data?.titles.find((entry) => entry.active)
  return (
    <span
      className={`font-bold tracking-widest text-[#9ba3b0] [text-shadow:0_1px_0_#2a2d31] ${className}`}
    >
      {title ? plainText(title.nameKey, `Title ${title.titleId}`) : 'No title'}
    </span>
  )
}

const expiry = (date: string | null) =>
  date ? `Expires ${new Date(date).toLocaleString('en-US')}` : 'Permanent'
/**
 * The timed effects (food, title bonuses) with Remove. Reborn lists them as icons under the HUD
 * portrait; ours opens from the Inventory's Effects button. Titles are picked in the title plate
 * (inventory/TitleSelect.tsx).
 */
export function BuffsPanel({ onClose }: { onClose: () => void }) {
  const query = useBuffs()
  const remove = useRemoveBuff()
  const [error, setError] = useState('')
  const busy = remove.isPending
  async function run(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  return (
    <section
      role="dialog"
      aria-label="Active effects"
      className="game-panel-1 absolute inset-x-[10px] top-[50px] z-20 max-h-[430px] space-y-3 overflow-y-auto p-3 text-ink-game"
    >
      <h2 className="font-bold">Active effects</h2>
      {query.isPending ? (
        <p>Loading effects...</p>
      ) : query.isError ? (
        <Notice tone="error">Could not load your effects.</Notice>
      ) : (
        <>
          {query.data.buffs.length === 0 && <p>No active effects.</p>}
          <ul className="space-y-2">
            {query.data.buffs.map((buff) => (
              <li key={buff.buffId}>
                <GameText k={buff.nameKey} fallback="Active effect" />{' '}
                <span>{expiry(buff.expiresAt)}</span>
                {buff.removable && (
                  <GameButton
                    disabled={busy}
                    onClick={() => void run(() => remove.mutateAsync(buff.buffId))}
                  >
                    Remove effect
                  </GameButton>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <GameButton disabled={busy} onClick={onClose}>
        Close
      </GameButton>
    </section>
  )
}
