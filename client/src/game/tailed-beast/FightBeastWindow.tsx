// Reborn's "Fight {name}" (reborn-windows-A-L.md, `kn`): a 460x334 window with three difficulty
// cards (coloured header, portrait, "Lv N", Fight strip), Auto Fight and a footer line. Ours adds
// each pool's shared HP and its ticket cost (1 / 3 / 5; Reborn charges 1 per fight).
import type { CSSProperties } from 'react'
import type { TailedBeastPool } from '../../../../shared/src/schemas/tailed-beast'
import { Dialog, GameButton, Notice } from '../skin'
import { number } from './api'
import { BeastPortrait } from './BeastPortrait'

const MODES = [
  { name: 'Normal', color: '#5fdc6a' },
  { name: 'Hard', color: '#ffb84d' },
  { name: 'Rampage', color: '#ff5e5e' },
]
const AUTO_TIP =
  'Keep fighting this beast at the chosen difficulty until you stop it, run out of tickets, or the beast is defeated.'
const tickets = (count: number) => `${count} ${count === 1 ? 'ticket' : 'tickets'}`

export function FightBeastWindow({
  beast,
  name,
  pools,
  ticketsLeft,
  busy,
  error,
  auto,
  onAuto,
  onFight,
  onClose,
}: {
  beast: number
  name: string
  pools: TailedBeastPool[]
  ticketsLeft: number
  busy: boolean
  error: string | null
  auto: boolean
  onAuto: (auto: boolean) => void
  onFight: (mode: number) => void
  onClose: () => void
}) {
  return (
    <Dialog title={`Fight ${name}`} onClose={onClose} className="game-window-bare w-[460px]">
      <div className="game-panel-1 p-[5px] font-game text-xs">
        <div className="flex h-[298px] flex-col items-center gap-[6px] rounded bg-[#1e1a16] p-2 text-white">
          <p className="w-full border-b border-[#d4a017] pb-1 text-center font-bold text-[#ffd76a]">
            Choose your difficulty level:
          </p>
          <div className="flex gap-2">
            {pools.map((pool) => (
              <ModeCard
                key={pool.mode}
                beast={beast}
                name={name}
                pool={pool}
                disabled={busy || pool.hpLeft === 0 || pool.ticketCost > ticketsLeft}
                onFight={() => onFight(pool.mode)}
              />
            ))}
          </div>
          <label className="flex items-center gap-1" title={AUTO_TIP}>
            <input
              type="checkbox"
              checked={auto}
              onChange={(event) => onAuto(event.target.checked)}
            />
            Auto Fight
          </label>
          <p className="text-[11px] italic">
            {pools.map((p) => `${MODES[p.mode]!.name} ${tickets(p.ticketCost)}`).join(', ')} per
            fight. Damage dealt determines your Honor.
          </p>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Dialog>
  )
}

function ModeCard({
  beast,
  name,
  pool,
  disabled,
  onFight,
}: {
  beast: number
  name: string
  pool: TailedBeastPool
  disabled: boolean
  onFight: () => void
}) {
  const mode = MODES[pool.mode]!
  const percent = Math.round((pool.hpLeft / pool.maxHp) * 100)
  return (
    <section
      role="group"
      aria-label={mode.name}
      className="flex h-[200px] w-[130px] flex-col items-center overflow-hidden rounded border-2 bg-black/40"
      style={{ borderColor: mode.color }}
    >
      <h3
        className="w-full py-[2px] text-center font-bold text-black"
        style={{ background: mode.color }}
      >
        {mode.name}
      </h3>
      <div className="relative mt-1 grid size-[84px] place-items-center">
        <BeastPortrait beast={beast} name={`${name} (${mode.name})`} size={84} />
        <span className="absolute right-0 bottom-0 rounded bg-black/80 px-1 text-[10px] font-bold">
          Lv {pool.level}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${mode.name} HP`}
        aria-valuemin={0}
        aria-valuemax={pool.maxHp}
        aria-valuenow={pool.hpLeft}
        aria-valuetext={`${number(pool.hpLeft)} / ${number(pool.maxHp)}`}
        className="game-progress mt-1 h-[8px] w-[110px]"
        style={{ '--fill': `${percent}%` } as CSSProperties}
      />
      <span className="mt-[2px] h-[28px] px-1 text-center text-[10px] leading-[14px]">
        {pool.hpLeft === 0
          ? `Defeated${pool.killedBy ? ` by ${pool.killedBy}` : ''}.`
          : `${percent}% HP left`}
      </span>
      <GameButton
        className="mt-auto h-[24px] w-full !rounded-none"
        disabled={disabled}
        onClick={onFight}
      >
        Fight ({tickets(pool.ticketCost)})
      </GameButton>
    </section>
  )
}
