// Reborn's Dice of Fate (366x276, `Vi`) and its Cleromancy dice-throw window (240x350, `Pi`),
// reborn-windows-A-L.md. Effects keep the 2011 stats of buffs 80101-80202 (decision 25), so the
// tooltips list those, with Reborn's 2h / 6h. ponytail: the dial and dice are drawn with CSS (the
// frame, dial and dice art and the blessing / curse GIFs are not exported); the replenish limit
// per day is ours.
import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { showToast } from '../toast'
import { useEventAction, useEvents } from './api'

type Roll = { dice: number[]; net: number; buffId: number | null }
const BUFFS: Record<number, { name: string; tile: string; tip: string }> = {
  80101: {
    name: 'Low Level Blessing',
    tile: 'Low Level',
    tip: 'Increase Constitution, Armor Break by 6; Dodge, Block, Critical Strike by 4; Hit, Pierce, Defense by 7 for 2h',
  },
  80102: {
    name: 'Angelic Blessing',
    tile: 'Angelic',
    tip: 'Increase Critical Strike by 8; Dodge, Block by 9; Constitution, Armor Break by 12; Hit, Pierce, Defense by 14 for 6h',
  },
  80201: {
    name: 'Low Level Curse',
    tile: 'Low Level',
    tip: 'Decrease Constitution, Armor Break by 6; Dodge, Block, Critical Strike by 4; Hit, Pierce, Defense by 7 for 2h',
  },
  80202: {
    name: 'Demonic Curse',
    tile: 'Demonic',
    tip: 'Decrease Critical Strike by 8; Dodge, Block by 9; Constitution, Armor Break by 12; Hit, Pierce, Defense by 14 for 6h',
  },
}
/** Tiers by net lucky dice (game-core diceTier): 4+ and 2-3 either way. */
const BOXES = [
  {
    title: 'Blessing Effect:',
    buffs: [80101, 80102],
    rules: [
      'Angelic Blessing: Net 4+ lucky dice (5, 6)',
      'Low Level Blessing: Net 2-3 lucky dice (5, 6)',
    ],
  },
  {
    title: 'Curse Effect:',
    buffs: [80201, 80202],
    rules: [
      'Demonic Curse: Net 4+ unlucky dice (1, 2)',
      'Low Level Curse: Net 2-3 unlucky dice (1, 2)',
    ],
  },
]
const ROW_WIDTH = 350
const LOG_SIZE = 12
const number = (value: number) => value.toLocaleString('en-US')
const isCurse = (buffId: number) => buffId >= 80201

function outcome(buffId: number | null) {
  if (buffId === null) return 'The dice have nothing in store for you.'
  return `The dice ${isCurse(buffId) ? 'curse' : 'bless'} you with ${BUFFS[buffId]!.name}.`
}

function toast(buffId: number | null) {
  if (buffId === null) return showToast('The dice settle... fate is undecided.', 'info')
  const name = BUFFS[buffId]!.name
  if (isCurse(buffId)) showToast(`Misfortune strikes - ${name}!`, 'failure')
  else showToast(`Fortune favors you - ${name}!`, 'success')
}

export function DiceOfFateWindow({ onClose }: { onClose: () => void }) {
  const events = useEvents()
  const action = useEventAction()
  const [casting, setCasting] = useState<{ roll: Roll | null; seq: number } | null>(null)
  const [log, setLog] = useState<Roll[]>([])
  const error = events.error ?? action.error
  const dice = events.data?.dice
  const stone = events.data?.character.stone ?? 0
  const busy = action.isPending
  const attempt = () => {
    setCasting({ roll: null, seq: (casting?.seq ?? 0) + 1 })
    action.mutate('dice/roll', {
      onSuccess: (view) => {
        const roll = view.dice.lastRoll
        if (!roll) return
        setCasting((current) => ({ roll, seq: current?.seq ?? 1 }))
        setLog((entries) => [...entries, roll].slice(-LOG_SIZE))
        toast(roll.buffId)
      },
    })
  }
  const buttons = dice ? (dice.curse ? 3 : 2) : 2
  const width = Math.floor((ROW_WIDTH - 4 * (buttons + 1)) / buttons)
  return (
    <Dialog title="Dice of Fate" onClose={onClose} className="game-window-bare w-[366px]">
      <div className="game-panel-1 flex min-h-[276px] flex-col gap-[6px] p-[8px] font-game text-xs text-black">
        {events.isPending && <p>Loading dice...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {dice && (
          <>
            <p>Today&apos;s number of times for Cleromancy: {dice.rollsLeft}</p>
            {BOXES.map((box) => (
              <EffectBox key={box.title} {...box} />
            ))}
            <ActiveEffects buffs={dice.buffs} />
            <div className="mt-auto flex justify-between">
              <GameButton
                className="h-[25px] !min-w-0 !px-0"
                style={{ width }}
                disabled={busy || dice.rollsLeft <= 0}
                onClick={attempt}
              >
                Attempt Cleromancy
              </GameButton>
              <GameButton
                className="h-[25px] !min-w-0 !px-0"
                style={{ width }}
                title={`You can only refresh dice once all attempts have been used. Replenished today: ${dice.bought}/${dice.buyLimit}.`}
                disabled={
                  busy ||
                  dice.rollsLeft > 0 ||
                  dice.bought >= dice.buyLimit ||
                  stone < dice.replenishCost
                }
                onClick={() => action.mutate('dice/replenish')}
              >
                Replenish Dice ({number(dice.replenishCost)} <StoneIcon />)
              </GameButton>
              {dice.curse && (
                <GameButton
                  className="h-[25px] !min-w-0 !px-0"
                  style={{ width }}
                  disabled={busy || stone < dice.clearCost}
                  onClick={() =>
                    action.mutate('dice/clear', {
                      onSuccess: () => showToast('Your curse has been lifted!', 'success'),
                    })
                  }
                >
                  Clear Curse ({number(dice.clearCost)} <StoneIcon />)
                </GameButton>
              )}
            </div>
          </>
        )}
      </div>
      {casting && (
        <CleromancyWindow
          key={casting.seq}
          roll={casting.roll}
          casting={busy}
          log={log}
          onClose={() => setCasting(null)}
        />
      )}
    </Dialog>
  )
}

function StoneIcon() {
  return <img src="/assets/game/ui/icon-stone.webp" alt="Stones" className="inline size-[14px]" />
}

function EffectBox({ title, buffs, rules }: { title: string; buffs: number[]; rules: string[] }) {
  return (
    <section role="group" aria-label={title} className="game-card flex flex-col gap-1 p-[5px]">
      <h3 className="font-bold">{title}</h3>
      <div className="flex gap-2">
        {buffs.map((id) => (
          <span
            key={id}
            title={`${BUFFS[id]!.name}: ${BUFFS[id]!.tip}`}
            className={`grid h-[32px] min-w-[64px] place-items-center rounded border px-1 font-bold ${
              isCurse(id)
                ? 'border-[#8a1610] bg-[#ffe3dc] text-[#8a1610]'
                : 'border-[#1b6e17] bg-[#e3f7dc] text-[#1b6e17]'
            }`}
          >
            {BUFFS[id]!.tile}
          </span>
        ))}
      </div>
      {rules.map((rule) => (
        <p key={rule}>{rule}</p>
      ))}
    </section>
  )
}

function ActiveEffects({ buffs }: { buffs: { buffId: number; expiresAt: string | null }[] }) {
  if (buffs.length === 0) return null
  return (
    <ul aria-label="Fate effects">
      {buffs.map((buff) => (
        <li key={buff.buffId}>
          Active: {BUFFS[buff.buffId]?.name ?? 'Fate effect'}
          {buff.expiresAt
            ? ` until ${new Date(buff.expiresAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`
            : ''}
        </li>
      ))}
    </ul>
  )
}

/** Each die appears 160 ms after the previous one, tumbles every 60 ms and settles 320 ms later. */
const APPEAR_MS = 160
const TUMBLE_MS = 60
const SETTLE_MS = 320
/** Dice sit on a circle of radius 66 around (111, 114.5) of the 240x280 stage. */
const RADIUS = 66
const CENTRE = { x: 111, y: 114.5 }
const DIE = 37

function CleromancyWindow({
  roll,
  casting,
  log,
  onClose,
}: {
  roll: Roll | null
  casting: boolean
  log: Roll[]
  onClose: () => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const count = roll?.dice.length ?? 0
  const total = APPEAR_MS * Math.max(0, count - 1) + SETTLE_MS
  useEffect(() => {
    if (!roll) return
    const startedAt = Date.now()
    const timer = setInterval(() => {
      const now = Date.now() - startedAt
      setElapsed(now)
      if (now >= total) clearInterval(timer)
    }, TUMBLE_MS)
    return () => clearInterval(timer)
  }, [roll, total])
  return (
    <Dialog title="Cleromancy" onClose={onClose} className="game-window-bare w-[240px]">
      <div className="relative h-[350px] w-[230px] font-game text-xs">
        <div className="relative h-[280px] w-[230px]">
          <div className="absolute top-[3.5px] left-0 size-[222px] rounded-full border-[6px] border-[#8b5a2b] bg-[radial-gradient(circle,#f3df8e_0%,#c08030_70%,#5c3a12_100%)]" />
          <div className="absolute top-[25px] left-[20.5px] size-[181px] rounded-full border-2 border-[#5c3a12]/60" />
          {roll?.dice.map((face, i) => {
            if (elapsed < APPEAR_MS * i) return null
            const settled = elapsed >= APPEAR_MS * i + SETTLE_MS
            const angle = (2 * Math.PI * i) / count - Math.PI / 2
            const shown = settled ? face : ((Math.floor(elapsed / TUMBLE_MS) + i) % 6) + 1
            return (
              <span
                key={i}
                aria-label={settled ? `Die ${face}` : 'Rolling die'}
                className="absolute grid place-items-center rounded-md border-2 border-black bg-white text-lg font-bold text-black"
                style={{
                  width: DIE,
                  height: DIE,
                  left: CENTRE.x + RADIUS * Math.cos(angle) - DIE / 2,
                  top: CENTRE.y + RADIUS * Math.sin(angle) - DIE / 2,
                }}
              >
                {shown}
              </span>
            )
          })}
          {!roll && (
            <p className="absolute inset-x-0 top-[105px] text-center font-bold text-white [text-shadow:0_0_2px_#000]">
              {casting ? 'The dice are cast...' : 'Roll the dice to tempt fate!'}
            </p>
          )}
        </div>
        <LogBox log={log} />
      </div>
    </Dialog>
  )
}

function LogBox({ log }: { log: Roll[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [log])
  return (
    <div
      ref={box}
      role="log"
      aria-label="Cleromancy results"
      className="game-value-box absolute top-[270px] left-[5px] h-[70px] w-[220px] overflow-y-auto p-1 text-[10px]"
    >
      {log.map((entry, i) => (
        <div key={i}>
          <p>
            Results are {entry.dice.join(', ')} totaling {entry.dice.reduce((a, b) => a + b, 0)}{' '}
            points.
          </p>
          <p>{outcome(entry.buffId)}</p>
        </div>
      ))}
    </div>
  )
}
