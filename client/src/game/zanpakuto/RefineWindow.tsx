// Reborn's "Zanpakuto Refine" (component `z` #6080) and "Zanpakuto Bulk Refine" (`I` #565)
// windows. Costs and rolls are the server's; the texts are Reborn's confirm prompts.
import { useState } from 'react'
import {
  applyBulkOption,
  ATTRIBUTE_UNLOCK_COUPONS,
  bulkApplyCost,
  formatStatValue,
  REFINE_COST_SC,
  statName,
  ZANPAKUTO_REFINE_RANGES,
} from '../../../../game-core/src/zanpakuto/zanpakuto'
import type { ZanpakutoCrystal, ZanpakutoView } from '../../../../shared/src/schemas/zanpakuto'
import { ConfirmDialog } from '../inventory/dialogs'
import { Dialog, GameButton } from '../skin'
import { CrystalCell } from './CrystalCell'
import type { Confirm } from './ZanpakutoWindow'
import { allCrystals, statColor, statText, type Run } from './shared'

interface WindowProps {
  id: string
  data: ZanpakutoView
  busy: boolean
  run: Run
  onClose: () => void
}

const FIELD = 'game-inset flex h-[25px] w-[150px] items-center px-1.5 text-[11px] font-bold'
const RESET = ' This will reset the bulk refinement attributes!'

/** The crystal's possible range for a stat, formatted like its value. */
function RangeHint({ crystal, index }: { crystal: ZanpakutoCrystal; index: number }) {
  const stat = crystal.stats[index]
  const range = stat && ZANPAKUTO_REFINE_RANGES[crystal.category][stat[0]]
  if (!stat || !range) return null
  return (
    <span
      className="w-[117px] text-[11px] text-[#777]"
      title={`Possible range for ${statName(stat[0])}`}
    >
      {formatStatValue(stat[0], range[0])} ~ {formatStatValue(stat[0], range[1])}
    </span>
  )
}

function StatField({ crystal, index }: { crystal: ZanpakutoCrystal; index: number }) {
  const stat = crystal.stats[index]
  return (
    <span className={FIELD} style={stat ? { color: statColor(crystal.category, stat) } : undefined}>
      {stat && statText(stat)}
    </span>
  )
}

export function RefineWindow({
  id,
  data,
  busy,
  run,
  onBulk,
  onClose,
}: WindowProps & { onBulk: () => void }) {
  const [confirm, setConfirm] = useState<Confirm>()
  const crystal = allCrystals(data).find((c) => c.id === id)
  if (!crystal) return null
  const activate = (position: 1 | 2) =>
    setConfirm({
      text: `Are you sure want to spend ${ATTRIBUTE_UNLOCK_COUPONS[position]} coupons to activate this attribute?${position === 1 ? RESET : ''}`,
      onAccept: () => run('/attributes/unlock', { id, position }),
    })
  return (
    <Dialog title="Zanpakuto Refine" onClose={onClose} className="w-[330px]">
      <div className="relative flex flex-col items-center gap-[5px] text-[12px]">
        <CrystalCell label={crystal.name} crystal={crystal} readOnly />
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex w-full items-center gap-2">
            <StatField crystal={crystal} index={index} />
            {crystal.stats[index] ? (
              <RangeHint crystal={crystal} index={index} />
            ) : (
              <GameButton
                small
                aria-label={`Activate attribute ${index + 1}`}
                disabled={busy || crystal.stats.length < index}
                onClick={() => activate(index as 1 | 2)}
              >
                Activate
              </GameButton>
            )}
          </div>
        ))}
        <p className="w-full">
          {data.freeRefines > 0 ? (
            <>
              <span className="text-[#00aeff]">{data.freeRefines}</span> free refining tries left
              today!
            </>
          ) : (
            <span className="text-[#ffcc00]">Refine cost: {REFINE_COST_SC} SC</span>
          )}
        </p>
        <div className="flex gap-4">
          <GameButton
            disabled={busy}
            onClick={() =>
              setConfirm({
                text: `Are you sure want to refine the zanpakuto attributes?${RESET}`,
                onAccept: () => run('/refine', { id }),
              })
            }
          >
            Refine
          </GameButton>
          <GameButton disabled={busy} onClick={() => run('/bulk', { id }, onBulk)}>
            Bulk Refine
          </GameButton>
        </div>
        {confirm && (
          <ConfirmDialog
            text={confirm.text}
            onAccept={confirm.onAccept}
            onClose={() => setConfirm(undefined)}
          />
        )}
      </div>
    </Dialog>
  )
}

export function BulkRefineWindow({ id, data, busy, run, onClose }: WindowProps) {
  const [confirm, setConfirm] = useState<Confirm>()
  const [locks, setLocks] = useState<number[]>([])
  const [selected, setSelected] = useState<number>()
  const crystal = allCrystals(data).find((c) => c.id === id)
  if (!crystal) return null
  const options = crystal.bulkOptions.flatMap((option, index) => {
    const stats = applyBulkOption(crystal.stats, option, locks)
    return stats ? [{ index, stats }] : []
  })
  const canSave =
    selected !== undefined &&
    options.some((option) => option.index === selected) &&
    locks.length < crystal.stats.length
  const toggleLock = (index: number) =>
    setLocks((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index].sort(),
    )
  const save = () => {
    const cost = bulkApplyCost(locks.length)
    const price =
      locks.length > 0
        ? ` This will cost ${cost.coins} spirit coins and ${cost.stones} stones.`
        : ''
    setConfirm({
      text: `Are you sure want to refine with the selected attribute? You are locking ${locks.length} attribute(s).${price}`,
      onAccept: () => run('/bulk/apply', { id, index: selected, locks }, onClose),
    })
  }
  return (
    <Dialog title="Zanpakuto Bulk Refine" onClose={onClose} className="w-[560px]">
      <div className="relative flex flex-col gap-[5px] text-[12px]">
        <div className="game-inset flex items-end gap-1.5 p-2.5">
          <CrystalCell label={crystal.name} crystal={crystal} readOnly />
          {crystal.stats.map((stat, index) => (
            <div key={index} className="flex flex-col items-center gap-0.5">
              {crystal.stats.length > 1 && (
                <label className="flex items-center gap-1 text-[11px]">
                  <input
                    type="checkbox"
                    aria-label={`Lock ${statName(stat[0])}`}
                    checked={locks.includes(index)}
                    onChange={() => toggleLock(index)}
                  />
                  Lock
                </label>
              )}
              <StatField crystal={crystal} index={index} />
            </div>
          ))}
        </div>
        <div role="radiogroup" aria-label="Bulk refine options" className="flex flex-col gap-[5px]">
          {options.map((option) => (
            <label
              key={option.index}
              className="game-inset flex h-[30px] cursor-pointer items-center gap-2 px-5"
            >
              <input
                type="radio"
                name="bulk-option"
                checked={selected === option.index}
                onChange={() => setSelected(option.index)}
              />
              {option.stats.map((stat, column) => (
                <span
                  key={column}
                  className="w-[140px]"
                  style={{ color: statColor(crystal.category, stat) }}
                >
                  {statText(stat)}
                </span>
              ))}
            </label>
          ))}
        </div>
        <div className="flex justify-center gap-4 pt-2">
          <GameButton
            disabled={busy}
            onClick={() =>
              setConfirm({
                text: 'Are you sure want to generate new attributes? This will cost 30 spirit coins and 50,000 stones.',
                onAccept: () => run('/bulk/refresh', { id }),
              })
            }
          >
            Refresh
          </GameButton>
          <GameButton disabled={busy || !canSave} onClick={save}>
            Save
          </GameButton>
          <GameButton
            onClick={() =>
              crystal.bulkOptions.length > 0
                ? setConfirm({
                    text: 'Are you sure want to close the bulk refinement? You can reopen it later.',
                    onAccept: onClose,
                  })
                : onClose()
            }
          >
            Close
          </GameButton>
        </div>
        {confirm && (
          <ConfirmDialog
            text={confirm.text}
            onAccept={confirm.onAccept}
            onClose={() => setConfirm(undefined)}
          />
        )}
      </div>
    </Dialog>
  )
}
