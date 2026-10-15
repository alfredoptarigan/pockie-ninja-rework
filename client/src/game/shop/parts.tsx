// Pieces of Reborn's NPC shop windows (reborn-windows-A-L.md "Dungeon Shop", "Festival Shop"):
// the TextBG1 balance box, 105x190 item cards and the eight-per-page grid with its pager.
import type { BagItemInfo, Character } from '@pockie/shared'
import { useEffect, useState, type ReactNode } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { ItemTooltip } from '../ItemTooltip'
import { asInventoryItem, Pager } from '../market/parts'
import { GameButton } from '../skin'
import { showToast } from '../toast'
import type { Currency } from './api'

/** Reborn's shop grids show eight cards a page. */
export const PAGE_SIZE = 8

export const currencyName = (currency: Currency) =>
  ({ stone: 'Stone', gold: 'Gold', giftCoupon: 'Gift Coupons' })[currency]

export const priceText = (prices: Partial<Record<Currency, number>>) =>
  (Object.entries(prices) as [Currency, number][])
    .filter(([, value]) => value > 0)
    .map(([currency, value]) => `${value.toLocaleString('en-US')} ${currencyName(currency)}`)
    .join(', ') || 'Free'

/** The money a window spends, top right in TextBG1 boxes. */
export function Balance({
  character,
  currencies,
}: {
  character: Character
  currencies: Currency[]
}) {
  return (
    <div role="group" aria-label="Balance" className="flex gap-[4px]">
      {currencies.map((currency) => (
        <span
          key={currency}
          className="game-text-box h-[18px] min-w-[90px] px-[6px] text-center text-[11px] leading-[16px] whitespace-nowrap"
        >
          {character[currency].toLocaleString('en-US')} {currencyName(currency)}
        </span>
      ))}
    </div>
  )
}

/**
 * One 105x190 item card: name, icon, price lines and the 70x22 button. With `info` the icon shows
 * the item tooltip on hover (no compare), as Reborn's Dungeon and Festival shops do.
 */
export function ShopCard({
  itemId,
  count,
  info,
  lines,
  button,
  buttonLabel,
  disabled,
  onClick,
}: {
  itemId: string
  count?: number
  info?: BagItemInfo
  lines: ReactNode
  button: string
  buttonLabel: string
  disabled: boolean
  onClick: () => void
}) {
  const name = itemName(itemId)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  return (
    <li
      aria-label={name}
      className="game-text-box flex h-[190px] w-[105px] flex-col items-center gap-[4px] px-[4px] py-[6px] text-center text-[11px] leading-[13px]"
    >
      <span className="line-clamp-2 h-[26px] font-bold">{name}</span>
      <span
        className="contents"
        onMouseEnter={(event) => info && setTip({ x: event.clientX + 12, y: event.clientY + 12 })}
        onMouseLeave={() => setTip(null)}
      >
        <ItemIcon itemId={itemId} name={name} className="size-[50px]">
          {count !== undefined && count > 1 && (
            <span className="absolute right-[2px] bottom-0 text-[10px] font-bold text-white [text-shadow:var(--shadow-game-text)]">
              x{count}
            </span>
          )}
        </ItemIcon>
      </span>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-[2px]">{lines}</div>
      <GameButton
        small
        aria-label={buttonLabel}
        disabled={disabled}
        onClick={onClick}
        className="h-[22px] w-[70px] min-w-0 shrink-0 px-0"
      >
        {button}
      </GameButton>
      {info && tip && (
        <ItemTooltip
          entry={{ item: asInventoryItem({ itemId, count: count ?? 1, bound: false, info }) }}
          at={tip}
        />
      )}
    </li>
  )
}

/** Cards eight to a page (4x2) with the pager under them when there is more than one page. */
export function CardGrid<T>({
  label,
  items,
  empty,
  card,
}: {
  label: string
  items: T[]
  empty: string
  card: (item: T) => ReactNode
}) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const shown = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  return (
    <div className="flex h-[412px] flex-col gap-[4px]">
      <ul
        aria-label={label}
        className="grid h-[390px] grid-cols-[repeat(4,105px)] content-start justify-center gap-[10px]"
      >
        {shown.map(card)}
      </ul>
      {items.length === 0 && <p className="text-center">{empty}</p>}
      {pages > 1 && <Pager page={current} pages={pages} onPage={setPage} />}
    </div>
  )
}

/** A clamped whole-number quantity field for the confirm prompts. */
export function QuantityField({
  value,
  max,
  onChange,
}: {
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-[8px]">
      <label className="flex items-center gap-[4px]">
        Quantity
        <input
          type="number"
          min={1}
          max={max}
          value={Number.isNaN(value) ? '' : value}
          onChange={(event) => onChange(event.target.valueAsNumber)}
          className="game-field h-[20px] w-[60px] px-1 text-black"
        />
      </label>
      <span>Maximum: {max}</span>
    </div>
  )
}

export const validCount = (value: number, max: number) =>
  Number.isInteger(value) && value >= 1 && value <= max

/** Seconds and "HH:MM:SS" until `end`, ticking every second. */
export function useCountdown(end: string | undefined) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = end ? Math.max(0, Math.ceil((Date.parse(end) - now) / 1000)) : 0
  return {
    seconds,
    text: [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':'),
  }
}

/** Runs a shop request; Reborn reports the result as a toast (success or failure). */
export async function withToast(request: Promise<unknown>, success: string) {
  try {
    await request
    showToast(success, 'success')
    return true
  } catch (error) {
    showToast(errorMessage(error), 'failure')
    return false
  }
}
