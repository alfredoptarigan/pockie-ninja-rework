// Reborn's Soul Synthesis (320x180, WM key `soulSynthesis`) and Soul Refine (320x344, WM key
// `soulRefine`) windows (reborn-windows-M-Z-hud.md), opened from the Souls tab. Our rules (M5
// decision 15): 3 souls of one level below the cap become 1 random soul of the next level; refine
// rerolls the target's type once per same-level material soul.
import { useEffect, useRef, useState } from 'react'
import type { SoulsView, SoulView } from '../../../../shared/src/schemas/bloodlines'
import { Dialog, GameButton } from '../skin'
import { quiet, soulIcon, soulName, SoulTile, type RunSoulAction } from './souls'
import { bigBg } from './panels'

const SYNTH_SIZE = 3
/** soulIdsBodySchema caps a request at 250 souls: 83 groups of 3. */
const BATCH_MAX = 249
const BATCH_PAUSE_MS = 300
const MIN_UNTIL = 2
const SLOT_X = [0, 85, 175]

export type BatchMode = 'level' | 'exact'

/**
 * Souls for one batch round: every full group of 3 loose souls under `until` (and the cap) of
 * one level (`level`) or one type and level (`exact`), at most 249.
 */
export function batchGroups(
  souls: readonly SoulView[],
  mode: BatchMode,
  until: number,
  maxLevel: number,
): string[] {
  const groups = new Map<string, string[]>()
  for (const soul of souls) {
    if (soul.limitId !== null || soul.level >= Math.min(until, maxLevel)) continue
    const key = mode === 'level' ? `${soul.level}` : `${soul.type}-${soul.level}`
    groups.set(key, [...(groups.get(key) ?? []), soul.id])
  }
  return [...groups.values()]
    .flatMap((ids) => ids.slice(0, ids.length - (ids.length % SYNTH_SIZE)))
    .slice(0, BATCH_MAX)
}

/** Three souls for Level Match (highest level with 3) or Exact Match (3 of one type and level). */
function autoFill(data: SoulsView, mode: BatchMode) {
  const maxLevel = data.levelLimits.length
  const groups = new Map<string, SoulView[]>()
  for (const soul of data.souls) {
    if (soul.limitId !== null || soul.level >= maxLevel) continue
    const key = mode === 'level' ? `${soul.level}` : `${soul.type}-${soul.level}`
    groups.set(key, [...(groups.get(key) ?? []), soul])
  }
  const best = [...groups.values()]
    .filter((group) => group.length >= SYNTH_SIZE)
    .sort((a, b) => b[0]!.level - a[0]!.level)[0]
  return best?.slice(0, SYNTH_SIZE).map((soul) => soul.id)
}

export function SoulSynthesisDialog({
  data,
  slots,
  onSlots,
  run,
  onClose,
}: {
  data: SoulsView
  slots: string[]
  onSlots: (ids: string[]) => void
  run: RunSoulAction
  onClose: () => void
}) {
  const maxLevel = data.levelLimits.length
  const [status, setStatus] = useState('')
  const [until, setUntil] = useState(MIN_UNTIL)
  const [batch, setBatch] = useState<BatchMode | null>(null)
  const stop = useRef(false)
  useEffect(
    () => () => {
      stop.current = true
    },
    [],
  )
  const souls = slots
    .map((id) => data.souls.find((s) => s.id === id))
    .filter((s): s is SoulView => s !== undefined)
  const level = souls[0]?.level
  const valid =
    souls.length === SYNTH_SIZE && souls.every((s) => s.level === level) && level! < maxLevel
  const fill = (mode: BatchMode) => {
    const ids = autoFill(data, mode)
    onSlots(ids ?? [])
    setStatus(ids ? 'Auto Filled Souls' : 'No valid combination')
  }
  const create = () => {
    if (!valid) return setStatus('Select compatible souls')
    quiet(
      run('souls/synthesize', { soulIds: slots }).then(() => {
        onSlots([])
        setStatus('Soul synthesis requested')
      }),
    )
  }
  const runBatch = async (mode: BatchMode) => {
    stop.current = false
    setBatch(mode)
    setStatus('Batch synthesis in progress...')
    let current = data
    for (;;) {
      const ids = batchGroups(current.souls, mode, until, maxLevel)
      if (ids.length === 0) {
        setStatus('No more combinations')
        break
      }
      try {
        current = await run('souls/synthesize', { soulIds: ids })
      } catch {
        setStatus('Stopped: Unable to continue')
        break
      }
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS))
      if (stop.current) {
        setStatus('Batch synthesis cancelled')
        break
      }
    }
    setBatch(null)
  }
  const batchButton = (mode: BatchMode, label: string) => (
    <GameButton
      small
      className="h-[22px] w-[92px]"
      disabled={batch !== null && batch !== mode}
      onClick={() => {
        if (batch === mode) stop.current = true
        else void runBatch(mode)
      }}
    >
      {batch === mode ? 'Stop Batch' : label}
    </GameButton>
  )
  return (
    <Dialog title="Soul Synthesis" onClose={onClose} className="game-window-bare w-[330px]">
      <div className="relative h-[180px] w-[320px] p-[5px] text-[11px] text-black" style={bigBg(1)}>
        <ul aria-label="Synthesis slots">
          {SLOT_X.map((x, i) => {
            const soul = souls[i]
            return (
              <li
                key={x}
                className="absolute top-[5px] w-[60px] text-center"
                style={{ left: x + 5 }}
              >
                {soul ? (
                  <SoulTile
                    data={data}
                    soul={soul}
                    onClick={(event) => {
                      event.preventDefault()
                      onSlots(slots.filter((id) => id !== soul.id))
                    }}
                  />
                ) : (
                  <span className="game-slot block size-[50px]" title="Empty slot" />
                )}
              </li>
            )
          })}
        </ul>
        <img
          src="/assets/game/ui/compose-plus.webp"
          alt=""
          className="absolute top-[20px] left-[60px] size-[23px]"
        />
        <img
          src="/assets/game/ui/compose-plus.webp"
          alt=""
          className="absolute top-[20px] left-[145px] size-[23px]"
        />
        <img
          src="/assets/game/ui/compose-equals.webp"
          alt=""
          className="absolute top-[24px] left-[235px] h-4 w-6"
        />
        <div
          aria-label="Synthesis result"
          className="game-slot absolute top-[5px] left-[265px] grid size-[50px] place-items-center"
        >
          {valid && (
            <>
              <img
                src="/assets/game/ui/compose-unknown.webp"
                alt="Random soul"
                className="size-8"
              />
              <span className="absolute right-[2px] bottom-0 text-[9px] font-bold">
                Lv.{level! + 1}
              </span>
            </>
          )}
        </div>
        <div className="absolute top-[80px] left-[5px] flex gap-[5px]">
          <GameButton small className="h-[22px] w-[100px]" onClick={() => fill('level')}>
            Level Match
          </GameButton>
          <GameButton small className="h-[22px] w-[100px]" onClick={() => fill('exact')}>
            Exact Match
          </GameButton>
          <GameButton
            small
            className="h-[22px] w-[100px]"
            disabled={!valid || batch !== null}
            onClick={create}
          >
            Create
          </GameButton>
        </div>
        <div className="absolute top-[110px] left-[5px] flex items-center gap-[4px]">
          <span>Until Lv:</span>
          <GameButton
            small
            aria-label="Lower level"
            className="h-5 w-[18px] min-w-0! px-0!"
            disabled={until <= MIN_UNTIL}
            onClick={() => setUntil(until - 1)}
          >
            -
          </GameButton>
          <span aria-label="Until level" className="w-4 text-center font-bold">
            {until}
          </span>
          <GameButton
            small
            aria-label="Raise level"
            className="h-5 w-[18px] min-w-0! px-0!"
            disabled={until >= maxLevel}
            onClick={() => setUntil(until + 1)}
          >
            +
          </GameButton>
          {batchButton('level', 'Auto Level')}
          {batchButton('exact', 'Auto Exact')}
        </div>
        <GameButton
          small
          className="absolute! top-[143px] left-[115px] h-5 w-[90px]"
          onClick={() => {
            onSlots([])
            setStatus('')
          }}
        >
          Clear
        </GameButton>
        <p role="status" className="absolute top-[166px] left-[10px] w-[300px] text-center">
          {status}
        </p>
      </div>
    </Dialog>
  )
}

export function SoulRefineDialog({
  data,
  targetId,
  run,
  onClose,
}: {
  data: SoulsView
  targetId: string
  run: RunSoulAction
  onClose: () => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const target = data.souls.find((s) => s.id === targetId)
  const materials = target
    ? data.souls.filter((s) => s.limitId === null && s.id !== targetId && s.level === target.level)
    : []
  const refine = () => {
    if (picked.length === 0) return setStatus('Select at least one same-level soul as material.')
    quiet(
      run('souls/refine', { targetId, fuelIds: picked }).then(() => {
        setStatus(`Refined ${picked.length}x`)
        setPicked([])
      }),
    )
  }
  return (
    <Dialog title="Soul Refine" onClose={onClose} className="game-window-bare w-[330px]">
      <div
        className="flex h-[344px] w-[320px] flex-col items-center gap-[6px] p-[8px] text-[11px] text-black"
        style={bigBg(1)}
      >
        {!target ? (
          <p>No same-level souls available to use as material.</p>
        ) : (
          <>
            <h3 className="text-center font-bold">Soul to Refine</h3>
            <div
              title={soulName(data, target)}
              className="game-slot relative grid size-[50px] place-items-center"
            >
              <img src={soulIcon(target.type)} alt="" className="w-[45px]" />
              <span className="absolute right-[2px] bottom-0 text-[9px] font-bold">
                Lv.{target.level}
              </span>
            </div>
            <p className="font-bold">{soulName(data, target)}</p>
            <p className="w-[304px] text-center opacity-85">
              Each material soul (same level) rerolls this soul into a different one at random.
            </p>
            <p className="flex w-[304px] justify-between">
              <span>
                Materials (Lv.{target.level}): {materials.length}
              </span>
              <span>Selected: {picked.length}</span>
            </p>
            <ul
              aria-label="Materials"
              className="flex h-[138px] w-[304px] flex-wrap content-start gap-x-[9px] gap-y-[14px] overflow-auto bg-black/20 p-1"
            >
              {materials.length === 0 && <li>No same-level souls available to use as material.</li>}
              {materials.map((soul) => {
                const order = picked.indexOf(soul.id)
                return (
                  <li key={soul.id}>
                    <SoulTile
                      data={data}
                      soul={soul}
                      pressed={order >= 0}
                      order={order + 1}
                      onClick={(event) => {
                        event.preventDefault()
                        setPicked(
                          order >= 0 ? picked.filter((id) => id !== soul.id) : [...picked, soul.id],
                        )
                      }}
                    />
                  </li>
                )
              })}
            </ul>
            <div className="flex gap-2">
              <GameButton
                small
                className="h-[22px] w-[84px]"
                disabled={materials.length === 0}
                onClick={() => setPicked(materials.map((s) => s.id))}
              >
                Select All
              </GameButton>
              <GameButton
                small
                className="h-[22px] w-[70px]"
                disabled={picked.length === 0}
                onClick={() => setPicked([])}
              >
                Clear
              </GameButton>
              <GameButton
                small
                className="h-[22px] w-[90px]"
                disabled={picked.length === 0}
                onClick={refine}
              >
                Refine
              </GameButton>
            </div>
            <p role="status">{status}</p>
          </>
        )}
      </div>
    </Dialog>
  )
}
