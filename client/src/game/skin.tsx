// In-game skin built from the original 2011 UI pieces (tools/assets/ui.ts): charcoal window frame
// with its glossy header, cream content panels, brown glossy buttons, gold tabs, the original
// HP/MP/EXP bars. Utilities live in index.css (game-frame, game-inset, game-button, game-tab...).
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from 'react'

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
    <section
      aria-labelledby={id}
      className={`game-frame flex flex-col px-2 pt-0 pb-2 ${className}`}
    >
      <div className="game-frame-title mb-2 flex items-center justify-between gap-2">
        <h2 id={id} className="game-title-tag font-game font-bold">
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
      className={`inline-flex items-center justify-center gap-1 font-game active:translate-y-px disabled:cursor-not-allowed ${
        small
          ? 'game-button min-h-5 min-w-11 px-2 text-xs'
          : 'game-button min-h-6 min-w-16 px-3 text-xs'
      } ${className}`}
      {...props}
    />
  )
}

const BAR_STYLE = {
  hp: { bar: 'game-bar-hp h-[11px] w-[106px]', label: 'text-[#ff7dfa]' },
  mp: { bar: 'game-bar-mp h-[11px] w-[106px]', label: 'text-[#66ccff]' },
  exp: { bar: 'game-bar-exp h-[10px] flex-1', label: 'text-[#9dff6a]' },
} as const

/** HP, MP and EXP bars: the original empty bar with the full one clipped to the value. */
export function Bar({
  label,
  value,
  max,
  kind,
}: {
  label: string
  value: number
  max: number
  kind: keyof typeof BAR_STYLE
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const style = BAR_STYLE[kind]
  return (
    <div className="flex items-center gap-2 font-game text-xs">
      <span
        className={`w-8 font-black italic [text-shadow:var(--shadow-game-text)] ${style.label}`}
      >
        {label}
      </span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} / ${max}`}
        className={`game-bar ${style.bar}`}
        style={{ '--fill': `${percent}%` } as CSSProperties}
      />
      <span className="text-[11px] font-bold whitespace-nowrap text-white [text-shadow:var(--shadow-game-text)]">
        {value} / {max}
      </span>
    </div>
  )
}

export function Tabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
  panelId,
  variant = 'gold',
}: {
  label: string
  /** gold: window tabs (cream panels); dark: chat channel tabs on the translucent HUD. */
  variant?: 'gold' | 'dark'
  /** id of the tabpanel the tabs control */
  panelId: string
  /** `icon`: URL of a small picture shown before the title (decorative). */
  tabs: { id: T; title: string; icon?: string }[]
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
          className={`${variant === 'gold' ? 'game-tab' : 'game-tab-dark'} h-[22px] px-[5px] font-game text-[13px]`}
        >
          {tab.icon && <img src={tab.icon} alt="" className="-my-1 mr-1 inline h-5 w-auto" />}
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
          ? 'border-[#a01010] bg-[#ffe3dc] text-[#8a1610]'
          : 'border-wood-light bg-parchment text-ink-game'
      }`}
    >
      {children}
    </p>
  )
}

/**
 * Floating game window: a modal on the native <dialog> element (focus trap and Escape come with
 * it), centred over the stage and scaled with the HUD (--hud-scale, see GameApp).
 */
export function Dialog({
  title,
  onClose,
  className = 'w-[32rem]',
  children,
}: {
  title: ReactNode
  onClose: () => void
  /** Width (and other sizing) of the window; the stage is 1280x720 HUD pixels. */
  className?: string
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
      className={`game-frame game-window m-auto max-w-[calc(100%-1rem)] bg-transparent px-2 pt-0 pb-2 backdrop:bg-black/25 ${className}`}
    >
      <div className="game-frame-title mb-2 flex items-center justify-between gap-2">
        <h2 id={id} className="game-title-tag font-game font-bold">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close"
          className="game-close shrink-0"
          onClick={onClose}
        />
      </div>
      <div className="game-inset max-h-[520px] overflow-auto p-3 font-game text-sm">{children}</div>
    </dialog>
  )
}

/**
 * Scale of a fixed-size stage (the original Flash stage) in the window: `contain` fits all of
 * it, `cover` fills the window and crops the overflow.
 */
export function useFitScale(width: number, height: number, mode: 'contain' | 'cover' = 'contain') {
  const fit = () => {
    const pick = mode === 'cover' ? Math.max : Math.min
    return pick(window.innerWidth / width, window.innerHeight / height)
  }
  const [scale, setScale] = useState(fit)
  useEffect(() => {
    const onResize = () => setScale(fit())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // fit only reads the props listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, mode])
  return scale
}
