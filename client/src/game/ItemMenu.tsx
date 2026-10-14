// Reborn's item context menu (#context-menu): opened by clicking or right-clicking an item, a
// dark 5px frame (Common/SmallBG2; our closest piece is the tooltip frame), one whitesmoke 12px
// Arial line per action. Escape, a click elsewhere or picking an action closes it.
import { useEffect, useId, useRef, type MouseEvent } from 'react'

/** Gap between a clicked cell and its menu. */
const MENU_OFFSET = 4

/**
 * Where to open the menu for a click: beside the cell, or at the pointer for a right click;
 * relative to the nearest `data-menu-root` ancestor (the window content).
 */
export function menuAt(event: MouseEvent<HTMLElement>) {
  event.preventDefault()
  const root = event.currentTarget.closest('[data-menu-root]')!.getBoundingClientRect()
  const cell = event.currentTarget.getBoundingClientRect()
  const atPointer = event.type === 'contextmenu' && event.clientX > 0
  return {
    x: (atPointer ? event.clientX : cell.right) - root.left + MENU_OFFSET,
    y: (atPointer ? event.clientY : cell.top) - root.top,
  }
}

export interface MenuEntry {
  label: string
  /** Accessible name when the label alone is ambiguous ("Equip Newbie Swiping Fists"). */
  name?: string
  disabled?: boolean
  /** Why the entry is disabled; shown under it and read as its description. */
  reason?: string
  onSelect: () => void
}

export function ItemMenu({
  title,
  at,
  entries,
  onClose,
}: {
  /** The item name: the menu's accessible name (Reborn shows no heading). */
  title: string
  /** Top-left corner, relative to the positioned parent (the inventory window). */
  at: { x: number; y: number }
  entries: MenuEntry[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [onClose])
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // The Escape would otherwise also close the inventory dialog.
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      className="absolute z-[60] min-w-[73px] p-[5px] font-game text-xs text-[whitesmoke]"
      style={{
        left: at.x,
        top: at.y,
        borderStyle: 'solid',
        borderImage: 'var(--ui-tooltip) var(--ui-tooltip-slice) fill / var(--ui-tooltip-border)',
      }}
    >
      {entries.length === 0 && <p className="text-[#8e8e8e]">No actions</p>}
      {entries.map((entry, index) => (
        <div key={entry.label}>
          <button
            type="button"
            role="menuitem"
            aria-label={entry.name}
            aria-describedby={entry.reason ? `${id}-${index}` : undefined}
            disabled={entry.disabled}
            onClick={() => {
              onClose()
              entry.onSelect()
            }}
            className="block h-[14px] w-full cursor-pointer text-left leading-[14px] whitespace-nowrap hover:text-[#f0d060] disabled:cursor-not-allowed disabled:text-[#8e8e8e]"
          >
            {entry.label}
          </button>
          {entry.reason && (
            <span id={`${id}-${index}`} className="block max-w-[150px] text-[11px] text-[#ff8a80]">
              {entry.reason}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
