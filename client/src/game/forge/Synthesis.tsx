// Reborn's Synthesis tab (reborn-windows-M-Z-hud.md "Portable Function"): a Main Item and two
// Catalysts make a recipe's result or a random item. Our bag is a separate window, so clicking an
// item below puts it in the first free slot (Reborn's double-click from the bag) and clicking a
// slot takes it out. The server checks every rule and rolls the result.
import { useState } from 'react'
import { errorMessage, useInventory } from '../api'
import { GameButton } from '../skin'
import { itemName } from '../inventory/outfits'
import { plainText } from '../text'
import { showToast } from '../toast'
import type { InventoryItem } from '../types'
import { useSynthesisPreview, useSynthesize } from './api'
import { BagPicker, SlotCell } from './items'

const SLOT_LABELS = ['Main Item', 'Catalyst', 'Catalyst'] as const

/** Reborn's hardcoded instructions (point 5, outfit stars, is Reborn-only and left out). */
const INSTRUCTIONS = [
  'Set a main item and two catalysts to view the resulting item.',
  'If the result is equipment, its number of stat lines follows the value shown under the result: 0-21 = 0, 22-30 = 1, 31-38 = 2, 39-45 = 3, 46+ = 4.',
  'If the result is a pet or an outfit, the upgrade chance is shown.',
  'If the result is a random item, consult the Recipes chart.',
]

export function SynthesisTab() {
  const inventory = useInventory()
  const synthesize = useSynthesize()
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null])
  const items = (inventory.data ?? []).filter((item) => !item.equippedSlot && !item.locked)
  const placed = slots.map((id) => items.find((item) => item.id === id))
  const ready = placed.every(Boolean)
  const preview = useSynthesisPreview(
    ready ? { mainId: slots[0]!, catalystIds: [slots[1]!, slots[2]!] } : null,
  )
  const left = (item: InventoryItem) => item.count - slots.filter((id) => id === item.id).length
  const plan = ready ? preview.data : undefined
  const result: InventoryItem | undefined = plan?.resultItemId
    ? {
        id: 'result',
        itemId: plan.resultItemId,
        nameKey: plan.resultNameKey ?? '',
        count: 1,
        bound: false,
        equippedSlot: null,
        ...(plan.resultInfo && {
          info: { ...plan.resultInfo, equipSlot: plan.resultInfo.equipSlot ?? undefined },
        }),
      }
    : undefined

  const place = (item: InventoryItem) => {
    const free = slots.indexOf(null)
    if (free >= 0) setSlots(slots.map((id, slot) => (slot === free ? item.id : id)))
  }
  const create = async () => {
    try {
      const outcome = await synthesize.mutateAsync({
        mainId: slots[0]!,
        catalystIds: [slots[1]!, slots[2]!],
      })
      // A recipe's result is the one previewed; a random one is only named.
      const made = outcome.resultItemId === result?.itemId ? result : undefined
      setSlots([null, null, null])
      if (outcome.success)
        showToast(
          `Synthesized ${made ? itemName(made) : plainText(outcome.resultNameKey ?? '', 'an item')}.`,
          'success',
        )
      else showToast('Synthesis failed. The catalysts were used up.', 'failure')
    } catch (error) {
      showToast(errorMessage(error), 'failure')
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 text-xs">
      <ol className="game-card list-inside list-decimal p-2 text-[11px] leading-snug">
        {INSTRUCTIONS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <GameButton
        small
        disabled
        title="Synthesis Recipes: not available yet"
        className="self-center"
      >
        Recipes
      </GameButton>
      <div className="game-card flex items-center justify-center gap-2 p-2">
        <SlotCell
          label={SLOT_LABELS[0]}
          item={placed[0]}
          onClear={() => setSlots([null, slots[1]!, slots[2]!])}
        />
        <span aria-hidden="true" className="text-lg font-bold">
          +
        </span>
        {[1, 2].map((slot) => (
          <SlotCell
            key={slot}
            label={SLOT_LABELS[slot]!}
            item={placed[slot]}
            onClear={() => setSlots(slots.map((id, i) => (i === slot ? null : id)))}
          />
        ))}
        <span aria-hidden="true" className="text-lg font-bold">
          =
        </span>
        <SlotCell
          label="Result"
          item={result}
          empty={
            <span aria-hidden="true" className="text-2xl font-bold text-[#8a6d1f]">
              ?
            </span>
          }
        />
      </div>
      <div className="flex items-center justify-center gap-2" aria-live="polite">
        <span className="game-card min-w-[138px] px-2 py-0.5 text-center">
          {preview.isError ? (
            <span className="text-[#c62828]">{errorMessage(preview.error)}</span>
          ) : plan ? (
            result ? (
              itemName(result)
            ) : (
              'Random item'
            )
          ) : (
            ' '
          )}
        </span>
        <span className="game-card min-w-[73px] px-2 py-0.5 text-center">
          {plan ? `${plan.rate}%` : ' '}
        </span>
      </div>
      {plan?.value && (
        <p className="text-center">
          Synthesis Value {plan.value.min}-{plan.value.max}: {linesText(plan.value.lines)}
        </p>
      )}
      <BagPicker
        label="Items to synthesize"
        items={items}
        available={(item) => (slots.includes(null) ? left(item) : 0)}
        onPick={place}
      />
      <GameButton
        disabled={!plan || preview.isFetching || synthesize.isPending}
        onClick={create}
        className="self-center"
      >
        Create
      </GameButton>
    </div>
  )
}

const linesText = ([min, max]: [number, number]) =>
  min === max ? `${min} stat lines` : `${min}-${max} stat lines`
