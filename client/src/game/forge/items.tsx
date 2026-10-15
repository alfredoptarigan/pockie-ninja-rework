// The bag equipment a forge tab can work on, and the picker that stands in for Reborn's drag onto
// the equipment slot (our bag is a separate window).
import type { GearView } from '@pockie/shared'
import type { ReactNode } from 'react'
import { useInventory } from '../api'
import { ItemIcon } from '../ItemIcon'
import { itemName, outfitIcon } from '../inventory/outfits'
import { plainText } from '../text'
import type { InventoryItem } from '../types'
import { useGear } from './api'
import { GearIcon } from './GearItem'
import { TIER_COLORS } from './gear'

export type Gear = InventoryItem & { gear: GearView }
export type NoticeState = { tone: 'info' | 'error'; text: string } | null

export const WEAPON = 1
const ARMOUR = 2

export const canEnhance = (g: GearView) =>
  (g.baseType === WEAPON || g.baseType === ARMOUR) && g.enhanceMax > 0
export const canRefine = (g: GearView) => g.identifyCount > 0
export const anyGear = () => true

/** Reborn's item name colour: by refinement line count. */
export const tierColor = (gear: GearView) =>
  TIER_COLORS[Math.min(gear.appraised ? gear.props.length : 0, TIER_COLORS.length - 1)]

/** Bag equipment (not worn) that `offered` accepts. */
export function useForgeItems(offered: (gear: GearView) => boolean) {
  const inventory = useInventory()
  const gear = useGear()
  const items = (inventory.data ?? []).flatMap((item): Gear[] => {
    const state = gear.data?.[item.id]
    return state && !item.equippedSlot && offered(state) ? [{ ...item, gear: state }] : []
  })
  return {
    loading: inventory.isPending || gear.isPending,
    failed: inventory.isError || gear.isError,
    items,
  }
}

export function ItemPicker({
  items,
  empty,
  selectedId,
  onSelect,
}: {
  items: Gear[]
  empty: string
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold">Your equipment</p>
      {items.length === 0 ? (
        <p className="text-xs">{empty}</p>
      ) : (
        <ul aria-label="Equipment to forge" className="grid grid-cols-3 gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <GearIcon itemId={item.itemId} nameKey={item.nameKey} gear={item.gear}>
                <button
                  type="button"
                  aria-label={plainText(item.nameKey, 'Unknown item')}
                  aria-pressed={item.id === selectedId}
                  onClick={() => onSelect(item.id)}
                  className={`absolute inset-0 cursor-pointer ${
                    item.id === selectedId ? 'shadow-[inset_0_0_0_2px_#fff2ae]' : ''
                  }`}
                />
              </GearIcon>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Reborn's equipment slot: the placed item, or an empty 2x3 cell. */
export function EquipmentSlot({ item }: { item: Gear | undefined }) {
  return item ? (
    <GearIcon
      itemId={item.itemId}
      nameKey={item.nameKey}
      gear={item.gear}
      className="h-[90px] w-[63px]"
    />
  ) : (
    <span aria-hidden="true" className="game-slot block h-[90px] w-[63px]" />
  )
}

/** An item's picture in a bag cell: outfits by clothing, anything else by its icon (decorative). */
export function ItemCell({
  item,
  className = 'size-9',
}: {
  item: InventoryItem
  className?: string
}) {
  if (!item.info?.outfit) return <ItemIcon itemId={item.itemId} name="" className={className} />
  return (
    <span className={`game-slot grid shrink-0 place-items-center ${className}`}>
      <img
        src={outfitIcon(item.info.outfit.clothing)}
        alt=""
        className="max-h-full max-w-full p-0.5"
      />
    </span>
  )
}

/**
 * Bag items as a grid of buttons: the Portable Function's stand-in for dragging from the bag.
 * `available` says how many more of an item may still be placed (0 disables it).
 */
export function BagPicker({
  label,
  items,
  available = () => 1,
  onPick,
}: {
  label: string
  items: InventoryItem[]
  available?: (item: InventoryItem) => number
  onPick: (item: InventoryItem) => void
}) {
  if (items.length === 0) return <p className="text-xs">Nothing in your bag fits here.</p>
  return (
    <ul aria-label={label} className="grid max-h-[124px] grid-cols-8 gap-1 overflow-y-auto">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-label={itemName(item)}
            disabled={available(item) <= 0}
            onClick={() => onPick(item)}
            className="relative block cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ItemCell item={item} />
            {item.count > 1 && (
              <span className="absolute right-0 bottom-0 text-[10px] font-bold text-white [text-shadow:0_0_2px_#000]">
                x{item.count}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A labelled Portable Function slot: the placed item (a button that takes it out) or empty. */
export function SlotCell({
  label,
  item,
  onClear,
  empty,
  className = 'h-[90px] w-[63px]',
}: {
  label: string
  item: InventoryItem | undefined
  onClear?: () => void
  /** What an empty slot shows (Reborn's Result "?"). */
  empty?: ReactNode
  className?: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-bold">{label}</span>
      <span className={`game-slot relative grid place-items-center p-1 ${className}`}>
        {item ? (
          <button
            type="button"
            aria-label={`Take ${itemName(item)} out of ${label}`}
            disabled={!onClear}
            onClick={onClear}
            className="cursor-pointer disabled:cursor-default"
          >
            <ItemCell item={item} className="size-12" />
          </button>
        ) : (
          empty
        )}
      </span>
    </div>
  )
}
