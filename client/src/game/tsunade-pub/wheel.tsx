// Tsunade Pub wheel (Reborn chunk 221): 16 slots of 54x54 around a 286x286 square, clockwise from
// the top left, and the 54x54 centre box that shows "?" until a prize lands.
import type { PubPrizeView, PubRarity } from '../../../../shared/src/schemas/tsunade-pub'
import { ItemPicture } from '../inventory/BagGrid'
import { itemName } from '../inventory/outfits'
import { asInventoryItem } from '../market/parts'

export const SLOT = 54
const STEP = 58
const SIDE = 4
export const WHEEL = 286

/** Reborn's rarity frames: border and glow colours (a missing rarity is common). */
export const RARITY: Record<PubRarity, { border: string; glow: string }> = {
  common: { border: '#888888', glow: 'rgba(136,136,136,.5)' },
  uncommon: { border: '#00cc00', glow: 'rgba(0,204,0,.6)' },
  rare: { border: '#0066cc', glow: 'rgba(0,102,204,.6)' },
  epic: { border: '#9933cc', glow: 'rgba(153,51,204,.6)' },
  legendary: { border: '#cc0000', glow: 'rgba(204,0,0,.7)' },
}

/** Slot i's top-left: along the top, down the right, back along the bottom, up the left. */
export function slotPosition(i: number) {
  if (i <= SIDE) return { left: STEP * i, top: 0 }
  if (i <= 2 * SIDE) return { left: STEP * SIDE, top: STEP * (i - SIDE) }
  if (i <= 3 * SIDE) return { left: STEP * (3 * SIDE - i), top: STEP * SIDE }
  return { left: 0, top: STEP * (4 * SIDE - i) }
}

export const prizeName = (prize: PubPrizeView) =>
  `${itemName(asInventoryItem({ ...prize, count: prize.amount, bound: prize.bound ?? true }))}${
    prize.amount > 1 ? ` x${prize.amount}` : ''
  }`

/** A prize picture on Reborn's tan slot with its rarity frame and "x{amount}". */
export function PrizeTile({
  prize,
  highlighted = false,
}: {
  prize: PubPrizeView
  highlighted?: boolean
}) {
  const rarity = RARITY[prize.rarity] ?? RARITY.common
  const pulse = prize.rarity === 'epic' || prize.rarity === 'legendary'
  return (
    <span
      className={`relative grid size-full place-items-center rounded-[4px] bg-linear-to-b from-[#d4c8a8] to-[#a89878] ${pulse ? 'animate-pulse' : ''}`}
      style={{
        border: highlighted ? '3px solid #ffdd00' : `2px solid ${rarity.border}`,
        boxShadow: `0 0 6px ${rarity.glow}`,
      }}
    >
      <span className="size-[48px] max-h-[90%] max-w-[90%]">
        <ItemPicture
          item={asInventoryItem({ ...prize, count: prize.amount, bound: prize.bound ?? true })}
          decorative
        />
      </span>
      {prize.amount > 1 && (
        <span className="absolute right-[2px] bottom-0 text-[8px] font-bold text-white [text-shadow:1px_1px_1px_#000]">
          x{prize.amount}
        </span>
      )}
    </span>
  )
}

export function Wheel({
  board,
  highlight,
  center,
  onTip,
}: {
  board: PubPrizeView[]
  highlight: number | null
  center: PubPrizeView | null
  onTip: (prize: PubPrizeView | null, at?: { x: number; y: number }) => void
}) {
  return (
    <div className="relative mx-auto" style={{ width: WHEEL, height: WHEEL }}>
      <ol aria-label="Prize roulette">
        {board.map((prize, i) => (
          <li
            key={i}
            aria-label={`Slot ${i + 1}: ${prizeName(prize)}`}
            aria-current={highlight === i || undefined}
            className="absolute"
            style={{ ...slotPosition(i), width: SLOT, height: SLOT }}
            onPointerMove={(event) =>
              onTip(prize, { x: event.clientX + 12, y: event.clientY + 12 })
            }
            onPointerLeave={() => onTip(null)}
          >
            <PrizeTile prize={prize} highlighted={highlight === i} />
          </li>
        ))}
      </ol>
      <div
        role="status"
        aria-label={center ? `Prize: ${prizeName(center)}` : 'Prize: none yet'}
        className="absolute grid place-items-center rounded-[4px] border-2 border-[#c4a870] bg-[#2a2a2a] text-[24px] font-bold text-[#ffd700]"
        style={{ left: STEP * 2, top: STEP * 2, width: SLOT, height: SLOT }}
      >
        {center ? <PrizeTile prize={center} /> : '?'}
      </div>
    </div>
  )
}
