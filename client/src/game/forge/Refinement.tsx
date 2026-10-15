// Reborn's Armory Refine tab: the Refinement Info lines (our appraised properties) and the
// Refinement payment window (reborn-windows-M-Z-hud.md "Refinement"). Wish Refinement has no
// server side here, so it is left out.
import { useState } from 'react'
import { errorMessage, useCharacter } from '../api'
import { GameButton, Notice } from '../skin'
import { plainText } from '../text'
import { useForgeInfo, useRefine } from './api'
import { statLine } from './gear'
import { canRefine, EquipmentSlot, ItemPicker, useForgeItems, type NoticeState } from './items'
import { PaymentDialog, payOptions } from './parts'
import type { GearProp } from '@pockie/shared'

/** "Strength: +28 (28 - 34) T1", Reborn's refinement line. */
const refineLine = ({ name, value, min, max, tier }: GearProp) => {
  const { label, value: shown } = statLine(name, value)
  const bound = (n: number) => statLine(name, n).value.replace('+', '')
  return `${label}: ${shown} (${bound(min)} - ${bound(max)}) T${tier}`
}

export function RefineTab() {
  const { loading, failed, items } = useForgeItems(canRefine)
  const info = useForgeInfo()
  const character = useCharacter().data
  const refine = useRefine()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [notice, setNotice] = useState<NoticeState>(null)
  const selected = items.find((item) => item.id === selectedId)

  if (loading || info.isPending) return <p className="mt-2">Opening the forge...</p>
  if (failed || info.isError) return <Notice tone="error">We could not open the forge.</Notice>

  const lines = selected?.gear.appraised ? selected.gear.props : []
  const blocked = !selected
    ? 'Choose an item.'
    : !selected.gear.appraised
      ? 'Appraise this item first.'
      : null

  return (
    <div className="mt-2 grid grid-cols-[168px_1fr] gap-3 text-xs">
      <ItemPicker
        items={items}
        empty="You have no equipment with properties in your bag."
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id)
          setNotice(null)
        }}
      />
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <EquipmentSlot item={selected} />
          <div className="game-card flex min-h-[90px] flex-1 flex-col gap-0.5 p-2">
            <p className="font-bold">Refinement Info</p>
            {!selected ? (
              <p>No item selected</p>
            ) : lines.length === 0 ? (
              <p>No refinements</p>
            ) : (
              lines.map((prop) => (
                <p key={prop.propId} className="text-[11px] text-[#388ee9]">
                  {refineLine(prop)}
                </p>
              ))
            )}
          </div>
        </div>
        <p>Refining Talismans in bag: {info.data.talismans.refine}</p>
        <GameButton
          disabled={Boolean(blocked) || refine.isPending}
          onClick={() => setPaying(true)}
          className="self-start"
        >
          Attempt
        </GameButton>
        {blocked && selected && <p className="text-[#8a1610]">{blocked}</p>}
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      </div>
      {paying && selected && (
        <PaymentDialog
          title="Refinement"
          text="Refinement price depends on current level."
          options={payOptions(character, info.data.refineCost, info.data.talismans.refine, {
            gold: `Your Gold: ${character?.gold ?? 0}`,
            giftCoupon: `Your Coupons: ${character?.giftCoupon ?? 0}`,
            talisman: `Refining Talismans: ${info.data.talismans.refine}`,
          })}
          busy={refine.isPending}
          onClose={() => setPaying(false)}
          onPay={async (payment) => {
            setPaying(false)
            setNotice(null)
            try {
              await refine.mutateAsync({ itemId: selected.id, payment })
              setNotice({
                tone: 'info',
                text: `Refined ${plainText(selected.nameKey, 'the item')}.`,
              })
            } catch (error) {
              setNotice({ tone: 'error', text: errorMessage(error) })
            }
          }}
        />
      )}
    </div>
  )
}
