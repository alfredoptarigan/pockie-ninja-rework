// Konoha Boutique (Reborn chunk 358 `Boutique`, reborn-lazy-features.md): an 870x560 slot machine
// on bg.png. Top: coins, Buy Coins / Buy Items / Info and the level bar. Middle: the reels and,
// right, the bonus-card slots and Multiplier / Line steppers with the bet. Bottom: Free Coins and
// its timer, the last win, Claim Bonus or Double Chance, Max Bet, Try Your Luck and Auto Spin. The
// server rolls every spin; the reels then scroll to its result and the view is applied when they
// stop. Multiplier, lines and the last spin persist in localStorage like Reborn's.
// ponytail: bonus cards (Reborn items 4060001-4 that set a reward multiplier) are not in our item
// tables, so the big2-big5 slots never show ACTIVE.
import type { Character } from '@pockie/shared'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  type BoutiqueSpinResult,
  type BoutiqueSymbol,
  type BoutiqueView,
} from '../../../../shared/src/schemas/konoha-boutique'
import { api } from '../../lib/api'
import { useMutation } from '@tanstack/react-query'
import { Dialog, Notice } from '../skin'
import { errorMessage } from '../api'
import { art, BOUTIQUE_PATH, failToast, useBoutique, useBoutiqueAction, useSettle } from './api'
import { Guide } from './Guide'
import { randomPieces, Reels, SPIN_MS, spinStrips } from './Reels'
import { BonusRound, DoubleChance } from './Rounds'
import { BuyCoins, ExchangeRewards } from './Shops'

const LINES_DELAY_MS = 500
const AUTO_DELAY_MS = 800
const MAX_AUTO = 999

/** localStorage, ignoring a missing or broken value. */
function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}
const store = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))

const coins = (value: number) => value.toLocaleString('en-US')

/** One of Reborn's picture buttons, placed in the 870x560 body. */
function ArtButton({
  image,
  box: [left, top, width, height],
  textSize,
  disabled,
  onClick,
  children,
}: {
  image: string
  box: [number, number, number, number]
  textSize: number
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="absolute bg-[length:100%_100%] font-game font-bold text-white [text-shadow:1px_1px_2px_#000] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
      style={{
        left,
        top,
        width,
        height,
        fontSize: textSize,
        backgroundImage: `url(${art(image)})`,
      }}
    >
      {children}
    </button>
  )
}

function Stepper({
  label,
  value,
  top,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string
  value: number
  top: number
  min: number
  max: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  const icon = (name: string, left: number, step: number, text: string): ReactNode => (
    <button
      type="button"
      aria-label={`${text} ${label}`}
      disabled={disabled || value + step < min || value + step > max}
      onClick={() => onChange(value + step)}
      className="absolute size-[36px] bg-contain bg-no-repeat disabled:opacity-50"
      style={{ left, top: top + 2, backgroundImage: `url(${art(name)})` }}
    />
  )
  return (
    <>
      {icon('plus', 691, 1, 'More')}
      <output
        aria-label={label}
        className="absolute text-center font-mono text-[34px] leading-[40px] font-bold text-white"
        style={{ left: 732, top, width: 60 }}
      >
        {value}
      </output>
      {icon('minus', 799, -1, 'Less')}
    </>
  )
}

const text = (style: CSSProperties, children: ReactNode, className = '') => (
  <span className={`absolute font-game ${className}`} style={style}>
    {children}
  </span>
)

function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** Free Coins and its timer line; ticks every second on its own. */
function FreeCoins({ view, busy }: { view: BoutiqueView; busy: boolean }) {
  const now = useNow()
  const claim = useBoutiqueAction('free-coins')
  const total = view.freeCoinsPerDay
  const done = view.freeCoinsClaimed >= total
  const wait = Math.max(0, Math.ceil((Date.parse(view.nextFreeCoinTime) - now) / 1000))
  const timer = done
    ? `Daily limit reached (${total}/${total})`
    : wait > 0
      ? `Next free coins in: ${String(Math.floor(wait / 60)).padStart(2, '0')}:${String(wait % 60).padStart(2, '0')}`
      : `Free coins claimed: ${view.freeCoinsClaimed}/${total}`
  return (
    <>
      <ArtButton
        image="button_blue"
        box={[10, 440, 141, 55]}
        textSize={20}
        disabled={done || wait > 0 || busy || claim.isPending}
        onClick={() => claim.mutate({})}
      >
        Free Coins
      </ArtButton>
      {text({ left: 18, top: 500, color: '#8bf', fontSize: 11 }, timer)}
    </>
  )
}

type Win = { lines: number[]; pieces: number[]; won: boolean }
type Open = 'bonus' | 'double' | 'exchange' | 'buy' | 'guide' | null

export function KonohaBoutiqueWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const query = useBoutique()
  const view = query.data
  return (
    <Dialog title="Konoha Boutique" onClose={onClose} className="game-window-bare w-[880px]">
      {view ? (
        <Machine view={view} character={character} />
      ) : (
        <div className="game-panel-1 grid place-items-center" style={{ width: 870, height: 560 }}>
          {query.error ? (
            <Notice tone="error">{errorMessage(query.error)}</Notice>
          ) : (
            <p>Loading...</p>
          )}
        </div>
      )}
    </Dialog>
  )
}

function Machine({ view, character }: { view: BoutiqueView; character: Character }) {
  const [, maxMultiplier, maxLines] = view.levels[view.level]!
  const next = view.levels[view.level + 1]
  const [rawMultiplier, setMultiplier] = useState(() => stored('boutique-multiplier', 1))
  const [rawLines, setLines] = useState(() => stored('boutique-lines', 1))
  const multiplier = Math.max(1, Math.min(rawMultiplier, maxMultiplier))
  const lines = Math.max(1, Math.min(rawLines, maxLines))
  const bet = multiplier * lines
  const [pieces, setPieces] = useState<BoutiqueSymbol[]>(() =>
    stored('boutique-last-spin', randomPieces()),
  )
  const [strips, setStrips] = useState<BoutiqueSymbol[][] | null>(null)
  const [win, setWin] = useState<Win>(() => ({
    lines: stored('boutique-last-winLines', []),
    pieces: stored('boutique-last-winPieces', []),
    won: false,
  }))
  const [preview, setPreview] = useState<number[]>([])
  const [open, setOpen] = useState<Open>(null)
  const [autoInput, setAutoInput] = useState('10')
  const [autoLeft, setAutoLeft] = useState(0)
  const settle = useSettle()

  // Timers and the values a queued auto spin reads after re-renders.
  const timers = useRef<number[]>([])
  const latest = useRef({ pieces, multiplier, lines, autoLeft })
  useEffect(() => {
    latest.current = { pieces, multiplier, lines, autoLeft }
  })
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])
  const later = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, ms))

  const spin = useMutation({
    mutationFn: (body: { multiplier: number; lines: number }) =>
      api<BoutiqueSpinResult>(`${BOUTIQUE_PATH}/spin`, { method: 'POST', body }),
    onMutate: () => {
      setWin({ lines: [], pieces: [], won: false })
      setPreview([])
    },
    onSuccess: (result) => {
      setStrips(spinStrips(latest.current.pieces, result.pieces))
      later(SPIN_MS, () => {
        setPieces(result.pieces)
        setStrips(null)
        settle(result)
        store('boutique-last-spin', result.pieces)
      })
      later(SPIN_MS + LINES_DELAY_MS, () => {
        setWin({
          lines: result.winningLines,
          pieces: result.winningPieces,
          won: result.coinsGained > 0,
        })
        store('boutique-last-winLines', result.winningLines)
        store('boutique-last-winPieces', result.winningPieces)
        continueAuto(result.boutique)
      })
    },
    onError: (error) => {
      setAutoLeft(0)
      failToast(error)
    },
  })

  const spinNow = () => {
    const { multiplier: m, lines: l } = latest.current
    spin.mutate({ multiplier: m, lines: l })
  }
  /** The next queued auto spin, if coins cover the bet and nothing waits. */
  function continueAuto(after: BoutiqueView) {
    const { autoLeft: left, multiplier: m, lines: l } = latest.current
    if (left <= 0) return
    if (after.coins < m * l || after.bonusChance > 0 || after.doubleChance > 0) {
      setAutoLeft(0)
      return
    }
    later(AUTO_DELAY_MS, () => {
      if (latest.current.autoLeft <= 0) return
      setAutoLeft(latest.current.autoLeft - 1)
      spinNow()
    })
  }

  const spinning = strips !== null || spin.isPending
  const pending = view.bonusChance > 0 || view.doubleChance > 0
  const canSpin = !spinning && !pending && view.coins >= bet

  const changeMultiplier = (value: number) => {
    setMultiplier(value)
    store('boutique-multiplier', value)
  }
  const changeLines = (value: number) => {
    setLines(value)
    store('boutique-lines', value)
    setWin({ lines: [], pieces: [], won: false })
    setPreview(Array.from({ length: value }, (_, i) => i))
  }
  const startAuto = () => {
    const count = Math.min(MAX_AUTO, Number.parseInt(autoInput, 10))
    if (!canSpin || !Number.isInteger(count) || count < 1) return
    setAutoLeft(count - 1)
    latest.current.autoLeft = count - 1
    spinNow()
  }
  const expShare = next ? Math.min(100, (view.currentExp / next[0]) * 100) : 100

  return (
    <div
      className="relative overflow-hidden bg-[length:100%_100%] font-game text-white select-none"
      style={{ width: 870, height: 560, backgroundImage: `url(${art('bg')})` }}
    >
      <span
        aria-label="Boutique Coins"
        className="absolute font-[Arial] text-[22px] leading-[26px] font-bold"
        style={{ left: 60, top: 17, width: 160 }}
      >
        {coins(view.coins)}
      </span>
      <ArtButton
        image="button_yellow1"
        box={[245, 12, 116, 38]}
        textSize={15}
        onClick={() => setOpen('buy')}
      >
        Buy Coins
      </ArtButton>
      <ArtButton
        image="button_yellow1"
        box={[375, 12, 116, 38]}
        textSize={15}
        onClick={() => setOpen('exchange')}
      >
        Buy Items
      </ArtButton>
      <ArtButton
        image="button_yellow2"
        box={[775, 7, 81, 38]}
        textSize={15}
        onClick={() => setOpen('guide')}
      >
        Info
      </ArtButton>
      <div
        role="progressbar"
        aria-label="Boutique level"
        aria-valuenow={Math.round(expShare)}
        className="absolute bg-[length:100%_100%]"
        style={{
          left: 140,
          top: 65,
          width: 364,
          height: 14,
          backgroundImage: `url(${art('bar_empty')})`,
        }}
      >
        <span
          className="absolute inset-y-0 left-0 bg-[length:364px_100%]"
          style={{ width: `${expShare}%`, backgroundImage: `url(${art('bar_fill')})` }}
        />
        <span className="absolute inset-0 text-center text-[10px] leading-[14px] font-bold">
          Lv.{view.level}
        </span>
      </div>

      <Reels
        pieces={pieces}
        strips={strips}
        lines={win.lines.length ? win.lines : preview}
        winPieces={win.pieces}
        showWon={win.won}
        busy={spinning}
      />

      {[2, 3, 4, 5].map((n, i) => (
        <img
          key={n}
          src={art(`big${n}`)}
          alt={`x${n} bonus card slot`}
          className="absolute size-[39px] object-contain opacity-50"
          style={{ left: 661 + 45 * i, top: 81 }}
        />
      ))}
      {text(
        { left: 646, top: 189, width: 50, fontSize: 13, lineHeight: '14px' },
        'Multi-\nplier',
        'font-bold whitespace-pre-line',
      )}
      <Stepper
        label="Multiplier"
        value={multiplier}
        top={178}
        min={1}
        max={maxMultiplier}
        disabled={spinning}
        onChange={changeMultiplier}
      />
      {text({ left: 647, top: 254, fontSize: 13 }, 'Line', 'font-bold')}
      <Stepper
        label="Lines"
        value={lines}
        top={237}
        min={1}
        max={maxLines}
        disabled={spinning}
        onChange={changeLines}
      />
      {text({ left: 720, top: 308, fontSize: 34, color: '#ddd' }, 'Bet', 'font-bold')}
      <output
        aria-label="Bet"
        className="absolute text-center font-mono text-[34px] leading-[40px] font-bold"
        style={{ left: 665, top: 354, width: 170 }}
      >
        {bet}
      </output>

      <FreeCoins view={view} busy={spinning} />
      {text(
        { left: 255, top: 418, fontSize: 16, color: '#000' },
        'Coins won last time',
        'font-bold',
      )}
      <output
        aria-label="Coins won last time"
        className="absolute text-center font-mono text-[34px] leading-[40px] font-bold"
        style={{ left: 202, top: 455, width: 250 }}
      >
        {coins(view.lastCoinWon)}
      </output>
      {!spinning && view.bonusChance > 0 && (
        <ArtButton
          image="button_blue"
          box={[250, 445, 160, 50]}
          textSize={18}
          onClick={() => setOpen('bonus')}
        >
          Claim Bonus
        </ArtButton>
      )}
      {!spinning && view.doubleChance > 0 && view.bonusChance === 0 && (
        <ArtButton
          image="button_blue"
          box={[250, 445, 160, 50]}
          textSize={18}
          onClick={() => setOpen('double')}
        >
          Double Chance
        </ArtButton>
      )}
      <ArtButton
        image="button_blue"
        box={[490, 445, 141, 55]}
        textSize={24}
        disabled={spinning || view.coins < bet}
        onClick={() => {
          changeMultiplier(maxMultiplier)
          changeLines(maxLines)
        }}
      >
        Max Bet
      </ArtButton>
      <ArtButton
        image="button_green"
        box={[640, 435, 214, 75]}
        textSize={30}
        disabled={!canSpin}
        onClick={spinNow}
      >
        Try Your Luck
      </ArtButton>
      <div className="absolute flex gap-[3px]" style={{ left: 659, top: 522 }}>
        {autoLeft > 0 ? (
          <button
            type="button"
            onClick={() => {
              setAutoLeft(0)
              latest.current.autoLeft = 0
            }}
            className="h-[22px] w-[183px] rounded-[3px] bg-linear-to-b from-[#e44] to-[#a11] text-[12px] font-bold"
          >
            Stop ({autoLeft})
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={!canSpin}
              onClick={startAuto}
              className="h-[22px] w-[90px] rounded-[3px] bg-linear-to-b from-[#4af] to-[#16c] text-[12px] font-bold disabled:opacity-50"
            >
              Auto Spin
            </button>
            <input
              type="number"
              aria-label="Auto spins"
              min={1}
              max={MAX_AUTO}
              value={autoInput}
              onChange={(event) => setAutoInput(event.target.value)}
              className="game-field h-[22px] w-[90px] px-1 text-black"
            />
          </>
        )}
      </div>

      {open === 'bonus' && <BonusRound view={view} onClose={() => setOpen(null)} />}
      {open === 'double' && <DoubleChance view={view} onClose={() => setOpen(null)} />}
      {open === 'exchange' && <ExchangeRewards view={view} onClose={() => setOpen(null)} />}
      {open === 'buy' && (
        <BuyCoins view={view} character={character} onClose={() => setOpen(null)} />
      )}
      {open === 'guide' && <Guide view={view} onClose={() => setOpen(null)} />}
    </div>
  )
}
