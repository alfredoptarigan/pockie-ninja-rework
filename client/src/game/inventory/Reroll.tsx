// Reborn's pet Reroll (`ic`, reborn-windows-A-L.md "Reroll", 230x150): the Item slot takes a pet
// from the bag (pick it up, click the slot), Target opens a picker of the Reroll list (8 a page),
// Max Stones caps one press. Reroll rolls until the target or the cap; Auto Reroll (Stop while
// running) presses again until the pet is the target or a press is no longer possible.
import { useEffect, useRef, useState } from 'react'
import { REROLL_CONFIG } from '../../../../game-core/src/pets/reroll'
import { usePetReroll } from '../bag-api'
import { ItemIcon } from '../ItemIcon'
import { GameButton } from '../skin'
import { plainText } from '../text'
import type { InventoryItem } from '../types'
import { ItemPicture } from './BagGrid'
import { Panel } from './dialogs'
import { attempt } from './requests'

const { pets, minStones, maxStones: MAX_STONES } = REROLL_CONFIG
const PER_PAGE = 8
const petName = (itemId: string) => plainText(`lg_reborn_item_${itemId.slice(1)}`, 'Pet')
const isPet = (item: InventoryItem | null) => item?.info?.class === 'PetItem'

/** Reborn's `nc`: 300x170, the Reroll list 8 a page. */
function TargetPicker({
  onSelect,
  onClose,
}: {
  onSelect: (itemId: string) => void
  onClose: () => void
}) {
  const [page, setPage] = useState(0)
  const pages = Math.ceil(pets.length / PER_PAGE)
  const shown = pets.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  return (
    <Panel label="Choose a target pet" width={316} top={40} onClose={onClose}>
      <ul aria-label="Target pets" className="grid h-[118px] grid-cols-4 gap-[4px] p-[5px]">
        {shown.map((itemId) => (
          <li key={itemId}>
            <button
              type="button"
              aria-label={`Target ${petName(itemId)}`}
              title={petName(itemId)}
              onClick={() => onSelect(itemId)}
              className="cursor-pointer"
            >
              <ItemIcon itemId={itemId} name={petName(itemId)} className="size-[54px]" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-center gap-2">
        <GameButton
          small
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          {'<'}
        </GameButton>
        <span>
          {page + 1}/{pages}
        </span>
        <GameButton
          small
          aria-label="Next page"
          disabled={page === pages - 1}
          onClick={() => setPage(page + 1)}
        >
          {'>'}
        </GameButton>
      </div>
    </Panel>
  )
}

export function Reroll({
  held,
  items,
  stones,
  onStored,
  onClose,
}: {
  /** The item picked up in the Inventory, if any. */
  held: InventoryItem | null
  /** The bag, to show the chosen pet as it changes. */
  items: InventoryItem[]
  stones: number
  /** Called when the held pet went into the Item slot (the Inventory drops it). */
  onStored: () => void
  onClose: () => void
}) {
  const reroll = usePetReroll()
  const [petId, setPetId] = useState<string | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [budget, setBudget] = useState<number>(minStones)
  const [auto, setAuto] = useState(false)
  const pet = items.find((item) => item.id === petId) ?? null
  const ready =
    !!pet &&
    !!target &&
    budget >= minStones &&
    budget <= MAX_STONES &&
    budget <= stones &&
    pet.itemId !== target

  /** One press; true when another may follow (no failure, not the target, Stones left). */
  async function press() {
    if (!pet || !target) return false
    const result = await attempt(() =>
      reroll.mutateAsync({ inventoryId: pet.id, target, maxStones: budget }),
    )
    return !!result && !result.reroll.hit && result.character.stone >= budget
  }

  // Auto Reroll: presses one at a time until the target, a failure, short Stones or Stop.
  const stop = useRef(false)
  // Closing the panel (or the Inventory) stops it.
  useEffect(
    () => () => {
      stop.current = true
    },
    [],
  )
  async function autoReroll() {
    stop.current = false
    setAuto(true)
    while (!stop.current && (await press()));
    setAuto(false)
  }

  function fillItem() {
    if (pet) return setPetId(null)
    if (!held || !isPet(held) || held.equippedSlot) return
    setPetId(held.id)
    onStored()
  }

  return (
    <Panel label="Reroll" title="Reroll" width={246} top={70} onClose={onClose}>
      <div className="relative h-[150px] w-[230px] text-black">
        <span className="absolute top-0 left-[5px] w-[64px] text-center font-bold">Item</span>
        <button
          type="button"
          aria-label={
            pet
              ? `Item: ${plainText(pet.nameKey, 'Pet')} (click to take out)`
              : 'Item: put a pet here'
          }
          disabled={!pet && !isPet(held)}
          onClick={fillItem}
          className="game-slot absolute top-[15px] left-[5px] size-[54px] cursor-pointer disabled:cursor-default"
          style={!pet && isPet(held) ? { background: 'rgba(74, 124, 89, 0.5)' } : undefined}
        >
          {pet && <ItemPicture item={pet} decorative />}
        </button>
        <span className="absolute top-0 left-[150px] w-[64px] text-center font-bold">Target</span>
        <button
          type="button"
          aria-label={target ? `Target: ${petName(target)}` : 'Target: choose a pet'}
          title={target ? petName(target) : undefined}
          onClick={() => setPicking(true)}
          className="absolute top-[15px] left-[150px] cursor-pointer"
        >
          {target ? (
            <ItemIcon itemId={target} name={petName(target)} className="size-[54px]" />
          ) : (
            <span className="game-slot block size-[54px]" />
          )}
        </button>
        <label className="absolute top-[87px] left-[5px] font-bold" htmlFor="reroll-max-stones">
          Max Stones
        </label>
        <input
          id="reroll-max-stones"
          type="number"
          step={1}
          min={0}
          max={MAX_STONES}
          value={budget}
          onChange={(event) =>
            setBudget(Math.min(Math.max(Number(event.target.value) || 0, 0), MAX_STONES, stones))
          }
          className="game-field absolute top-[85px] left-[85px] h-[20px] w-[75px] px-1 text-black"
        />
        <GameButton
          disabled={!ready || auto || reroll.isPending}
          onClick={() => void press()}
          className="absolute! top-[115px] left-[5px] h-[24px] w-[105px] min-w-0! px-0!"
        >
          Reroll
        </GameButton>
        <GameButton
          disabled={!auto && !ready}
          onClick={() => (auto ? (stop.current = true) : void autoReroll())}
          className={`absolute! top-[115px] left-[120px] h-[24px] w-[105px] min-w-0! px-0! ${auto ? 'text-[#ffd700]' : ''}`}
        >
          {auto ? 'Stop' : 'Auto Reroll'}
        </GameButton>
      </div>
      {picking && (
        <TargetPicker
          onSelect={(itemId) => {
            setTarget(itemId)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Panel>
  )
}
