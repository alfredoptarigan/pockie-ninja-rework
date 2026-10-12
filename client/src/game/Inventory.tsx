import { useState } from 'react'
import { errorMessage, useEquipItem, useInventory, useUseItem } from './api'
import { ItemIcon } from './ItemIcon'
import { GameButton, Notice } from './skin'
import { GameText, plainText } from './text'
import type { BagHighlight, InventoryItem } from './types'
import { completedNotice } from './QuestLog'
import { isEquipment, isUsable } from './world'

/** Whether a bag row is what the current tutorial step asks for. */
const isHighlighted = (item: InventoryItem, highlight: BagHighlight | undefined) =>
  !!highlight &&
  ('itemId' in highlight
    ? item.itemId === highlight.itemId
    : isEquipment(item.itemId) && !item.equippedSlot && item.fitsOutfit !== false)

export function Inventory({ highlight }: { highlight?: BagHighlight }) {
  const inventory = useInventory()
  const use = useUseItem()
  const equip = useEquipItem()
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)

  const run = async (action: typeof use, item: InventoryItem, verb: string) => {
    setNotice(null)
    try {
      const result = await action.mutateAsync(item.id)
      const name = plainText(item.nameKey, 'the item')
      setNotice({ tone: 'info', text: `${verb} ${name}.${completedNotice(result.completed)}` })
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) })
    }
  }
  const busy = use.isPending || equip.isPending

  if (inventory.isPending) return <p>Opening your bag...</p>
  if (inventory.isError) return <Notice tone="error">We could not open your bag.</Notice>

  return (
    <div className="flex flex-col gap-2">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {inventory.data.length === 0 ? (
        <p>Your bag is empty.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {inventory.data.map((item) => (
            <li
              key={item.id}
              className={`flex items-center justify-between gap-2 game-card px-2 py-1 ${
                isHighlighted(item, highlight) ? 'ring-2 ring-[#ffb300]' : ''
              }`}
            >
              <span className="flex items-center gap-2">
                {/* Bag cell of the original package grid; the stack count sits in its corner. */}
                <ItemIcon itemId={item.itemId} name={plainText(item.nameKey, 'Unknown item')}>
                  {item.count > 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0.5 bottom-0 text-[10px] font-bold"
                    >
                      {item.count}
                    </span>
                  )}
                </ItemIcon>
                <GameText k={item.nameKey} fallback="Unknown item" />
                {item.count > 1 && <span className="sr-only">x{item.count}</span>}
                {isHighlighted(item, highlight) && (
                  <span className="rounded bg-[#ffb300] px-1 text-xs font-bold text-ink-game">
                    Next step
                  </span>
                )}
                {item.equippedSlot && (
                  <span className="ml-2 rounded bg-leaf px-1 text-xs font-bold text-white">
                    Equipped
                  </span>
                )}
              </span>
              {isEquipment(item.itemId)
                ? !item.equippedSlot && (
                    <GameButton
                      small
                      disabled={busy}
                      aria-label={`Equip ${plainText(item.nameKey, 'item')}`}
                      onClick={() => run(equip, item, 'Equipped')}
                    >
                      Equip
                    </GameButton>
                  )
                : isUsable(item.itemId) && (
                    <GameButton
                      small
                      disabled={busy}
                      aria-label={`Use ${plainText(item.nameKey, 'item')}`}
                      onClick={() => run(use, item, 'Used')}
                    >
                      Use
                    </GameButton>
                  )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
