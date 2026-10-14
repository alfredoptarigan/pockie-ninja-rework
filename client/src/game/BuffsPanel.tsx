import { useState } from 'react'
import { errorMessage, useActivateTitle, useBuffs, useRemoveBuff } from './api'
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
export function BuffsPanel({ onClose }: { onClose: () => void }) {
  const query = useBuffs()
  const activate = useActivateTitle()
  const remove = useRemoveBuff()
  const [error, setError] = useState('')
  const busy = activate.isPending || remove.isPending
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
      aria-label="Buffs and titles"
      className="game-panel absolute inset-x-[10px] top-[50px] z-20 max-h-[430px] space-y-3 overflow-y-auto p-3 text-ink-game"
    >
      <h2 className="font-bold">Buffs and titles</h2>
      {query.isPending ? (
        <p>Loading effects...</p>
      ) : query.isError ? (
        <Notice tone="error">Could not load your effects.</Notice>
      ) : (
        <>
          <h3 className="font-bold">Active effects</h3>
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
          <h3 className="font-bold">Owned titles</h3>
          {query.data.titles.length === 0 && (
            <p>No titles unlocked. Use a title item to unlock one.</p>
          )}
          <ul className="space-y-2">
            {query.data.titles.map((title) => (
              <li key={title.titleId}>
                <GameText k={title.nameKey} fallback={`Title ${title.titleId}`} />{' '}
                <span>{expiry(title.expiresAt)}</span>
                <GameButton
                  disabled={busy}
                  aria-label={`${title.active ? 'Unequip' : 'Equip'} title ${title.titleId}`}
                  onClick={() =>
                    void run(() => activate.mutateAsync(title.active ? 0 : title.titleId))
                  }
                >
                  {title.active ? 'Unequip' : 'Equip'}
                </GameButton>
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
