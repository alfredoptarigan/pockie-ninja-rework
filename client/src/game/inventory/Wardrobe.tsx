// Reborn's Wardrobe (reborn-windows-M-Z-hud.md, "Wardrobe"): 4 pages of 5 outfit slots. It opens
// over the Inventory's equipment, so the bag stays in reach: pick an outfit up, then click an
// empty row to store it; a stored outfit (or Take Out) goes back to the bag.
import { WARDROBE_PAGE_SLOTS, WARDROBE_PAGES } from '@pockie/shared'
import { useState } from 'react'
import { GameButton } from '../skin'
import type { InventoryItem } from '../types'
import { ItemPicture } from './BagGrid'
import { Panel } from './dialogs'
import { useStoreOutfit, useTakeOutfit, useWardrobe } from './outfit-api'
import { itemName } from './outfits'
import { attempt } from './requests'

/** Reborn shows the Wardrobe 395x470; ours fits above the bag with 40px rows. */
const WIDTH = 340
const TOP = 4

export function Wardrobe({
  held,
  onStored,
  onClose,
}: {
  /** The item picked up in the Inventory, if any. */
  held: InventoryItem | null
  /** Called when the held item went in (the Inventory drops it). */
  onStored: () => void
  onClose: () => void
}) {
  const wardrobe = useWardrobe()
  const store = useStoreOutfit()
  const take = useTakeOutfit()
  const [page, setPage] = useState(0)
  const busy = store.isPending || take.isPending
  const canStore = !!held?.info?.outfit && !held.equippedSlot
  const stored = wardrobe.data ?? []
  const first = page * WARDROBE_PAGE_SLOTS
  const slots = Array.from({ length: WARDROBE_PAGE_SLOTS }, (_, index) => first + index)

  function storeIn(slot: number) {
    if (!held) return
    onStored()
    void attempt(() => store.mutateAsync({ inventoryId: held.id, slot }))
  }
  const takeOut = (slot: number) => void attempt(() => take.mutateAsync(slot))

  return (
    <Panel label="Wardrobe" title="Wardrobe" width={WIDTH} top={TOP} onClose={onClose}>
      <ul aria-label="Wardrobe slots" className="flex flex-col gap-1">
        {slots.map((slot) => {
          const item = stored.find((row) => row.wardrobeSlot === slot)
          const target = !item && canStore
          return (
            <li
              key={slot}
              className="flex h-[40px] items-center gap-2 rounded-[3px] border-2 px-1"
              style={{
                background: target ? 'rgba(74, 124, 89, 0.5)' : '#f4e6b7',
                borderColor: target ? '#4a7c59' : '#8b6914',
              }}
            >
              <span className="game-slot relative size-[34px] shrink-0">
                {item && <ItemPicture item={item} decorative />}
                {item ? (
                  <button
                    type="button"
                    aria-label={`Take out ${itemName(item)}`}
                    disabled={busy}
                    onClick={() => takeOut(slot)}
                    className="absolute inset-0 cursor-pointer"
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={`Store in slot ${slot + 1}`}
                    disabled={busy || !canStore}
                    onClick={() => storeIn(slot)}
                    className="absolute inset-0 cursor-pointer disabled:cursor-default"
                  />
                )}
              </span>
              <span className="flex-1 font-sans text-[13px] text-white [text-shadow:var(--shadow-game-text)]">
                {item ? itemName(item) : 'Empty'}
              </span>
              <GameButton
                disabled={!item || busy}
                onClick={() => takeOut(slot)}
                className="h-[24px] min-w-[70px]! px-1! text-[10px]"
              >
                Take Out
              </GameButton>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between">
        <span className="w-[60px]" />
        <div className="game-panel-small flex h-[20px] w-[176px] items-center justify-between px-1">
          <GameButton
            small
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            {'<'}
          </GameButton>
          <span>
            {page + 1}/{WARDROBE_PAGES}
          </span>
          <GameButton
            small
            aria-label="Next page"
            disabled={page === WARDROBE_PAGES - 1}
            onClick={() => setPage(page + 1)}
          >
            {'>'}
          </GameButton>
        </div>
        <GameButton onClick={onClose} className="h-[22px] w-[60px] min-w-0! px-0!">
          Close
        </GameButton>
      </div>
    </Panel>
  )
}
