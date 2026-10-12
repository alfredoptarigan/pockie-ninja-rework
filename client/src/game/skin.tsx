// Redrawn 2011 in-game skin: wood frames with gold trim, parchment insets, ember buttons.
// Utilities live in index.css (game-frame, game-inset, game-button).
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from 'react'

export function Panel({
  title,
  className = '',
  actions,
  children,
}: {
  title: string
  className?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={`game-frame flex flex-col p-2 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
        <h2 id={id} className="font-game text-sm font-bold tracking-wide text-trim-soft">
          {title}
        </h2>
        {actions}
      </div>
      <div className="game-inset min-h-0 flex-1 overflow-auto p-3 text-sm">{children}</div>
    </section>
  )
}

export function GameButton({
  className = '',
  small = false,
  ...props
}: ComponentProps<'button'> & { small?: boolean }) {
  return (
    <button
      type="button"
      className={`game-button inline-flex items-center justify-center gap-1 font-game transition-[filter] hover:brightness-110 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-trim active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale ${
        small ? 'min-h-8 px-2.5 text-xs' : 'min-h-10 px-4 text-sm'
      } ${className}`}
      {...props}
    />
  )
}

/** HP, MP and EXP bars. */
export function Bar({
  label,
  value,
  max,
  color,
}: {
  label: string
  value: number
  max: number
  color: string
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2 font-game text-xs">
      <span className="w-8 font-bold text-trim-soft">{label}</span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} / ${max}`}
        className="relative h-4 flex-1 overflow-hidden rounded-sm border border-wood-deep bg-wood-deep"
      >
        <div className="h-full" style={{ width: `${percent}%`, background: color }} />
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white [text-shadow:0_1px_1px_#000]">
          {value} / {max}
        </span>
      </div>
    </div>
  )
}

export function Tabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
  panelId,
}: {
  label: string
  /** id of the tabpanel the tabs control */
  panelId: string
  tabs: { id: T; title: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          aria-controls={panelId}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
            if (!step) return
            const index = tabs.findIndex((t) => t.id === active)
            const next = tabs[(index + step + tabs.length) % tabs.length]!
            onChange(next.id)
            const buttons = event.currentTarget.parentElement?.querySelectorAll('button')
            buttons?.[tabs.indexOf(next)]?.focus()
          }}
          tabIndex={tab.id === active ? 0 : -1}
          className={`rounded-t-md border-2 border-b-0 px-3 py-1 font-game text-xs font-bold focus-visible:outline-2 focus-visible:outline-trim ${
            tab.id === active
              ? 'border-trim bg-parchment text-wood-deep'
              : 'border-wood-light bg-wood text-trim-soft hover:brightness-125'
          }`}
        >
          {tab.title}
        </button>
      ))}
    </div>
  )
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error'
  children: ReactNode
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded border px-2 py-1 font-game text-xs ${
        tone === 'error'
          ? 'border-bar-hp bg-[#fbe1dc] text-[#8a1610]'
          : 'border-wood-light bg-parchment text-wood-deep'
      }`}
    >
      {children}
    </p>
  )
}

/** Modal dialog on the native <dialog> element (focus trap and Escape come with it). */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    // Unmounting removes the element, which also ends the modal state; no close() needed.
    if (!ref.current?.open) ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      className="game-frame m-auto w-[min(32rem,calc(100vw-2rem))] p-2 backdrop:bg-black/50"
    >
      <h2 id={id} className="px-2 pb-1.5 font-game text-sm font-bold text-trim-soft">
        {title}
      </h2>
      <div className="game-inset max-h-[70dvh] overflow-auto p-3 font-game text-sm">{children}</div>
      <div className="flex justify-end px-1 pt-2">
        <GameButton small onClick={onClose}>
          Close
        </GameButton>
      </div>
    </dialog>
  )
}
