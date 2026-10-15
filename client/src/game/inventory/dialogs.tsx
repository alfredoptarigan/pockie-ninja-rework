// Reborn's small Inventory windows (reborn-windows-A-L.md, "Inventory"): the confirm prompt,
// Use Multiple Items, Sort Inventory, Multi Sell and Manage Outfit. They open inside the
// Inventory window, so they stay in its modal top layer; Escape closes the top one.
import { VISUAL_OUTFIT_GOLD, type BagSortInput, type GearView } from '@pockie/shared'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { GameButton } from '../skin'
import { outfitName, plainText } from '../text'
import type { InventoryItem } from '../types'
import { ItemPicture, OutfitPlus, refineLines } from './BagGrid'
import { itemName, outfitIcon } from './outfits'

/** Reborn caps Use Multiple at 1000 per request. */
const USE_MULTIPLE_CAP = 1000
/** Multi Sell grades: "Sell Equipment Below X" selects gear with fewer than index + 1 lines. */
const GRADES = ['Gray', 'Green', 'Blue', 'Purple', 'Orange']
/** Selected items shown per Multi Sell page. */
const SELL_PAGE = 8
/** Outfits shown per page of Manage Outfit's picker. */
const PICK_PAGE = 8
const BUTTON = 'h-[26px] min-w-0! px-2!'

export function Panel({
  label,
  title,
  width,
  top,
  alert = false,
  onClose,
  children,
}: {
  label: string
  /** The title band; prompts have none. */
  title?: string
  width: number
  /** Distance from the Inventory's top (70px by default). */
  top?: number
  alert?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select')
      ?.focus()
  }, [])
  return (
    <div
      ref={ref}
      role={alert ? 'alertdialog' : 'dialog'}
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // Only this window closes, not the Inventory.
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      className="game-frame absolute top-[70px] left-1/2 z-[55] -translate-x-1/2 px-2 pt-1 pb-2 font-game text-xs"
      style={{ width, top }}
    >
      {title && (
        <div className="game-frame-title mb-1">
          <h3 className="game-title-tag inline-block">{title}</h3>
        </div>
      )}
      <div className="game-inset space-y-2 p-2">{children}</div>
    </div>
  )
}

export function ConfirmDialog({
  text,
  onAccept,
  onClose,
}: {
  text: string
  onAccept: () => void
  onClose: () => void
}) {
  return (
    <Panel label={text} width={240} alert onClose={onClose}>
      <p className="text-center">{text}</p>
      <div className="flex justify-center gap-3">
        <GameButton
          onClick={() => {
            onClose()
            onAccept()
          }}
        >
          Accept
        </GameButton>
        <GameButton onClick={onClose}>Deny</GameButton>
      </div>
    </Panel>
  )
}

export function UseMultipleDialog({
  item,
  onUse,
  onClose,
}: {
  item: InventoryItem
  onUse: (amount: number) => void
  onClose: () => void
}) {
  const max = Math.min(item.count, USE_MULTIPLE_CAP)
  const [amount, setAmount] = useState(1)
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= max
  return (
    <Panel label="Use Multiple Items" title="Use Multiple Items" width={280} onClose={onClose}>
      <p>{plainText(item.nameKey, 'Unknown item')}</p>
      <p>Available: {item.count}</p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          Amount
          <input
            type="number"
            min={1}
            max={max}
            value={amount}
            onChange={(event) => setAmount(event.target.valueAsNumber)}
            className="w-20 border border-[#5a5a5a] bg-white px-1 text-black"
          />
        </label>
        <GameButton small onClick={() => setAmount(max)}>
          MAX
        </GameButton>
      </div>
      <div className="flex justify-end gap-2">
        <GameButton disabled={!valid} onClick={() => onUse(amount)} className={BUTTON}>
          Use
        </GameButton>
        <GameButton onClick={onClose} className={BUTTON}>
          Close
        </GameButton>
      </div>
    </Panel>
  )
}

export function SortDialog({
  page,
  busy,
  onSort,
  onClose,
}: {
  page: number
  busy: boolean
  onSort: (input: BagSortInput) => void
  onClose: () => void
}) {
  const [stack, setStack] = useState(true)
  return (
    <Panel label="Sort Inventory" title="Sort Inventory" width={300} onClose={onClose}>
      <p>How do you want to sort your inventory?</p>
      <div className="flex gap-[10px]">
        <GameButton
          disabled={busy}
          onClick={() => onSort({ scope: 'tab', page, stack })}
          className="h-[30px] w-[90px]"
        >
          Current Tab
        </GameButton>
        <GameButton
          disabled={busy}
          onClick={() => onSort({ scope: 'all', stack })}
          className="h-[30px] w-[90px]"
        >
          All Tabs
        </GameButton>
        <GameButton onClick={onClose} className="h-[30px] w-[70px]">
          Close
        </GameButton>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={stack}
          onChange={(event) => setStack(event.target.checked)}
        />
        Stack identical items
      </label>
      {busy && <p role="status">Sorting items...</p>}
    </Panel>
  )
}

/** Bag gear "Sell Equipment Below <grade>" picks: unlocked, sellable, few refinement lines. */
const belowGrade = (items: InventoryItem[], gear: Record<string, GearView>, grade: number) =>
  items
    .filter(
      (item) =>
        item.info?.kind === 'equip' &&
        item.info.equipSlot !== 'Wing' &&
        item.info.sellPrice !== null &&
        !item.locked &&
        refineLines(gear[item.id]) < grade + 1,
    )
    .map((item) => item.id)

export function MultiSellDialog({
  items,
  gear,
  selected,
  onSelect,
  onSell,
  onClose,
}: {
  /** Bag items (not worn). */
  items: InventoryItem[]
  gear: Record<string, GearView>
  selected: string[]
  onSelect: (ids: string[]) => void
  onSell: () => void
  onClose: () => void
}) {
  const filterId = useId()
  const [page, setPage] = useState(0)
  const picked = selected.flatMap((id) => items.filter((item) => item.id === id))
  const pages = Math.max(1, Math.ceil(picked.length / SELL_PAGE))
  const shownPage = Math.min(page, pages - 1)
  return (
    <Panel label="Multi Sell" title="Multi Sell" width={300} onClose={onClose}>
      <p>Click items in your bag to select them.</p>
      <label htmlFor={filterId} className="sr-only">
        Select Filter
      </label>
      <select
        id={filterId}
        defaultValue=""
        onChange={(event) => {
          if (event.target.value === '') return
          onSelect(belowGrade(items, gear, GRADES.indexOf(event.target.value)))
        }}
        className="w-full border border-[#5a5a5a] bg-white px-1 text-black"
      >
        <option value="" disabled>
          Select Filter
        </option>
        {GRADES.map((grade) => (
          <option key={grade} value={grade}>
            Sell Equipment Below {grade}
          </option>
        ))}
      </select>
      <ul aria-label="Selected items" className="grid h-[112px] grid-cols-4 gap-1">
        {picked.slice(shownPage * SELL_PAGE, (shownPage + 1) * SELL_PAGE).map((item) => (
          <li key={item.id} className="relative size-[51px]">
            <ItemPicture item={item} gear={gear[item.id]} decorative />
            {item.count > 1 && (
              <span className="absolute right-[1px] bottom-0 text-[12px] text-white [text-shadow:var(--shadow-game-text)]">
                x{item.count}
              </span>
            )}
            <button
              type="button"
              aria-label={`Deselect ${plainText(item.nameKey, 'Unknown item')}`}
              onClick={() => onSelect(selected.filter((id) => id !== item.id))}
              className="absolute inset-0 cursor-pointer"
            />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <GameButton
            small
            aria-label="Previous page"
            onClick={() => setPage(shownPage - 1)}
            disabled={shownPage === 0}
          >
            {'<'}
          </GameButton>
          <span>
            {shownPage + 1}/{pages}
          </span>
          <GameButton
            small
            aria-label="Next page"
            onClick={() => setPage(shownPage + 1)}
            disabled={shownPage === pages - 1}
          >
            {'>'}
          </GameButton>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <GameButton disabled={!picked.length} onClick={onSell} className={BUTTON}>
          Sell
        </GameButton>
        <GameButton disabled={!picked.length} onClick={() => onSelect([])} className={BUTTON}>
          Clear
        </GameButton>
        <GameButton onClick={onClose} className={BUTTON}>
          Close
        </GameButton>
      </div>
    </Panel>
  )
}

/** One Manage Outfit box: a 12px bold label over a 62x62 cell with the outfit, or "+". */
function OutfitBox({
  label,
  clothing,
  onClick,
}: {
  label: string
  clothing?: number | null
  onClick?: () => void
}) {
  const content =
    clothing == null ? (
      <span className="text-[28px] leading-none opacity-50">+</span>
    ) : (
      <img
        src={outfitIcon(clothing)}
        alt={`${label}: ${outfitName(clothing)}`}
        className="size-[56px] object-contain"
      />
    )
  return (
    <section className="flex flex-col items-center gap-1">
      <h4 className="text-[12px] font-bold">{label}</h4>
      {onClick ? (
        <button
          type="button"
          aria-label={`${label}: empty, pick one`}
          onClick={onClick}
          className="game-slot grid size-[62px] cursor-pointer place-items-center"
        >
          {content}
        </button>
      ) : (
        <div className="game-slot grid size-[62px] place-items-center">{content}</div>
      )}
    </section>
  )
}

/**
 * Reborn's Manage Outfit: the Stat Outfit (worn) and the Visual Outfit (drawn instead). Choose
 * lists the bag's loose outfits; picking one asks to confirm the gold, Remove is free.
 */
export function ManageOutfitDialog({
  stat,
  visualClothing,
  outfits,
  busy,
  onChoose,
  onRemove,
  onClose,
}: {
  /** The worn outfit item. */
  stat?: InventoryItem
  visualClothing: number | null
  /** Loose bag outfits. */
  outfits: InventoryItem[]
  busy: boolean
  onChoose: (item: InventoryItem) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [page, setPage] = useState(0)
  const [confirm, setConfirm] = useState<InventoryItem | null>(null)
  if (confirm)
    return (
      <ConfirmDialog
        text={`Adding a visual character into this box will visually show you this character as the equipped one, leaving the stats to the outfit equipped in "Stat Outfit". Cost: ${VISUAL_OUTFIT_GOLD} gold`}
        onAccept={() => {
          setPicking(false)
          onChoose(confirm)
        }}
        onClose={() => setConfirm(null)}
      />
    )
  if (picking) {
    const pages = Math.max(1, Math.ceil(outfits.length / PICK_PAGE))
    const shown = Math.min(page, pages - 1)
    return (
      <Panel
        label="Choose an outfit to show visually"
        title="Manage Outfit"
        width={320}
        onClose={() => setPicking(false)}
      >
        <p className="font-bold">Choose an outfit to show visually</p>
        {outfits.length === 0 ? (
          <p>No outfits available in your inventory.</p>
        ) : (
          <ul aria-label="Outfits" className="grid grid-cols-4 gap-1">
            {outfits.slice(shown * PICK_PAGE, (shown + 1) * PICK_PAGE).map((item) => (
              <li key={item.id} className="relative size-[51px]">
                <ItemPicture item={item} decorative />
                {item.info?.outfit && <OutfitPlus plus={item.info.outfit.plus} under={false} />}
                <button
                  type="button"
                  aria-label={itemName(item)}
                  disabled={busy}
                  onClick={() => setConfirm(item)}
                  className="absolute inset-0 cursor-pointer"
                />
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-center gap-2">
          {pages > 1 && (
            <>
              <GameButton
                small
                aria-label="Previous page"
                onClick={() => setPage(shown - 1)}
                disabled={shown === 0}
              >
                {'<'}
              </GameButton>
              <span>
                {shown + 1}/{pages}
              </span>
              <GameButton
                small
                aria-label="Next page"
                onClick={() => setPage(shown + 1)}
                disabled={shown === pages - 1}
              >
                {'>'}
              </GameButton>
            </>
          )}
          <GameButton onClick={() => setPicking(false)} className="h-[22px] w-[100px]">
            Back
          </GameButton>
        </div>
      </Panel>
    )
  }
  const statClothing = stat?.info?.outfit?.clothing
  return (
    <Panel label="Manage Outfit" title="Manage Outfit" width={320} onClose={onClose}>
      <p className="text-center">
        Your stats come from the Stat Outfit. Set a different Visual Outfit to change only how your
        character looks.
      </p>
      <div className="flex justify-center gap-10">
        <OutfitBox label="Stat Outfit" clothing={statClothing} />
        <OutfitBox
          label="Visual Outfit"
          clothing={visualClothing}
          onClick={visualClothing == null ? () => setPicking(true) : undefined}
        />
      </div>
      {stat && <p className="text-center">{itemName(stat)}</p>}
      <div className="flex justify-center gap-2">
        {visualClothing == null ? (
          <GameButton
            disabled={busy}
            onClick={() => setPicking(true)}
            className="h-[24px] w-[160px]"
          >
            Choose Visual Outfit
          </GameButton>
        ) : (
          <GameButton disabled={busy} onClick={onRemove} className="h-[24px] w-[120px]">
            Remove
          </GameButton>
        )}
        <GameButton onClick={onClose} className={BUTTON}>
          Close
        </GameButton>
      </div>
      <p className="text-center opacity-80">
        Changing the visual outfit costs {VISUAL_OUTFIT_GOLD} gold. Removing it is free.
      </p>
    </Panel>
  )
}
