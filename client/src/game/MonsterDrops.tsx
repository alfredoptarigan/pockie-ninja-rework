// Drops menu of a monster: the items it can drop (GET /scene `drops`, no chances), as a disclosure
// button for the keyboard list. The scene picture shows the same list when a portrait is hovered.
import { useId, useRef, useState } from 'react'
import { ItemList } from './Rewards'
import { GameButton } from './skin'
import { plainText } from './text'
import type { SceneMonster } from './types'

export function DropsMenu({ monster }: { monster: SceneMonster }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  const name = plainText(monster.nameKey, 'Monster')
  const drops = monster.drops ?? []
  return (
    <div
      className="contents"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.stopPropagation()
        setOpen(false)
        button.current?.focus()
      }}
    >
      <GameButton
        ref={button}
        small
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Drops: ${name}`}
        onClick={() => setOpen(!open)}
      >
        Drops
      </GameButton>
      <div id={id} hidden={!open} className="game-card w-full min-w-48 p-1.5 text-ink-game">
        {drops.length === 0 ? (
          <p>{name} drops nothing.</p>
        ) : (
          <ItemList items={drops} label={`${name} drops`} />
        )}
      </div>
    </div>
  )
}
