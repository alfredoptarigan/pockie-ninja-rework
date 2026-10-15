// The bag equipment a forge tab can work on, and the picker that stands in for Reborn's drag onto
// the equipment slot (our bag is a separate window).
import type { GearView } from '@pockie/shared'
import { useInventory } from '../api'
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
