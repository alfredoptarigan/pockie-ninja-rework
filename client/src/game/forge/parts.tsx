// Small pieces Reborn's forge, compose and wing windows share: a window opened inside another
// window (payment prompts, Enhancement Result, Submit Wing), a tab strip that can show tabs we
// have no system for, and the Gold / Coupons / Talisman payment prompt.
import type { Character, ForgePayment } from '@pockie/shared'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { GameButton } from '../skin'

/**
 * A titled window inside an open game window, so it stays in that window's modal top layer.
 * Escape closes only this one.
 */
export function SubWindow({
  title,
  width,
  top = 60,
  onClose,
  children,
}: {
  title: string
  width: number
  top?: number
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus()
  }, [])
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={id}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      className="game-frame absolute left-1/2 z-[55] -translate-x-1/2 px-2 pt-1 pb-2 font-game text-xs text-black"
      style={{ width, top }}
    >
      <div className="game-frame-title mb-1">
        <h3 id={id} className="game-title-tag inline-block">
          {title}
        </h3>
      </div>
      <div className="game-inset space-y-2 p-2">{children}</div>
    </div>
  )
}

export interface TabSpec<T extends string> {
  id: T
  title: string
  /** No system behind it yet: shown greyed with "<Tab>: not available yet". */
  disabled?: boolean
}

/** Reborn's tab control; tabs we cannot offer stay visible but disabled. */
export function TabStrip<T extends string>({
  label,
  panelId,
  tabs,
  active,
  onChange,
}: {
  label: string
  panelId: string
  tabs: TabSpec<T>[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          aria-controls={panelId}
          disabled={tab.disabled}
          title={tab.disabled ? `${tab.title}: not available yet` : undefined}
          onClick={() => onChange(tab.id)}
          className="game-tab h-[22px] px-[5px] font-game text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tab.title}
        </button>
      ))}
    </div>
  )
}

export interface PayOption {
  id: ForgePayment
  label: string
  affordable: boolean
}

/** The three payments with their labels; each affordable from the purse or the talisman count. */
export function payOptions(
  character: Character | null | undefined,
  cost: number,
  talismans: number,
  labels: Record<ForgePayment, string>,
): PayOption[] {
  const owned = { gold: character?.gold ?? 0, giftCoupon: character?.giftCoupon ?? 0 }
  return (['gold', 'giftCoupon', 'talisman'] as const).map((id) => ({
    id,
    label: labels[id],
    affordable: id === 'talisman' ? talismans > 0 : owned[id] >= cost,
  }))
}

/** Reborn's default: a talisman if owned, else Coupons if affordable, else Gold. */
export const defaultPayment = (options: PayOption[]): ForgePayment =>
  (['talisman', 'giftCoupon'] as const).find(
    (id) => options.find((option) => option.id === id)?.affordable,
  ) ?? 'gold'

/** The payment radios; options the player cannot afford are greyed out. */
export function PayRadios({
  options,
  value,
  onChange,
}: {
  options: PayOption[]
  value: ForgePayment
  onChange: (payment: ForgePayment) => void
}) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-1">
      {options.map((option) => (
        <label
          key={option.id}
          className={`flex items-center gap-1 ${option.affordable ? '' : 'opacity-50'}`}
        >
          <input
            type="radio"
            name={name}
            disabled={!option.affordable}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  )
}

/** Enhancement / Refinement: pick Gold, Coupons or a talisman, then OK. */
export function PaymentDialog({
  title,
  text,
  options,
  busy,
  onPay,
  onClose,
}: {
  title: string
  text: string
  options: PayOption[]
  busy: boolean
  onPay: (payment: ForgePayment) => void
  onClose: () => void
}) {
  const [payment, setPayment] = useState(() => defaultPayment(options))
  const chosen = options.find((option) => option.id === payment)
  return (
    <SubWindow title={title} width={280} onClose={onClose}>
      <p>{text}</p>
      <PayRadios options={options} value={payment} onChange={setPayment} />
      <p className="text-[11px]">Paying with Coupons binds the item.</p>
      <div className="flex justify-center gap-2">
        <GameButton small disabled={busy || !chosen?.affordable} onClick={() => onPay(payment)}>
          OK
        </GameButton>
        <GameButton small onClick={onClose}>
          Cancel
        </GameButton>
      </div>
    </SubWindow>
  )
}
