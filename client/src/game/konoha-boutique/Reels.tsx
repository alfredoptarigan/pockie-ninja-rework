// The Konoha Boutique reels (Reborn chunk 358 `yt`): 5 reels 105 wide, symbol cells 105x100 with
// 76x76 pictures, the win lines as SVG polylines and the winning pieces' red pulse. A spin scrolls
// reel n through 15 + 3n random symbols to its 3 results over 0.75 + 0.15n s.
import { useEffect, useState } from 'react'
import {
  BOUTIQUE_PAYLINES,
  BOUTIQUE_RULES,
  BOUTIQUE_SYMBOLS,
  type BoutiqueSymbol,
} from '../../../../shared/src/schemas/konoha-boutique'
import { art } from './api'

const REEL = 105
const CELL = 100
const { reels, rows } = BOUTIQUE_RULES
const EASING = 'cubic-bezier(0.15,0.8,0.3,1)'

export const reelSeconds = (reel: number) => 0.75 + 0.15 * reel
/** When the last reel has stopped (with Reborn's 300 ms fallback). */
export const SPIN_MS = reelSeconds(reels - 1) * 1000 + 300

export const randomSymbol = () =>
  BOUTIQUE_SYMBOLS[Math.floor(Math.random() * BOUTIQUE_SYMBOLS.length)]!
export const randomPieces = () => Array.from({ length: reels * rows }, randomSymbol)

/** Reel n's column (top to bottom) of a 15-piece board. */
const column = (pieces: readonly BoutiqueSymbol[], reel: number) =>
  Array.from({ length: rows }, (_, row) => pieces[row * reels + reel]!)

/** Each reel's strip for a spin: what it shows now, 15 + 3n random symbols, then the result. */
export const spinStrips = (from: readonly BoutiqueSymbol[], to: readonly BoutiqueSymbol[]) =>
  Array.from({ length: reels }, (_, reel) => [
    ...column(from, reel),
    ...Array.from({ length: 15 + 3 * reel }, randomSymbol),
    ...column(to, reel),
  ])

function SymbolCell({ symbol }: { symbol: BoutiqueSymbol }) {
  return (
    <span className="grid shrink-0 place-items-center" style={{ width: REEL, height: CELL }}>
      <img src={art(symbol)} alt={symbol} className="size-[76px]" />
    </span>
  )
}

export function Reels({
  pieces,
  strips,
  lines,
  winPieces,
  showWon,
  busy,
}: {
  pieces: readonly BoutiqueSymbol[]
  /** While spinning: each reel's strip. */
  strips: BoutiqueSymbol[][] | null
  /** Paylines to draw (the winning ones, or the preview of the chosen lines). */
  lines: number[]
  winPieces: number[]
  showWon: boolean
  /** From the spin request until the reels stop. */
  busy: boolean
}) {
  // The strips mount at the top, then scroll on the next frame (`go` names the strips it moves).
  const [go, setGo] = useState<BoutiqueSymbol[][] | null>(null)
  useEffect(() => {
    if (!strips) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setGo(strips))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [strips])
  return (
    <>
      <div
        role="group"
        aria-label="Slot machine"
        aria-busy={busy}
        className="absolute flex overflow-hidden"
        style={{ left: 63, top: 99, width: REEL * reels, height: 293 }}
      >
        {Array.from({ length: reels }, (_, reel) => {
          const strip = strips?.[reel] ?? column(pieces, reel)
          const shift = strips && go === strips ? (strip.length - rows) * CELL : 0
          return (
            <div
              key={reel}
              aria-label={`Reel ${reel + 1}`}
              className="flex flex-col"
              style={{
                width: REEL,
                transform: `translateY(-${shift}px)`,
                transition: shift ? `transform ${reelSeconds(reel)}s ${EASING}` : 'none',
              }}
            >
              {strip.map((symbol, i) => (
                <SymbolCell key={i} symbol={symbol} />
              ))}
            </div>
          )
        })}
      </div>
      {!strips &&
        winPieces.map((piece) => (
          <span
            key={piece}
            aria-hidden="true"
            className="pointer-events-none absolute animate-pulse rounded-[6px] border-[3px] border-[#ff2020] shadow-[0_0_10px_#ff2020]"
            style={{
              left: 63 + (piece % reels) * REEL + 10,
              top: 99 + Math.floor(piece / reels) * CELL + 8,
              width: 85,
              height: 84,
            }}
          />
        ))}
      {!strips && lines.length > 0 && (
        <svg
          aria-label="Win lines"
          role="img"
          className="pointer-events-none absolute"
          style={{ left: 63, top: 99 }}
          width={REEL * reels}
          height={300}
        >
          {lines.map((line) => {
            const [path, color] = BOUTIQUE_PAYLINES[line]!
            const points = path
              .map((row, reel) => `${reel * REEL + 52},${row * CELL + 50}`)
              .join(' ')
            return (
              <g key={line} fill="none" strokeLinejoin="round" strokeLinecap="round">
                <polyline points={points} stroke="#000" strokeWidth={8} strokeOpacity={0.3} />
                <polyline points={points} stroke={color} strokeWidth={5} strokeOpacity={0.9} />
                <polyline points={points} stroke="#fff" strokeWidth={1.5} strokeOpacity={0.4} />
              </g>
            )
          })}
        </svg>
      )}
      {showWon && !strips && (
        <img
          src={art('won')}
          alt="You won"
          className="pointer-events-none absolute"
          style={{ left: 54, top: 86, width: 545 }}
        />
      )}
    </>
  )
}
