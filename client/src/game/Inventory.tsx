import { useState } from 'react'
import { errorMessage, useEquipItem, useInventory, useUseItem } from './api'
import { GameButton, Notice } from './skin'
import { GameText, plainText } from './text'
import type { InventoryItem } from './types'
import { completedNotice } from './QuestLog'
import { isEquipment, isUsable } from './world'

export function Inventory() {
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
              className="flex items-center justify-between gap-2 rounded border border-wood-light/50 bg-white/50 px-2 py-1"
            >
              <span>
                <GameText k={item.nameKey} fallback="Unknown item" />
                {item.count > 1 && <span className="ml-1 font-bold">x{item.count}</span>}
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
