// Reborn's Home (scene 4101, main.js @3589900), opened by the village "Home" icon: the home
// background with the Storage building and six farm fields drawn like Reborn's Phaser farm
// (container at 227,705 of the 1920x1080 scene). An empty field opens the seed list (Reborn's
// SA window: icon, "Cost: N", grow time, Buy); a planted one shows its crop growing with an
// HH:MM:SS timer on the server clock and READY when ripe; clicking a ripe one harvests it.
// Storage opens our warehouse (the Market Storage tab).
// ponytail: a window, not a walkable scene; the home NPC (it only logs a click) is left out.
import { useState } from 'react'
import type { FarmPlot, FarmSeed } from '../../../../shared/src/schemas/home'
import { errorMessage } from '../api'
import { hms } from '../dungeons'
import { useNow } from '../events/timer'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { WarehouseTab } from '../market/Warehouse'
import { Dialog, GameButton, Notice } from '../skin'
import { showToast } from '../toast'
import type { WindowProps } from '../windows'
import { useHome, useHomeAction } from './api'

/** The 1920x1080 scene drawn at this scale. */
const SCALE = 0.45
const ASSETS = '/assets/reborn'
const FARM = { x: 227, y: 705 }
/** Field images f_0..f_5: offset in the farm container and natural size. */
const FIELDS = [
  { x: 0, y: 0, w: 319, h: 67 },
  { x: 473, y: 0, w: 425, h: 68 },
  { x: 238, y: 0, w: 371, h: 66 },
  { x: 23, y: 65, w: 427, h: 113 },
  { x: 316, y: 65, w: 503, h: 113 },
  { x: 607, y: 65, w: 558, h: 107 },
]
const PLANTS: Record<string, { w: number; h: number }> = {
  i170001: { w: 158, h: 113 },
  i170002: { w: 229, h: 163 },
  i170003: { w: 246, h: 214 },
  i170004: { w: 218, h: 194 },
  growing: { w: 224, h: 48 },
}
const STORAGE = { x: 514, y: 277, w: 418, h: 314 }
const px = (value: number) => value * SCALE

function Field({
  index,
  plot,
  now,
  busy,
  onClick,
}: {
  index: number
  plot: FarmPlot | null
  now: number
  busy: boolean
  onClick: () => void
}) {
  const field = FIELDS[index]!
  const left = FARM.x + field.x
  const top = FARM.y + field.y
  const ripe = plot !== null && plot.readyAt <= now
  const sprite = plot ? (ripe ? plot.crop.slice(1) : 'growing') : null
  const size = sprite ? PLANTS[ripe ? plot!.crop : 'growing'] : undefined
  const anchor = { x: left + (5 * field.w) / 12, y: top + (7 * field.h) / 9 }
  const label = plot
    ? `Field ${index + 1}: ${itemName(plot.crop)}, ${ripe ? 'ready' : hms(plot.readyAt - now)}`
    : `Field ${index + 1}: empty`
  return (
    <>
      <button
        type="button"
        aria-label={label}
        disabled={busy}
        onClick={onClick}
        className="absolute cursor-pointer hover:brightness-75 disabled:cursor-wait"
        style={{ left: px(left), top: px(top), width: px(field.w), height: px(field.h) }}
      >
        <img
          src={`${ASSETS}/scenes/home/f_${index}_${plot ? 'active' : 'inactive'}.webp`}
          alt=""
          className="size-full"
        />
      </button>
      {sprite && size && (
        <img
          src={`${ASSETS}/scenes/home/plants/${sprite}.webp`}
          alt=""
          className="pointer-events-none absolute"
          style={{
            left: px(anchor.x - size.w / 2),
            top: px(anchor.y - size.h),
            width: px(size.w),
            height: px(size.h),
          }}
        />
      )}
      {plot && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded bg-black/65 px-1 text-[9px] font-bold ${ripe ? 'text-[#7cff6b]' : 'text-white'}`}
          style={{ left: px(anchor.x), top: px(top + field.h - 4) }}
        >
          {ripe ? 'READY' : hms(plot.readyAt - now)}
        </span>
      )}
    </>
  )
}

function SeedList({
  seeds,
  busy,
  onBuy,
  onClose,
}: {
  seeds: FarmSeed[]
  busy: boolean
  onBuy: (seed: FarmSeed) => void
  onClose: () => void
}) {
  return (
    <Dialog title="Seeds" onClose={onClose} className="w-[520px]">
      <ul aria-label="Seeds" className="flex gap-1">
        {seeds.map((seed) => {
          const name = itemName(seed.crop)
          return (
            <li
              key={seed.crop}
              aria-label={name}
              className="game-panel-1 flex h-[120px] w-[150px] flex-col items-center gap-1 p-1 text-[12px] text-black"
            >
              <ItemIcon itemId={seed.crop} name={name} />
              <span className="font-bold">{name}</span>
              <span>Cost: {seed.cost.toLocaleString('en-US')} Stones</span>
              <span>{hms(seed.minutes * 60_000)}</span>
              <GameButton small disabled={busy} onClick={() => onBuy(seed)}>
                Buy
              </GameButton>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}

export function HomeWindow({ character, onClose }: WindowProps) {
  const home = useHome()
  const action = useHomeAction()
  const clientNow = useNow()
  const [choosing, setChoosing] = useState<number | null>(null)
  const [storage, setStorage] = useState(false)
  if (home.isError)
    return (
      <Dialog title="Home" onClose={onClose}>
        <Notice tone="error">{errorMessage(home.error)}</Notice>
      </Dialog>
    )
  if (!home.data) return null
  // useNow may predate the fetch; the server clock moved on from serverNow since it arrived.
  const now = home.data.serverNow + Math.max(0, clientNow - home.dataUpdatedAt)

  async function run(path: 'plant' | 'harvest', body: object) {
    try {
      const result = await action.mutateAsync({ path, body })
      if (result.harvested)
        showToast(
          `Harvested ${itemName(result.harvested.crop)} x${result.harvested.count}.`,
          'success',
        )
    } catch (error) {
      showToast(errorMessage(error), 'failure')
    }
  }

  return (
    <Dialog title="Home" onClose={onClose} className="w-[890px]">
      <div
        role="region"
        aria-label="Home farm"
        className="relative overflow-hidden"
        style={{ width: px(1920), height: px(1080) }}
      >
        <img src={`${ASSETS}/scenes/home/bg.webp`} alt="" className="absolute inset-0 size-full" />
        <button
          type="button"
          aria-label="Storage"
          onClick={() => setStorage(true)}
          className="group absolute cursor-pointer"
          style={{
            left: px(STORAGE.x),
            top: px(STORAGE.y),
            width: px(STORAGE.w),
            height: px(STORAGE.h),
          }}
        >
          <img
            src={`${ASSETS}/home/scene/19.webp`}
            alt=""
            className="size-full group-hover:brightness-125"
          />
          <span className="absolute top-[68px] left-[20px] rounded bg-black/60 px-1 text-[11px] text-white">
            Storage
          </span>
        </button>
        {home.data.plots.map((plot, index) => (
          <Field
            key={index}
            index={index}
            plot={plot}
            now={now}
            busy={action.isPending}
            onClick={() => (plot ? void run('harvest', { plot: index }) : setChoosing(index))}
          />
        ))}
      </div>
      {choosing !== null && (
        <SeedList
          seeds={home.data.seeds}
          busy={action.isPending}
          onClose={() => setChoosing(null)}
          onBuy={(seed) => {
            void run('plant', { plot: choosing, crop: seed.crop })
            setChoosing(null)
          }}
        />
      )}
      {storage && (
        <Dialog title="Storage" onClose={() => setStorage(false)} className="w-[680px]">
          <div className="game-panel-1 relative h-[328px] p-[4px] font-sans text-[12px] text-black">
            <WarehouseTab character={character} />
          </div>
        </Dialog>
      )}
    </Dialog>
  )
}
