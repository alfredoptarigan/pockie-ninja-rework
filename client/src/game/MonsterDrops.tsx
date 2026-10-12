// Drops of a monster: the items it can drop (GET /scene `drops`, no chances), as a disclosure
// button for the keyboard list, and as the panel the scene picture shows while a portrait is
// hovered (HTML, so it lies above the chat and the other HUD overlays).
import { useId, useRef, useState, type CSSProperties } from 'react'
import { ItemIcon } from './ItemIcon'
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
      {/* Long lists scroll inside the stage instead of running off its bottom. */}
      <div
        id={id}
        hidden={!open}
        role="region"
        tabIndex={open ? 0 : -1}
        aria-label={`Drops of ${name}`}
        className="game-card max-h-56 w-full min-w-48 overflow-y-auto p-1.5 text-ink-game"
      >
        {drops.length === 0 ? (
          <p>{name} drops nothing.</p>
        ) : (
          <ItemList items={drops} label={`${name} drops`} />
        )}
      </div>
    </div>
  )
}

/** HUD pixels of the 1280x720 stage the panel is laid out on. */
const HUD = { width: 1280, height: 720, margin: 4 }
/** Drops per column of the hover panel; longer lists wrap into more columns. */
const ROWS_PER_COLUMN = 8
const COLUMN_WIDTH = 190

/**
 * The hover panel under a monster portrait. `at` is its top centre as fractions of the stage; the
 * panel is kept inside the stage and does not take the pointer (the picture keeps the hover).
 */
export function DropsPanel({
  monster,
  at,
}: {
  monster: SceneMonster
  at: { x: number; y: number }
}) {
  const name = plainText(monster.nameKey, 'Monster')
  const drops = monster.drops ?? []
  const columns = Math.max(1, Math.ceil(drops.length / ROWS_PER_COLUMN))
  const width = columns * COLUMN_WIDTH
  const left = Math.min(
    Math.max(HUD.margin, at.x * HUD.width - width / 2),
    HUD.width - width - HUD.margin,
  )
  const top = at.y * HUD.height
  return (
    // The keyboard list (DropsMenu) is the accessible twin; this follows the hidden canvas.
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-30 h-[720px] w-[1280px] [zoom:var(--hud-scale,1)]"
    >
      <section
        aria-label={`${name} drops`}
        className="game-hud absolute overflow-hidden p-2 font-game text-xs"
        // Nearly opaque: the scene's labels would show through the HUD plate's usual alpha.
        style={
          {
            left,
            top,
            width,
            maxHeight: HUD.height - top - HUD.margin,
            background: 'rgb(28 31 33 / 0.96)',
          } as CSSProperties
        }
      >
        <h3 className="mb-1 text-center font-bold text-trim">Drops</h3>
        {drops.length === 0 ? (
          <p>{name} drops nothing.</p>
        ) : (
          <ul
            className="grid grid-flow-col gap-x-3 gap-y-1"
            style={{ gridTemplateRows: `repeat(${Math.min(drops.length, ROWS_PER_COLUMN)}, auto)` }}
          >
            {drops.map(({ itemId, nameKey }, i) => (
              <li key={`${itemId}-${i}`} className="flex min-w-0 items-center gap-1.5">
                <ItemIcon
                  itemId={itemId}
                  name={plainText(nameKey, 'Unknown item')}
                  className="size-7"
                />
                <span className="leading-tight">{plainText(nameKey, 'Unknown item')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
