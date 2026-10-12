// Drops of a monster: the items it can drop (GET /scene `drops`, no chances), as a disclosure
// button for the keyboard list, and as the panel the scene picture shows while a portrait is
// hovered (HTML, so it lies above the chat and the other HUD overlays).
import { useId, useRef, useState } from 'react'
import { ItemIcon } from './ItemIcon'
import { useMonsterPortrait } from './art'
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

/** Drops per column of the hover panel; longer lists wrap into more columns. */
const ROWS_PER_COLUMN = 8
const COLUMN_WIDTH = 190
const SHADOW = '[text-shadow:2px_2px_4px_#000,-2px_-2px_4px_#000]'

/**
 * The area's monsters as cards in a row at the top centre of the HUD, drawn 1:1 like Pockie
 * Ninja Reborn's monster boxes (the original List.HobgoblinBG card, a 50px portrait, the level
 * and the name). A click starts the fight; hovering shows the Drops panel under the card. The
 * row is a pointer twin of SceneView's "Scene actions" list, which keeps keyboard access.
 */
export function MonsterRow({
  monsters,
  onFight,
}: {
  monsters: SceneMonster[]
  onFight: (monster: SceneMonster) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const portraitOf = useMonsterPortrait()
  const shown = monsters.flatMap((monster) => {
    const portrait = portraitOf(monster.id)
    return portrait ? [{ monster, portrait }] : []
  })
  if (shown.length === 0) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-auto absolute top-[30px] left-1/2 flex -translate-x-1/2 gap-[3px] font-game"
    >
      {shown.map(({ monster, portrait }) => {
        const name = plainText(monster.nameKey, 'Monster')
        return (
          <div key={monster.id} className="relative h-[86px] w-[67px]">
            <button
              type="button"
              tabIndex={-1}
              data-testid="monster-card"
              title={name}
              onClick={() => {
                setHovered(null)
                onFight(monster)
              }}
              onMouseEnter={() => setHovered(monster.id)}
              onMouseLeave={() => setHovered(null)}
              className="game-monster-card absolute inset-0 cursor-pointer hover:brightness-110"
            >
              <img
                src={portrait}
                alt=""
                className="absolute top-[4px] left-[8px] size-[50px] object-contain"
              />
              <span className="absolute top-[35px] left-[8px] h-5 w-[51px] bg-linear-to-t from-black/70 to-transparent" />
              <span
                className={`absolute top-[43px] left-[8px] font-mono text-xs text-[#ffd700] ${SHADOW}`}
              >
                Lv.{monster.level}
              </span>
              <span className="absolute top-[66px] left-[4px] w-[62px] truncate text-center font-mono text-xs leading-[18px] font-bold text-[#f5f5f5]">
                {name}
              </span>
            </button>
            {hovered === monster.id && <DropsPanel monster={monster} />}
          </div>
        )
      })}
    </div>
  )
}

/** The hover panel under a monster card; it does not take the pointer (the card keeps the hover). */
export function DropsPanel({ monster }: { monster: SceneMonster }) {
  const name = plainText(monster.nameKey, 'Monster')
  const drops = monster.drops ?? []
  const columns = Math.max(1, Math.ceil(drops.length / ROWS_PER_COLUMN))
  return (
    <section
      aria-label={`${name} drops`}
      className="game-hud pointer-events-none absolute top-[90px] left-1/2 z-30 -translate-x-1/2 overflow-hidden p-2 font-game text-xs"
      style={{ width: columns * COLUMN_WIDTH, background: 'rgb(28 31 33 / 0.96)' }}
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
  )
}
