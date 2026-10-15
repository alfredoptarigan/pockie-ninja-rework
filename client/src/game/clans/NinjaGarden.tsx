// Reborn's Ninja Garden (`Gh`, 570x420 on Clan/garden.png, reborn-windows-M-Z-hud.md) from the
// Clan window's Events "Garden" tile: nine plots (locked 35.png, open 70.png), the scroll counter,
// timers over growing trees and resting plots, and the plot rules: a locked plot asks to unlock
// it (250 Gift Certificates), an empty one opens Choose Tree (or the daily-limit / cooldown
// notices), a tree is harvested. Choose Tree leads to the Ninjutsu Garden: levels 1-5, Plant
// Tree, Random Level, Level Up Tree and Auto Level (rerolls 300 ms apart until the chosen level
// or higher, then plants). Reborn's emoji in titles are left out (no emoji in our UI).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  GARDEN_RULES,
  GARDEN_TREES,
  treeLevel,
  type GardenHarvest,
  type GardenPlotView,
  type GardenView,
  type TreeType,
} from '../../../../shared/src/schemas/home'
import { errorMessage } from '../api'
import { hms } from '../dungeons'
import { useNow } from '../events/timer'
import { Dialog, GameButton, Notice } from '../skin'
import { useGarden, useGardenAction } from './events-api'

const ASSETS = '/assets/reborn'
const clanIcon = (n: number) => `${ASSETS}/ui/UIResource/Clan/icon_clan_2_${n}.webp`
/** `levels`: icon_clan_2_N of level 1 (money 5-9, zenpakuto 11-15). */
const TREE_ART: Record<TreeType, { icon: string; sprite: string; levels: number; color: string }> =
  {
    money: {
      icon: clanIcon(4),
      sprite: `${ASSETS}/clan/ninjagarden/images/20.webp`,
      levels: 5,
      color: '#ffd700',
    },
    zenpakuto: {
      icon: clanIcon(10),
      sprite: `${ASSETS}/clan/ninjagarden/images/7.webp`,
      levels: 11,
      color: '#4fc3f7',
    },
  }
/** Plot centres from `le`, drawn 117x59 from (x - 58.5, y - 19.5). */
const PLOT_CENTRES = [
  [296, 274],
  [241, 195],
  [298, 169],
  [185, 221],
  [353, 250],
  [406, 224],
  [244, 248],
  [297, 222],
  [349, 195],
] as const
const ROLL_MS = 300
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** One-button message dialog (Reborn's Notice / Success). */
export function MessageDialog({
  title = 'Notice',
  children,
  onClose,
}: {
  title?: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <Dialog title={title} onClose={onClose} className="w-[280px]">
      <p className="text-center font-bold whitespace-pre-line">{children}</p>
      <div className="mt-3 flex justify-center">
        <GameButton onClick={onClose}>OK</GameButton>
      </div>
    </Dialog>
  )
}

export function ConfirmDialog({
  title,
  children,
  choices,
  onClose,
}: {
  title: string
  children: ReactNode
  choices: { label: string; onPick: () => void }[]
  onClose: () => void
}) {
  return (
    <Dialog title={title} onClose={onClose} className="w-[320px]">
      <div className="text-center">{children}</div>
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        {choices.map((choice) => (
          <GameButton
            key={choice.label}
            onClick={() => {
              onClose()
              choice.onPick()
            }}
          >
            {choice.label}
          </GameButton>
        ))}
        <GameButton onClick={onClose}>Cancel</GameButton>
      </div>
    </Dialog>
  )
}

const harvestText = (h: GardenHarvest) => {
  const lines = [
    h.bankaiExp && `+${h.bankaiExp} Bankai EXP`,
    h.clanHonor && `+${h.clanHonor} Clan Honor`,
    h.coins && `+${h.coins} Coins`,
  ].filter(Boolean)
  const tree = h.type === 'money' ? 'Money' : 'Zenpakuto'
  return `Harvested Level ${h.level} ${tree} Tree!\n\n${lines.join('\n') || 'Tree harvested!'}`
}

const rewardText = (type: TreeType, level: number) => {
  const r = treeLevel(type, level)
  return type === 'money'
    ? `${r.coins} Bankai coin and ${r.clanPoints} Clan points.`
    : `${r.bankaiExp} Bankai experience and ${r.clanPoints} Clan points.`
}

function untilReset(resetAt: number, now: number) {
  const left = Math.max(0, resetAt - now)
  return `${Math.floor(left / 3_600_000)}h ${Math.floor((left % 3_600_000) / 60_000)}m`
}

function Plot({
  index,
  plot,
  now,
  resetIn,
  plantsToday,
  onClick,
}: {
  index: number
  plot: GardenPlotView
  now: number
  /** ms to midnight UTC when today's plantings are used up, else 0. */
  resetIn: number
  plantsToday: number
  onClick: () => void
}) {
  const [x, y] = PLOT_CENTRES[index]!
  const growing = plot.tree && plot.tree.readyAt > now
  const resting = !plot.tree && plot.cooldownUntil > now
  const capped = !plot.locked && !plot.tree && resetIn > 0
  const timer = growing
    ? hms(plot.tree!.readyAt - now)
    : resting
      ? hms(plot.cooldownUntil - now)
      : capped
        ? hms(resetIn)
        : null
  const scale = plot.tree ? 0.7 + 0.075 * (plot.tree.level - 1) : 1
  const state = plot.locked
    ? 'locked'
    : plot.tree
      ? `Level ${plot.tree.level} ${GARDEN_TREES[plot.tree.type].name}, ${growing ? 'growing' : 'ready'}`
      : resting
        ? 'on cooldown'
        : 'empty'
  return (
    <button
      type="button"
      aria-label={`Plot ${index + 1}: ${state}`}
      onClick={onClick}
      className="absolute h-[59px] w-[117px] cursor-pointer hover:brightness-110"
      style={{ left: x - 58.5, top: y - 19.5, zIndex: Math.floor(y) }}
    >
      <img
        src={`${ASSETS}/clan/ninjagarden/images/${plot.locked ? 35 : 70}.webp`}
        alt=""
        className="pointer-events-none absolute -top-[10px] left-0 h-[59px] w-[117px] object-contain"
      />
      {plot.tree && (
        <img
          src={TREE_ART[plot.tree.type].sprite}
          alt=""
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full"
          style={{ width: 50 * scale, height: 70 * scale }}
        />
      )}
      {timer && !plot.locked && (
        <span
          className={`pointer-events-none absolute top-[4.5px] left-[44.5px] z-10 -translate-x-1/2 text-center font-mono text-[10px] font-bold whitespace-nowrap [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000] ${capped ? 'text-[#ff3333]' : 'text-[#ff9800]'}`}
        >
          {timer}
          {capped && (
            <span className="block text-[8px] text-[#ff6666]">
              {plantsToday}/{GARDEN_RULES.dailyPlants} done
            </span>
          )}
        </span>
      )}
    </button>
  )
}

function ChooseTree({
  onPick,
  onClose,
}: {
  onPick: (type: TreeType) => void
  onClose: () => void
}) {
  return (
    <Dialog title="Choose Tree" onClose={onClose} className="w-[300px]">
      <p className="mb-3 text-center font-bold text-[#3d6a3d]">Choose Tree Type:</p>
      <div className="flex flex-col gap-2">
        {(
          [
            ['money', 'Earn Bankai Coins & Clan Points'],
            ['zenpakuto', 'Earn Bankai EXP & Clan Points'],
          ] as const
        ).map(([type, hint]) => (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            className="flex items-center gap-3 rounded-lg border-2 bg-[#2a2a1a] px-3 py-2 text-left"
            style={{ borderColor: TREE_ART[type].color }}
          >
            <img src={TREE_ART[type].icon} alt="" className="size-[45px] object-contain" />
            <span>
              <span className="block text-[13px] font-bold" style={{ color: TREE_ART[type].color }}>
                {GARDEN_TREES[type].name}
              </span>
              <span className="block text-[10px] text-[#ccc]">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}

function NinjutsuGarden({
  type,
  plotIndex,
  garden,
  onDone,
  onMessage,
  onClose,
}: {
  type: TreeType
  plotIndex: number
  garden: GardenView
  onDone: () => void
  onMessage: (text: string) => void
  onClose: () => void
}) {
  const action = useGardenAction()
  const [confirm, setConfirm] = useState<'random' | 'levelup' | null>(null)
  const [autoLevel, setAutoLevel] = useState(0)
  const [rolls, setRolls] = useState<number | null>(null)
  const stop = useRef(false)
  useEffect(() => () => void (stop.current = true), [])
  const level = garden.pendingLevel
  const art = TREE_ART[type]
  const busy = action.isPending || rolls !== null

  const plant = async (treeLevel: number) => {
    await action.mutateAsync({ path: 'plant', body: { plotIndex, treeLevel, treeType: type } })
    onDone()
  }
  const attempt = async (run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      onMessage(errorMessage(error))
    }
  }
  const reroll = (payWith: 'gc' | 'stones') =>
    attempt(async () => {
      if (!autoLevel) {
        await action.mutateAsync({ path: 'reroll', body: { payWith } })
        return
      }
      stop.current = false
      setRolls(0)
      try {
        for (let count = 1; !stop.current; count++) {
          const result = await action.mutateAsync({ path: 'reroll', body: { payWith } })
          setRolls(count)
          if (result.garden.pendingLevel >= autoLevel) {
            await plant(result.garden.pendingLevel)
            break
          }
          await sleep(ROLL_MS)
        }
      } finally {
        setRolls(null)
      }
    })
  const levelUp = (payWith: 'gc' | 'gold') =>
    attempt(async () => {
      await action.mutateAsync({ path: 'level-up', body: { currentLevel: level, payWith } })
    })

  return (
    <Dialog title="Ninjutsu Garden" onClose={onClose} className="w-[400px]">
      <ol aria-label="Tree levels" className="mb-3 flex items-center justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <li key={n} className="flex items-center gap-1">
            <span
              aria-current={n === level ? 'step' : undefined}
              className="rounded-md p-1 text-center"
              style={
                n === level
                  ? { border: `2px solid ${art.color}`, boxShadow: `0 0 8px ${art.color}` }
                  : { border: '1px solid #444' }
              }
            >
              <img
                src={clanIcon(art.levels + n - 1)}
                alt=""
                className="size-[45px] object-contain"
              />
              <span className="block text-[9px]">Lv. {n}</span>
            </span>
            {n < 5 && (
              <img
                src={`${ASSETS}/ui/UIResource/Common/Arrowhead2.webp`}
                alt=""
                className="size-4"
              />
            )}
          </li>
        ))}
      </ol>
      <div className="mb-3 rounded-md border-2 border-[#c4a66a] bg-[#f5e6c8] p-2 text-[11px] text-black">
        <p>
          <b>Current plant level:</b> Ordinary {GARDEN_TREES[type].name}. You can get:{' '}
          {rewardText(type, level)}
        </p>
        {level < GARDEN_RULES.maxLevel && (
          <p className="mt-1">
            <b>Next plant level:</b> Ordinary {GARDEN_TREES[type].name}. You can get:{' '}
            {rewardText(type, level + 1)}
          </p>
        )}
      </div>
      <div className="flex justify-center gap-3">
        <GameButton disabled={busy} onClick={() => void attempt(() => plant(level))}>
          Plant Tree
        </GameButton>
        <GameButton disabled={busy} onClick={() => setConfirm('random')}>
          Random Level
        </GameButton>
        <GameButton
          disabled={busy}
          className={level >= GARDEN_RULES.maxLevel ? 'opacity-50' : ''}
          onClick={() =>
            level >= GARDEN_RULES.maxLevel
              ? onMessage(`Already at maximum level ${GARDEN_RULES.maxLevel}!`)
              : setConfirm('levelup')
          }
        >
          Level Up Tree
        </GameButton>
      </div>
      <label className="mt-3 flex items-center justify-center gap-2 text-[11px]">
        Auto Level
        <select
          value={autoLevel}
          disabled={busy}
          onChange={(event) => setAutoLevel(Number(event.target.value))}
          className="rounded border border-[#c4a66a] bg-[#f5e6c8] px-1"
        >
          <option value={0}>Off</option>
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Level {n}+
            </option>
          ))}
        </select>
      </label>
      {rolls !== null ? (
        <p role="status" className="mt-1 flex items-center justify-center gap-2 text-[11px]">
          Rolling for Level {autoLevel}+... ({rolls} rolls)
          <GameButton small onClick={() => (stop.current = true)}>
            Stop
          </GameButton>
        </p>
      ) : (
        <p className="mt-1 text-center text-[10px] text-[#555]">
          With Auto Level set, Random Level keeps rolling until the chosen level or higher, then
          plants the tree.
        </p>
      )}
      {confirm === 'random' && (
        <ConfirmDialog
          title="Random Level"
          onClose={() => setConfirm(null)}
          choices={[
            { label: `${GARDEN_RULES.reroll.gc} GC`, onPick: () => void reroll('gc') },
            {
              label: `${GARDEN_RULES.reroll.stones.toLocaleString('en-US')} Stones`,
              onPick: () => void reroll('stones'),
            },
          ]}
        >
          Choose how to pay for a random tree level (L1-L5):
          <br />
          <b>{GARDEN_RULES.reroll.gc} GC</b> or{' '}
          <b>{GARDEN_RULES.reroll.stones.toLocaleString('en-US')} Stones</b>
        </ConfirmDialog>
      )}
      {confirm === 'levelup' && (
        <ConfirmDialog
          title="Level Up Tree"
          onClose={() => setConfirm(null)}
          choices={[
            { label: `${GARDEN_RULES.levelUp.gc} GC`, onPick: () => void levelUp('gc') },
            { label: `${GARDEN_RULES.levelUp.gold} Gold`, onPick: () => void levelUp('gold') },
          ]}
        >
          Upgrade from Level {level} to Level {level + 1}. Choose how to pay:
          <br />
          <b>{GARDEN_RULES.levelUp.gc} GC</b> or <b>{GARDEN_RULES.levelUp.gold} Gold</b>
        </ConfirmDialog>
      )}
    </Dialog>
  )
}

type Open =
  | { kind: 'unlock'; plot: number }
  | { kind: 'cooldown'; plot: number }
  | { kind: 'choose'; plot: number }
  | { kind: 'plant'; plot: number; type: TreeType }

export function NinjaGardenWindow({ onClose }: { onClose: () => void }) {
  const garden = useGarden()
  const action = useGardenAction()
  const clientNow = useNow()
  const [open, setOpen] = useState<Open | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  if (garden.isError)
    return (
      <Dialog title="Ninja Garden" onClose={onClose}>
        <Notice tone="error">{errorMessage(garden.error)}</Notice>
      </Dialog>
    )
  if (!garden.data) return null
  const view = garden.data
  // useNow may predate the fetch; the server clock moved on from serverNow since it arrived.
  const now = view.serverNow + Math.max(0, clientNow - garden.dataUpdatedAt)
  const limitReached = view.plantsToday >= GARDEN_RULES.dailyPlants

  const run = async (path: string, body: object) => {
    try {
      const result = await action.mutateAsync({ path, body })
      if (result.harvest) setMessage(harvestText(result.harvest))
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }
  const click = (index: number) => {
    const plot = view.plots[index]!
    if (action.isPending) return
    if (plot.locked) return setOpen({ kind: 'unlock', plot: index })
    if (plot.tree) return void run('harvest', { plotIndex: index })
    if (limitReached)
      return setMessage(
        `Plant limit reached (${view.plantsToday}/${GARDEN_RULES.dailyPlants} today)\n\nResets in ${untilReset(view.resetAt, now)} (midnight UTC)\nScrolls cannot skip daily limits.`,
      )
    if (plot.cooldownUntil > now) return setOpen({ kind: 'cooldown', plot: index })
    setOpen({ kind: 'choose', plot: index })
  }

  return (
    <Dialog title="Ninja Garden" onClose={onClose} className="w-[594px]">
      <div
        role="region"
        aria-label="Garden plots"
        className="relative h-[420px] w-[570px] overflow-hidden rounded-lg bg-cover bg-center"
        style={{ backgroundImage: `url(${ASSETS}/ui/UIResource/Clan/garden.webp)` }}
      >
        {view.plots.map((plot, index) => (
          <Plot
            key={index}
            index={index}
            plot={plot}
            now={now}
            resetIn={limitReached ? view.resetAt - now : 0}
            plantsToday={view.plantsToday}
            onClick={() => click(index)}
          />
        ))}
        <span className="absolute top-[22px] left-[28px]" title="Garden Scrolls">
          <img src={clanIcon(1)} alt="Garden Scrolls" className="size-9" />
          <span
            aria-label={`${view.scrolls} scrolls`}
            className="absolute -top-1 -right-2 min-w-[14px] rounded-sm bg-[#2e7d32] px-1 text-center text-[10px] font-bold text-white"
          >
            {view.scrolls}
          </span>
        </span>
      </div>
      {open?.kind === 'unlock' && (
        <ConfirmDialog
          title="Unlock Plot"
          onClose={() => setOpen(null)}
          choices={[
            { label: 'Confirm', onPick: () => void run('unlock', { plotIndex: open.plot }) },
          ]}
        >
          Do you want to unlock this plot for <b>{GARDEN_RULES.unlockCost} Gift Certificates</b>?
        </ConfirmDialog>
      )}
      {open?.kind === 'cooldown' && (
        <ConfirmDialog
          title="Notice"
          onClose={() => setOpen(null)}
          choices={[{ label: 'Skip', onPick: () => void run('skip', { plotIndex: open.plot }) }]}
        >
          <p className="font-bold">Plot is on Cooldown</p>
          <p className="flex items-center justify-center gap-1">
            Use 1 <img src={clanIcon(1)} alt="scroll" className="size-5" /> to skip cooldown?
          </p>
          <p className="font-bold text-[#2e7d32]">
            {GARDEN_RULES.dailyPlants - view.plantsToday}/{GARDEN_RULES.dailyPlants} plants
            remaining today
          </p>
        </ConfirmDialog>
      )}
      {open?.kind === 'choose' && (
        <ChooseTree
          onClose={() => setOpen(null)}
          onPick={(type) => setOpen({ kind: 'plant', plot: open.plot, type })}
        />
      )}
      {open?.kind === 'plant' && (
        <NinjutsuGarden
          type={open.type}
          plotIndex={open.plot}
          garden={view}
          onDone={() => setOpen(null)}
          onMessage={setMessage}
          onClose={() => setOpen(null)}
        />
      )}
      {message && <MessageDialog onClose={() => setMessage(null)}>{message}</MessageDialog>}
    </Dialog>
  )
}
