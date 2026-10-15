// Impel Down's status panel (Reborn chunk 286 #10759): title, current gate and floor, lives, the
// floor's rewards with a tooltip per crystal, Auto Sell, Auto and Refresh; and the Info window.
import { useState } from 'react'
import {
  crystalInfo,
  TIER_COLORS,
  type CrystalInfo,
} from '../../../../game-core/src/zanpakuto/zanpakuto'
import type { ImpelDownView } from '../../../../shared/src/schemas/impel-down'
import { Dialog, GameButton } from '../skin'

const TIER_NAMES = ['Blue', 'Purple', 'Orange']
const TAB_NAMES = { sharp: 'Sharp', blunt: 'Blunt', fist: 'Fist' } as const
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
export const AUTO_SELL_OPTIONS = [
  { value: 1, label: 'Blue crystal' },
  { value: 2, label: 'Purple crystal' },
  { value: 3, label: 'Orange crystal' },
]
const iconUrl = (info: CrystalInfo) => `/assets/reborn/icons/items/${info.icon}.webp`

const Label = ({ top, children }: { top: number; children: string }) => (
  <span className="absolute left-[10px] font-bold" style={{ top }}>
    {children}
  </span>
)

export function StatusPanel({
  view,
  autoSell,
  onAutoSell,
  auto,
  autoLabel,
  autoDisabled,
  onAuto,
  refreshDisabled,
  onRefresh,
}: {
  view: ImpelDownView
  /** 0 off, else the highest tier sold (1 Blue .. 3 Orange). */
  autoSell: number
  onAutoSell: (tier: number) => void
  auto: boolean
  autoLabel: string
  autoDisabled: boolean
  onAuto: () => void
  refreshDisabled: boolean
  onRefresh: () => void
}) {
  // The select keeps its tier while the checkbox is off (Reborn's default: Blue).
  const [tier, setTier] = useState(autoSell || 1)
  const current = view.intersection
    ? `Gate ${view.gate + 1}, Next Gate`
    : `Gate ${view.gate + 1}, Floor ${view.floor + 1}`
  return (
    <section
      aria-label="Impel Down status"
      className="game-inset relative h-[385px] w-[240px] shrink-0 p-[2px] font-game"
    >
      <h3 className="absolute inset-x-0 top-[3px] text-center text-[26px] text-[#000000aa]">
        Impel Down
      </h3>
      <p className="absolute top-[33px] left-[2px] text-[30px]">Freezing Hell</p>
      <Label top={100}>Current</Label>
      <p
        aria-label="Current"
        className="game-value-box absolute top-[94px] left-[80px] h-[25px] w-[150px] p-[5px] leading-[15px]"
      >
        {current}
      </p>
      <Label top={130}>Lives</Label>
      <p
        aria-label="Lives"
        className="game-value-box absolute top-[124px] left-[80px] h-[25px] w-[150px] p-[5px] leading-[15px]"
      >
        {view.lives}
      </p>
      <Label top={160}>Rewards</Label>
      <div
        aria-label="Rewards"
        role="region"
        className="game-value-box absolute top-[154px] left-[80px] h-[125px] w-[150px] p-[5px]"
      >
        {!view.intersection && <Rewards view={view} />}
      </div>
      <div className="absolute top-[290px] left-[11px] h-[30px] w-[200px]">
        <input
          id="impel-auto-sell"
          type="checkbox"
          className="absolute top-[5px] left-0"
          checked={autoSell > 0}
          disabled={auto}
          onChange={(event) => onAutoSell(event.target.checked ? tier : 0)}
        />
        <label
          htmlFor="impel-auto-sell"
          className="absolute top-[6px] left-[25px] w-[70px] font-bold"
        >
          Auto Sell
        </label>
        <select
          aria-label="Auto Sell tier"
          className="absolute top-[5px] left-[100px] h-[20px] w-[120px] text-[12px]"
          value={tier}
          disabled={auto}
          onChange={(event) => {
            const next = Number(event.target.value)
            setTier(next)
            if (autoSell > 0) onAutoSell(next)
          }}
        >
          {AUTO_SELL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <GameButton
        className="!absolute top-[340px] left-[30px] h-[25px] w-[75px]"
        aria-pressed={auto}
        disabled={autoDisabled}
        onClick={onAuto}
      >
        {autoLabel}
      </GameButton>
      <GameButton
        className="!absolute top-[340px] left-[130px] h-[25px] w-[75px]"
        disabled={refreshDisabled}
        onClick={onRefresh}
      >
        Refresh
      </GameButton>
    </section>
  )
}

/** EXP, then one row per crystal (name in its tier colour, chance) with a hover tooltip (opening
 * to the left: Reborn opens it to the right, which our window clips). */
function Rewards({ view }: { view: ImpelDownView }) {
  const [hovered, setHovered] = useState<number | null>(null)
  return (
    <div className="h-[115px] w-[140px] text-[11px]">
      <p className="font-bold text-[#ffcc00] [text-shadow:1px_1px_1px_#000]">
        EXP: {view.exp.toLocaleString('en-US')}
      </p>
      <ul aria-label="Crystal drops" className="mt-1 border-t border-[#0000004d] pt-1">
        {view.drops.length === 0 && (
          <li className="text-[10px] italic">No crystal drops this floor</li>
        )}
        {view.drops.map(([iid, chance]) => {
          const info = crystalInfo(iid)
          if (!info) return null
          return (
            <li
              key={iid}
              tabIndex={0}
              className="relative flex justify-between text-[10px]"
              onMouseEnter={() => setHovered(iid)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(iid)}
              onBlur={() => setHovered(null)}
            >
              <span className="max-w-[95px] truncate" style={{ color: TIER_COLORS[info.category] }}>
                {info.name}
              </span>
              <span>{chance}%</span>
              {hovered === iid && <CrystalTooltip info={info} chance={chance} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function CrystalTooltip({ info, chance }: { info: CrystalInfo; chance: number }) {
  const color = TIER_COLORS[info.category]
  return (
    <div
      role="tooltip"
      className="absolute top-0 right-[calc(100%+10px)] z-30 min-w-[160px] border border-[#444] bg-linear-to-b from-[#1a1a2e] to-[#16213e] p-2 text-[11px] text-white"
    >
      <div className="flex items-center gap-2">
        <img src={iconUrl(info)} alt="" className="size-8" />
        <div>
          <p className="text-[12px] font-bold" style={{ color }}>
            {info.name}
          </p>
          <p>
            {TIER_NAMES[info.category]} Crystal · {TAB_NAMES[info.tab]}
          </p>
        </div>
      </div>
      <p className="mt-1 text-[#ffcc00]">Drop chance: {chance}%</p>
      <p>Tier: {ROMAN[info.position - 1]}</p>
      <p className="italic">Stats are randomized on drop</p>
    </div>
  )
}

/** Reborn's "Impel Down - Info" text, with our 00:00 UTC reset. */
export function ImpelDownInfo({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Impel Down - Info" onClose={onClose} className="w-[440px]">
      <div className="game-panel-1 flex flex-col gap-1 p-[10px] text-[13px] leading-[1.6] text-black">
        <h3 className="text-[15px] font-bold">Impel Down</h3>
        <p>Battle through 6 Gates, each with 25 floors of increasingly powerful enemies.</p>
        <p>
          <b>Lives:</b> You get 3 attempts per day. Losing a fight costs 1 life.
        </p>
        <p>
          <b>Rewards:</b> Defeating enemies drops{' '}
          <span className="text-[#00aeff]">Zanpakuto Crystals</span> that go to your Spirit
          Inventory.
        </p>
        <p>
          <b>Gates:</b> Each gate requires a higher level (Gate 1: Lv61, Gate 2: Lv71, ... Gate 6:
          Lv111).
        </p>
        <p>
          <b>Intersection:</b> After clearing floor 25, choose to advance to the next gate or
          refresh to farm again.
        </p>
        <p>
          <b>Refresh:</b> Costs coupons and restarts you at floor 1 of the current gate.
        </p>
        <p>
          <b>Auto Fight:</b> Automatically fights the next floor after a cooldown. Stops if you lose
          a life.
        </p>
        <p>
          <b>Auto Sell:</b> Automatically sells crystals below the selected tier for Spirit Coins.
        </p>
        <p>Lives and refreshes reset at midnight UTC.</p>
      </div>
    </Dialog>
  )
}
