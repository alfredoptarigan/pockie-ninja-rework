// Reborn's Recast tab (reborn-windows-M-Z-hud.md "Portable Function"): an outfit's Individual Stat
// Values (Strength, Agility, Stamina gained per level) rerolled for Recast Talismans; up to two
// stats can be locked (1, 5 or 15 talismans). The server rolls and checks the cost.
import { useState } from 'react'
import {
  ISV_STATS,
  RECAST_MAX_LOCKS,
  RECAST_TALISMAN_COSTS,
} from '../../../../shared/src/schemas/portable-function'
import { errorMessage, useInventory } from '../api'
import { ItemIcon } from '../ItemIcon'
import { GameButton, Notice } from '../skin'
import { showToast } from '../toast'
import { useRecast, useRecastInfo } from './api'
import { BagPicker, SlotCell } from './items'

const RECAST_TALISMAN = 'i161007'
/** ISV values are per-level stat gains x100; Reborn's Recast tab shows one decimal. */
const isvText = (value: number) => (value / 100).toFixed(1)

export function RecastTab() {
  const outfits = (useInventory().data ?? []).filter((item) => item.info?.outfit)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [locked, setLocked] = useState<number[]>([])
  const [rerolled, setRerolled] = useState(false)
  const recast = useRecast()
  const selected = outfits.find((item) => item.id === selectedId)
  const info = useRecastInfo(selected ? selected.id : null)
  const data = info.data
  const cost = RECAST_TALISMAN_COSTS[locked.length]!
  const short = (data?.talismans ?? 0) < cost
  const freeCanMove = data
    ? [0, 1, 2].some((s) => !locked.includes(s) && data.max[s]! > data.base[s]!)
    : false

  const toggle = (stat: number) =>
    setLocked(
      locked.includes(stat)
        ? locked.filter((s) => s !== stat)
        : locked.length < RECAST_MAX_LOCKS
          ? [...locked, stat]
          : locked,
    )
  const attempt = async () => {
    if (!selected) return
    try {
      await recast.mutateAsync({ itemId: selected.id, locked })
      setRerolled(true)
    } catch (error) {
      showToast(errorMessage(error), 'failure')
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 text-xs">
      <div className="flex gap-2">
        <SlotCell label="Outfit" item={selected} onClear={() => setSelectedId(null)} />
        <div className="game-card flex flex-1 flex-col gap-1 p-2">
          <p className="text-center font-bold">Individual Stat Values</p>
          {!selected ? (
            <p className="text-center text-[#666] italic">Choose an outfit to recast.</p>
          ) : info.isError ? (
            <Notice tone="error">{errorMessage(info.error)}</Notice>
          ) : !data ? (
            <p>Loading...</p>
          ) : (
            <>
              <ul aria-label="Individual Stat Values" className="flex flex-col gap-0.5">
                {ISV_STATS.map((stat, i) => {
                  const value = data.isv[i]!
                  const max = data.max[i]!
                  const tone =
                    value >= max ? 'text-[#a07800]' : value >= 0.9 * max ? 'text-[#1a7f1a]' : ''
                  return (
                    <li key={stat} className="flex items-center justify-between font-bold">
                      <span className={tone}>
                        {stat}: {isvText(value)}/{isvText(max)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Lock ${stat}`}
                        aria-pressed={locked.includes(i)}
                        onClick={() => toggle(i)}
                        className={`h-[14px] w-[34px] rounded-[2px] text-[9px] text-white ${
                          locked.includes(i) ? 'bg-[#ff6b6b]' : 'bg-[#4a4a4a]'
                        }`}
                      >
                        {locked.includes(i) ? 'Lock' : 'Free'}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className={`text-center text-[10px] font-bold ${short ? 'text-[#c62828]' : ''}`}>
                Recast Cost: {cost} Recast Talisman{cost > 1 ? 's' : ''} (you have {data.talismans})
              </p>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-center gap-3">
        <span className="font-bold">Recast Talisman</span>
        <ItemIcon itemId={RECAST_TALISMAN} name="Recast Talisman" />
        <span>x{data?.talismans ?? 0}</span>
        {rerolled && <span className="font-bold text-[#1a7f1a]">Rerolled</span>}
      </div>
      <BagPicker
        label="Outfits"
        items={outfits}
        onPick={(item) => {
          setSelectedId(item.id)
          setLocked([])
          setRerolled(false)
        }}
      />
      <GameButton
        disabled={
          !data || !data.canRecast || !freeCanMove || short || recast.isPending || info.isFetching
        }
        onClick={attempt}
        className="self-center"
      >
        Attempt
      </GameButton>
      {rerolled && <p className="text-center text-[10px]">Recast complete!</p>}
    </div>
  )
}
