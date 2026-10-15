// Reborn's bag (reborn-windows-A-L.md, "Inventory"): tabs I-X over a 10x6 grid of 27px tiles,
// each item drawn at its server tile (page / slot of its top-left corner) over the tiles it
// covers. While an item is held every tile is a button, so a click drops the item there.
import { BAG_PAGE_COLUMNS, BAG_PAGE_COUNT, BAG_PAGE_SLOTS, type GearView } from '@pockie/shared'
import { useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { itemIcon } from '../ItemIcon'
import { GameButton } from '../skin'
import { GameText } from '../text'
import type { InventoryItem } from '../types'
import { useOpenWindow } from '../windows'
import { WING_ICONS } from '../wings'
import { itemName, outfitIcon } from './outfits'

export const TILE = 27
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
/** Reborn's tier glow by refinement line count (wings are tier 6). */
const TIER_GLOW = ['#ffffff', '#22dd22', '#3399ff', '#aa55ee', '#ff9900', '#ee4444', '#ffcc00']
const WING_TIER = 6
/** A held item over a tab for this long switches to it. */
const TAB_HOVER_MS = 300

/** Refinement lines of gear (0 for anything else, or gear not appraised yet). */
export const refineLines = (gear: GearView | undefined) => (gear?.appraised ? gear.props.length : 0)

const tierOf = (item: InventoryItem, gear: GearView | undefined) =>
  item.info?.equipSlot === 'Wing' ? WING_TIER : Math.min(refineLines(gear), WING_TIER)

/** Icon span of 1-3 tiles: 24, 51 or 78px (27px pitch less Reborn's 3px gap). */
export const span = (tiles = 2) => tiles * TILE - 3

export const iconFile = (itemId: string) => itemIcon(itemId)?.file ?? WING_ICONS[itemId]
/** An item's picture file; outfits use Reborn's icon by clothing. */
export const pictureOf = (item: InventoryItem) =>
  item.info?.outfit ? outfitIcon(item.info.outfit.clothing) : iconFile(item.itemId)

/**
 * An item's picture with its tier glow, or a neutral "?" when it has none; named after the item
 * unless `decorative` (a worn item, which its slot names).
 */
export function ItemPicture({
  item,
  gear,
  decorative = false,
}: {
  item: InventoryItem
  gear?: GearView
  decorative?: boolean
}) {
  const name = decorative ? undefined : itemName(item)
  const file = pictureOf(item)
  if (!file)
    return (
      <span
        role={name && 'img'}
        aria-label={name}
        aria-hidden={!name}
        className="grid size-full place-items-center rounded-sm bg-white/15 text-xs font-bold text-white after:content-['?']"
      />
    )
  return (
    <img
      src={file}
      alt={name ?? ''}
      className="size-full object-contain"
      style={{ filter: `drop-shadow(0 0 3px ${TIER_GLOW[tierOf(item, gear)]})` }}
    />
  )
}

export interface CellHandlers {
  onClick: (item: InventoryItem, event: MouseEvent<HTMLElement>) => void
  onMenu: (item: InventoryItem, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  onLock: (item: InventoryItem) => void
  /** Shows the tooltip of `item` for a pointer (or focus) at `at`, in screen pixels. */
  onTip: (item: InventoryItem | null, at?: Point) => void
}

export interface Point {
  x: number
  y: number
}

/** Where a pointer is, or the top-right corner of a focused cell. */
export const pointOf = (event: { clientX?: number; clientY?: number; currentTarget: Element }) => {
  if (event.clientX !== undefined && event.clientY !== undefined)
    return { x: event.clientX, y: event.clientY }
  const box = event.currentTarget.getBoundingClientRect()
  return { x: box.right, y: box.top }
}

export function BagGrid({
  items,
  page,
  onPage,
  heldId,
  holding,
  markedId,
  menuId,
  selected,
  gear,
  level,
  onTile,
  ...handlers
}: CellHandlers & {
  /** Bag items (not worn). */
  items: InventoryItem[]
  page: number
  onPage: (page: number) => void
  heldId: string | null
  holding: boolean
  markedId?: string
  menuId?: string
  /** Items picked in Multi Sell. */
  selected: string[]
  gear: Record<string, GearView>
  level: number
  onTile: (page: number, slot: number) => void
}) {
  const hover = useRef<ReturnType<typeof setTimeout>>(undefined)
  const shown = items.filter((item) => item.page === page)
  return (
    <>
      <div className="game-inset absolute top-[313px] left-0 h-[200px] w-[369px]" />
      <div role="tablist" aria-label="Bag tabs" className="absolute top-[318px] left-[10px] flex">
        {ROMAN.slice(0, BAG_PAGE_COUNT).map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={index === page}
            onClick={() => onPage(index)}
            onPointerEnter={() => {
              if (holding) hover.current = setTimeout(() => onPage(index), TAB_HOVER_MS)
            }}
            onPointerLeave={() => clearTimeout(hover.current)}
            className="game-tab h-[22px] w-[27px] px-0 text-[13px] tracking-[-0.5px] text-black"
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        aria-label={`Bag ${ROMAN[page]}`}
        className="game-inset absolute top-[340px] left-[5px] h-[170px] w-[279px]"
      >
        <div
          className="absolute top-[5px] left-[5px] h-[160px] w-[271px]"
          style={{ background: `var(--ui-slot) 0 0 / ${TILE}px ${TILE}px` }}
        >
          {holding && (
            <div role="group" aria-label="Bag tiles">
              {Array.from({ length: BAG_PAGE_SLOTS }, (_, slot) => (
                <button
                  key={slot}
                  type="button"
                  aria-label={`Tile ${slot + 1}`}
                  onClick={() => onTile(page, slot)}
                  className="absolute size-[27px] cursor-pointer"
                  style={tileAt(slot)}
                />
              ))}
            </div>
          )}
          <ul aria-label="Bag" className="pointer-events-none absolute inset-0">
            {shown.map((item) => (
              <BagCell
                key={item.id}
                item={item}
                held={item.id === heldId}
                highlighted={item.id === markedId}
                open={item.id === menuId}
                selected={selected.includes(item.id)}
                gear={gear[item.id]}
                level={level}
                {...handlers}
              />
            ))}
          </ul>
        </div>
        {items.length === 0 && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-white [text-shadow:var(--shadow-game-text)]">
            Your bag is empty.
          </p>
        )}
      </div>
    </>
  )
}

const tileAt = (slot: number) => ({
  left: (slot % BAG_PAGE_COLUMNS) * TILE,
  top: Math.floor(slot / BAG_PAGE_COLUMNS) * TILE,
})

/** One bag item over the tiles it covers. */
function BagCell({
  item,
  held,
  highlighted,
  open,
  selected,
  gear,
  level,
  onClick,
  onMenu,
  onLock,
  onTip,
}: CellHandlers & {
  item: InventoryItem
  held: boolean
  highlighted: boolean
  open: boolean
  selected: boolean
  gear?: GearView
  level: number
}) {
  const name = itemName(item)
  const outfit = item.info?.outfit
  const overLevel = item.info?.kind === 'equip' && item.info.level > level
  return (
    <li
      className={`pointer-events-auto absolute ${held ? 'opacity-0' : ''} ${
        highlighted ? 'ring-2 ring-[#ffb300]' : ''
      } ${selected ? 'outline-2 outline-[#ff2a2a]' : ''} ${open ? 'shadow-[inset_0_0_0_2px_#fff2ae]' : ''}`}
      style={{ ...tileAt(item.slot ?? 0), width: span(item.info?.w), height: span(item.info?.h) }}
    >
      <ItemPicture item={item} gear={gear} />
      {item.count > 1 && (
        <span
          aria-hidden="true"
          className="absolute right-[1px] bottom-0 text-[12px] leading-none text-white [text-shadow:var(--shadow-game-text)]"
        >
          x{item.count}
        </span>
      )}
      {outfit && <OutfitPlus plus={outfit.plus} under={overLevel} />}
      {overLevel && !outfit && (
        <span
          aria-hidden="true"
          className="absolute right-[1px] bottom-0 text-[9px] leading-none font-bold text-[#ff3030] [text-shadow:var(--shadow-game-text)]"
        >
          Lv:{item.info!.level}
        </span>
      )}
      <button
        type="button"
        aria-label={name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => onClick(item, event)}
        onContextMenu={(event) => onMenu(item, event)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          onMenu(item, event)
        }}
        onPointerEnter={(event) => onTip(item, pointOf(event))}
        onPointerMove={(event) => onTip(item, pointOf(event))}
        onPointerLeave={() => onTip(null)}
        onFocus={(event) => onTip(item, pointOf(event))}
        onBlur={() => onTip(null)}
        className="absolute inset-0 cursor-pointer"
      />
      {item.locked && (
        <button
          type="button"
          aria-label={`Unlock ${name}`}
          onClick={() => onLock(item)}
          className="absolute -top-[2px] right-0 cursor-pointer text-[9px] leading-none"
        >
          🔒
        </button>
      )}
      <span className="sr-only">
        <span>{outfit ? name : <GameText k={item.nameKey} fallback="Unknown item" />}</span>
        {item.count > 1 && <span> x{item.count}</span>}
        {highlighted && (
          <>
            {' '}
            (<span>Next step</span>)
          </>
        )}
      </span>
    </li>
  )
}

/** Reborn's outfit "+N" (11px bold, bottom-right), red when you are below its level. */
export function OutfitPlus({ plus, under }: { plus: number; under: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute right-[2px] bottom-0 text-[11px] leading-none font-bold [text-shadow:var(--shadow-game-text)] ${
        under ? 'text-[#ff1a1a]' : 'text-white'
      }`}
    >
      +{plus}
    </span>
  )
}

/**
 * Reborn's side column (x 288 from y 331, 30 apart). Compose opens the Portable Function,
 * Collection the Collection window, Wardrobe the Wardrobe panel. ponytail: Reroll has no system
 * behind it yet (pets are not items), so it stays disabled.
 */
export function SideButtons({
  onMultiSell,
  onWardrobe,
  onSort,
}: {
  onMultiSell: () => void
  onWardrobe: () => void
  onSort: () => void
}) {
  const openWindow = useOpenWindow()
  const buttons: { label: string; onClick?: () => void }[] = [
    { label: 'Compose', onClick: () => openWindow('compose') },
    { label: 'Multi Sell', onClick: onMultiSell },
    { label: 'Collection', onClick: () => openWindow('collection') },
    { label: 'Wardrobe', onClick: onWardrobe },
    { label: 'Reroll' },
    { label: 'Sort', onClick: onSort },
  ]
  return (
    <div className="absolute top-[331px] left-[288px] flex w-[75px] flex-col gap-[5px]">
      {buttons.map(({ label, onClick }) => (
        <GameButton
          key={label}
          disabled={!onClick}
          onClick={onClick}
          className="h-[25px] w-[75px] min-w-0! px-0! whitespace-nowrap"
        >
          {label}
        </GameButton>
      ))}
    </div>
  )
}
