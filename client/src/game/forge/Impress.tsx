// Reborn's Impress tab (reborn-windows-M-Z-hud.md "Portable Function"): gear with fewer than 4
// stat lines, a Carving Blade and optional Carving Crystals; success adds one stat line. The rate
// comes from the server, which rolls too.
import type { GearView } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage, useInventory } from '../api'
import { GameButton } from '../skin'
import { plainText } from '../text'
import { showToast } from '../toast'
import type { InventoryItem } from '../types'
import { useImpress, useImpressPreview } from './api'
import { EquipmentSlot, ItemPicker, SlotCell, useForgeItems } from './items'

const impressable = (gear: GearView) =>
  gear.equipType !== 'Wing' && gear.appraised && gear.props.length < 4

/** A material slot filled from a drop-down of the bag rows of one item class. */
function MaterialSlot({
  label,
  rows,
  value,
  onChange,
  optional = false,
}: {
  label: string
  rows: InventoryItem[]
  value: string
  onChange: (id: string) => void
  optional?: boolean
}) {
  const row = rows.find((item) => item.id === value)
  return (
    <div className="flex flex-col items-center gap-1">
      <SlotCell label={label} item={row} className="size-[46px]" />
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="game-card max-w-[120px] px-1 text-[11px]"
      >
        <option value="">{rows.length ? (optional ? 'None' : 'Choose') : 'None in bag'}</option>
        {rows.map((item) => (
          <option key={item.id} value={item.id}>
            {plainText(item.nameKey, item.itemId)}
            {item.count > 1 ? ` x${item.count}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ImpressTab() {
  const { loading, failed, items } = useForgeItems(impressable)
  const bag = (useInventory().data ?? []).filter((item) => !item.equippedSlot)
  const impress = useImpress()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bladeId, setBladeId] = useState('')
  const [crystalId, setCrystalId] = useState('')
  const selected = items.find((item) => item.id === selectedId)
  const blades = bag.filter((item) => item.info?.class === 'ImpressItem')
  const crystals = bag.filter((item) => item.info?.class === 'ImpressRateItem')
  const input =
    selected && blades.some((b) => b.id === bladeId)
      ? {
          itemId: selected.id,
          bladeId,
          ...(crystals.some((c) => c.id === crystalId) && { crystalId }),
        }
      : null
  const preview = useImpressPreview(input)

  if (loading) return <p className="mt-2">Opening the forge...</p>
  if (failed) return <p className="mt-2">We could not open the forge.</p>

  const attempt = async () => {
    if (!input) return
    try {
      const outcome = await impress.mutateAsync(input)
      showToast(
        outcome.success ? 'Impress succeeded: a new stat line.' : 'Impress failed.',
        outcome.success ? 'success' : 'failure',
      )
    } catch (error) {
      showToast(errorMessage(error), 'failure')
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 text-xs">
      <p className="game-card p-2">Impressing transfers stat patterns onto your equipment.</p>
      <div className="grid grid-cols-[168px_1fr] gap-3">
        <ItemPicker
          items={items}
          empty="You have no equipment with fewer than 4 stat lines."
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-center gap-2">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] font-bold">Main Item</span>
              <EquipmentSlot item={selected} />
            </div>
            <span aria-hidden="true" className="mt-8 text-lg font-bold">
              +
            </span>
            <MaterialSlot label="Blade" rows={blades} value={bladeId} onChange={setBladeId} />
            <span aria-hidden="true" className="mt-8 text-lg font-bold">
              +
            </span>
            <MaterialSlot
              label="Crystals"
              rows={crystals}
              value={crystalId}
              onChange={setCrystalId}
              optional
            />
          </div>
          <p className="game-card self-center px-3 py-0.5" aria-live="polite">
            {preview.isError ? (
              <span className="text-[#c62828]">{errorMessage(preview.error)}</span>
            ) : (
              `Rate: ${preview.data?.rate ?? 0}%`
            )}
          </p>
          {preview.data && preview.data.crystalsUsed > 0 && (
            <p className="text-center">Uses {preview.data.crystalsUsed} crystals.</p>
          )}
          <GameButton
            disabled={!preview.data || preview.isFetching || impress.isPending}
            onClick={attempt}
            className="self-center"
          >
            Attempt
          </GameButton>
        </div>
      </div>
    </div>
  )
}
