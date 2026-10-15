// The Shichibukai run board (Reborn's `uw`, 1000x482): the 700x470 floor island with the tile
// track (Reborn's grid: 35px tiles 37px apart, scaled to fit 630x345, from x 35 / y 105), the
// event icons on unvisited tiles, the boss pose on its tile and the ninja token; the side panel
// with HP / MP, Score, Cleared, Rolls and the run buttons.
import {
  DIFFICULTY_NAMES,
  TILE_EVENTS,
  type ShichibukaiCell,
  type ShichibukaiRunView,
  type TileEvent,
} from '../../../../shared/src/schemas/shichibukai'
import { poseUrl } from '../dungeons'
import { GameButton } from '../skin'

const ART = '/assets/reborn/features/shichibukai'
export const shichiArt = (name: string) => `${ART}/${name}.webp`
const WIDTH = 700
const HEIGHT = 470
const TILE = 35
const GAP = 37

/** Reborn's perk icon per tile event (H_ table). */
const EVENT_ICON: Partial<Record<TileEvent, string>> = {
  1: 'perk6',
  2: 'perk7',
  3: 'perk1',
  4: 'perk2',
  5: 'perk9',
  6: 'perk5',
  7: 'perk3',
  8: 'perk8',
}

const laneStep = (tag: string) => {
  const [lane, step] = tag.split('-').map(Number)
  return { lane: lane || 1, step: step || 1 }
}

/** Tile centres (bottom-centre anchor like Reborn) and the scaled tile size. */
export function layout(cells: ShichibukaiCell[]) {
  const parsed = cells.map((cell) => ({ cell, ...laneStep(cell.tag) }))
  const width = GAP * (Math.max(...parsed.map((p) => p.step)) - 1) + TILE
  const height = GAP * (Math.max(...parsed.map((p) => p.lane)) - 1) + TILE
  const scale = Math.min(1, 630 / width, 345 / height)
  const size = TILE * scale
  const step = GAP * scale
  const at = new Map(
    parsed.map((p) => [
      p.cell.index,
      { x: 35 + (p.step - 1) * step + size / 2, y: 105 + (p.lane - 1) * step + size },
    ]),
  )
  return { at, size }
}

export function Board({
  run,
  busy,
  rollsBlocked,
  onRoll,
  onBuyDice,
  onSaveExit,
  onGiveUp,
}: {
  run: ShichibukaiRunView
  busy: boolean
  /** A card, the boss or no rolls stops the dice. */
  rollsBlocked: boolean
  onRoll: () => void
  onBuyDice: () => void
  onSaveExit: () => void
  onGiveUp: () => void
}) {
  const { at, size } = layout(run.board.cells)
  const visited = new Set(run.visited)
  const token = at.get(run.pos)!
  const boss = at.get(run.board.bossIndex)!
  const difficulty = DIFFICULTY_NAMES[run.difficulty - 1] ?? String(run.difficulty)
  const canRoll = !busy && !rollsBlocked && run.rollsLeft > 0
  return (
    <div className="flex gap-[6px] font-game text-[12px]">
      <div
        aria-label="Expedition board"
        role="img"
        className="relative shrink-0 overflow-hidden"
        style={{
          width: WIDTH,
          height: HEIGHT,
          background: `url(${shichiArt(`island${run.floor}`)}) center / cover`,
        }}
      >
        <div className="absolute inset-0 bg-black/25" />
        <svg className="absolute inset-0" width={WIDTH} height={HEIGHT} aria-hidden="true">
          {run.board.edges.map(([from, to]) => {
            const a = at.get(from)!
            const b = at.get(to)!
            const on = visited.has(from) && visited.has(to)
            return (
              <line
                key={`${from}-${to}`}
                x1={a.x}
                y1={a.y - size / 2}
                x2={b.x}
                y2={b.y - size / 2}
                stroke={on ? '#ffe27a' : 'rgba(255,255,255,.45)'}
                strokeWidth={on ? 3 : 2}
              />
            )
          })}
        </svg>
        {run.board.cells.map((cell) => {
          const p = at.get(cell.index)!
          const icon = !visited.has(cell.index) ? EVENT_ICON[cell.event] : undefined
          return (
            <span
              key={cell.index}
              title={`${cell.tag} · ${TILE_EVENTS[cell.event]}`}
              className={`absolute grid place-items-center rounded-[4px] border ${
                visited.has(cell.index)
                  ? 'border-[#ffe27a] bg-[#7a5a1a]/80'
                  : 'border-white/60 bg-[#1b3550]/80'
              }`}
              style={{ left: p.x - size / 2, top: p.y - size, width: size, height: size }}
            >
              {icon && <img src={shichiArt(icon)} alt="" className="size-[85%]" />}
            </span>
          )
        })}
        <img
          src={poseUrl(run.boss.pose)}
          alt={run.boss.name}
          className="absolute -scale-x-100"
          style={{
            left: boss.x - 0.8 * size,
            top: boss.y - 2.35 * size,
            width: 1.6 * size,
            height: 2.4 * size,
            objectFit: 'contain',
          }}
        />
        <span
          aria-label="Your ninja"
          className="absolute grid place-items-center rounded-full border-2 border-white bg-[#e0892c] text-[10px] font-black text-white shadow"
          style={{
            left: token.x - size / 3,
            top: token.y - size * 1.2,
            width: size / 1.5,
            height: size / 1.5,
          }}
        >
          You
        </span>
      </div>
      <section
        aria-label="Expedition status"
        className="game-panel-1 flex w-[280px] flex-col gap-[8px] p-[10px] text-black"
      >
        <h3 className="text-center text-[15px] font-bold">Sea of Fallen Waters</h3>
        <p className="text-center">
          Floor {run.floor} · {difficulty}
        </p>
        <Meter label="HP" value={run.hpPct} color="#d23a3a" />
        <Meter label="MP" value={run.mpPct} color="#3a7ad2" />
        <dl className="grid grid-cols-[80px_1fr] gap-[6px]">
          <dt>Score</dt>
          <dd className="font-bold">{run.runPoints.toLocaleString('en-US')}</dd>
          <dt>Cleared</dt>
          <dd className="font-bold">{run.bossesKilled}</dd>
          <dt>Rolls</dt>
          <dd className="font-bold">{run.rollsLeft}</dd>
        </dl>
        <GameButton className="h-[30px]" disabled={!canRoll} onClick={onRoll}>
          {run.atBoss
            ? 'Fight Boss'
            : run.card
              ? 'Open Cards'
              : run.rollsLeft > 0
                ? 'Roll Dice'
                : 'No Rolls'}
        </GameButton>
        <GameButton disabled={!canRoll} onClick={onBuyDice}>
          Buy Dice
        </GameButton>
        <div className="flex gap-[6px]">
          <GameButton className="flex-1" disabled={busy} onClick={onSaveExit}>
            Save &amp; Exit
          </GameButton>
          <GameButton className="flex-1" disabled={busy || Boolean(run.card)} onClick={onGiveUp}>
            Give Up
          </GameButton>
        </div>
      </section>
    </div>
  )
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative h-[16px] rounded bg-black/30"
    >
      <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      <span className="absolute inset-0 text-center text-[11px] font-bold text-white">
        {label} {Math.round(pct)}%
      </span>
    </div>
  )
}
