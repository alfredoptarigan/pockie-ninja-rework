// Original item icons (tools/assets/EXTRA.md), drawn in the bag-cell slot of the 2011 skin.
import type { ReactNode } from 'react'
import { gameItems, type ItemIcon as Icon } from '../generated/game-extra'
import world from './world-data.json'

// Reborn items (M5 scroll skills) use Reborn's 24px icons.
const rebornIcons = world.rebornItemIcons as Record<string, string>
const REBORN_ICON_SIZE = 24

/** The exported icon of an item id ("i160006"), or undefined when the backup has none. */
export const itemIcon = (itemId: string): Icon | undefined => {
  if (Object.hasOwn(gameItems.items, itemId)) return gameItems.items[itemId]
  const file = Object.hasOwn(rebornIcons, itemId) ? rebornIcons[itemId] : undefined
  return file ? { file, width: REBORN_ICON_SIZE, height: REBORN_ICON_SIZE } : undefined
}

/**
 * An item in a bag cell: its original icon, or a neutral "?" when it has none. Both are named
 * after the item for screen readers. `children` go on top (a stack count, for example).
 */
export function ItemIcon({
  itemId,
  name,
  className = 'size-9',
  children,
}: {
  itemId: string
  name: string
  className?: string
  children?: ReactNode
}) {
  const icon = itemIcon(itemId)
  return (
    <span className={`game-slot relative grid shrink-0 place-items-center ${className}`}>
      {icon ? (
        <img src={icon.file} alt={name} className="max-h-full max-w-full p-0.5" />
      ) : (
        <span
          role="img"
          aria-label={name}
          className="grid size-6 place-items-center rounded-sm bg-white/15 text-xs font-bold"
        >
          ?
        </span>
      )}
      {children}
    </span>
  )
}
