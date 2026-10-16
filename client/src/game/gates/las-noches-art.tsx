/**
 * Las Noches vector art and motion, ported from Reborn's tower (main.cfd1c9d9, 2026-10-16): the
 * hollow-mask portrait frame, life masks, divider, record crown, the rift progress meter and the
 * Garganta that tears open when a floor fight starts. Styles live in las-noches.css.
 */
import { useEffect, useState } from 'react'

const fixed = (value: number) => value.toFixed(2)

/** Deterministic noise in [0, 1). */
const noise = (seed: number) => {
  const value = 43758.5453 * Math.sin(127.1 * seed + 311.7)
  return value - Math.floor(value)
}

/** Linear congruential generator, as Reborn seeds its scene layouts. */
export const seededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}

const WINDOW =
  'M100 38 C131 38 156 54 160 84 C163 107 158 128 150 146 C141 167 123 186 100 198 C77 186 59 167 50 146 C42 128 37 107 40 84 C44 54 69 38 100 38 Z'
const SHIELD =
  'M100 20 C142 20 174 40 180 78 C184 106 178 134 167 157 C156 181 131 208 100 224 C69 208 44 181 33 157 C22 134 16 106 20 78 C26 40 58 20 100 20 Z'
const HORN = 'M28 88 C8 66 -1 30 8 -10 C15 20 31 40 62 40 Z'
const HORN_SHINE = 'M10 -3 C17 21 32 38 56 41'
const RIDGES = [
  'M21 74 C28 69 34 61 37 52',
  'M15 58 C21 54 26 47 28 39',
  'M11 41 C16 37 19 31 21 24',
  'M9 25 C12 21 14 16 15 11',
]
const TEETH = [
  'M74 187 L79 176 L83 190 Z',
  'M83 191 L88 179 L92 194 Z',
  'M92 195 L96.5 182 L100 197 Z',
  'M100 197 L103.5 182 L108 195 Z',
  'M108 194 L112 179 L117 191 Z',
  'M117 190 L121 176 L126 187 Z',
]

function Horn({ fill, mirrored }: { fill: string; mirrored?: boolean }) {
  return (
    <g
      className="ln-maskframe__horn"
      transform={mirrored ? 'translate(200 0) scale(-1 1)' : undefined}
    >
      <path d={HORN} fill={fill} />
      {RIDGES.map((d) => (
        <path key={d} className="ln-maskframe__ridge" d={d} />
      ))}
      <path className="ln-maskframe__hornshine" d={HORN_SHINE} />
    </g>
  )
}

/** The horned hollow mask around the enemy portrait. */
export function MaskFrame() {
  return (
    <svg
      className="ln-maskframe"
      viewBox="0 0 200 230"
      width={200}
      height={230}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ln-g-bone" x1="0.85" y1="0" x2="0.15" y2="1">
          <stop offset="0" stopColor="#fbfeff" />
          <stop offset="0.4" stopColor="#e3ecf0" />
          <stop offset="0.8" stopColor="#a6b4bc" />
          <stop offset="1" stopColor="#76858e" />
        </linearGradient>
        <linearGradient id="ln-g-horn" x1="0.9" y1="1" x2="0.1" y2="0">
          <stop offset="0" stopColor="#e2eaee" />
          <stop offset="0.55" stopColor="#b0bec6" />
          <stop offset="1" stopColor="#45525a" />
        </linearGradient>
        <linearGradient id="ln-g-horn-r" x1="0.9" y1="1" x2="0.1" y2="0">
          <stop offset="0" stopColor="#fbfeff" />
          <stop offset="0.55" stopColor="#dbe6eb" />
          <stop offset="1" stopColor="#6f7d86" />
        </linearGradient>
        <linearGradient id="ln-g-bevel" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="ln-g-tear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fd6c8" />
          <stop offset="1" stopColor="#4fd6c8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Horn fill="url(#ln-g-horn)" />
      <Horn fill="url(#ln-g-horn-r)" mirrored />
      <path
        className="ln-maskframe__bone"
        d={`${SHIELD} ${WINDOW}`}
        fillRule="evenodd"
        fill="url(#ln-g-bone)"
      />
      <path className="ln-maskframe__edge" d={SHIELD} />
      <path
        className="ln-maskframe__groove"
        d={SHIELD}
        transform="translate(100 121) scale(0.925 0.93) translate(-100 -121)"
      />
      <path className="ln-maskframe__bevel" d={WINDOW} />
      <path className="ln-maskframe__lip" d={WINDOW} stroke="url(#ln-g-bevel)" />
      <path
        className="ln-maskframe__crest"
        d="M92.5 23 C95.5 16 98 9 100 0 C102 9 104.5 16 107.5 23 C104.5 22 102 22.5 100 24 C98 22.5 95.5 22 92.5 23 Z"
        fill="url(#ln-g-horn-r)"
      />
      <path className="ln-maskframe__shine" d="M118 24 C150 30 172 50 176 82" />
      <path
        className="ln-maskframe__tear"
        d="M60 160 C59 178 61 194 66 206 L68 205 C64 193 63 178 64 161 Z"
        fill="url(#ln-g-tear)"
      />
      <path
        className="ln-maskframe__tear"
        d="M140 160 C141 178 139 194 134 206 L132 205 C136 193 137 178 136 161 Z"
        fill="url(#ln-g-tear)"
      />
      <path className="ln-maskframe__crack" d="M27 96 L36 103 L32 114 L41 122 L38 131" />
      <path className="ln-maskframe__crack" d="M152 28 L146 36 L151 42" />
      {TEETH.map((d) => (
        <path key={d} className="ln-maskframe__tooth" d={d} />
      ))}
    </svg>
  )
}

/** One life: a hollow mask, cracked once spent. */
export function LifeMask({ spent = false }: { spent?: boolean }) {
  return (
    <svg
      className={`ln-mask${spent ? ' ln-mask--spent' : ''}`}
      viewBox="0 0 20 24"
      width={17}
      height={20}
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="ln-mask__horn"
        d="M4.6 6.4 C3 5.2 2 3 1.8 0.6 C3.2 2.4 4.8 3.4 7 3.8 Z M15.4 6.4 C17 5.2 18 3 18.2 0.6 C16.8 2.4 15.2 3.4 13 3.8 Z"
      />
      <path
        className="ln-mask__face"
        d="M10 2.6 C14.6 2.6 17.6 5.4 17.6 9.6 C17.6 14.4 14.6 19.4 10 23 C5.4 19.4 2.4 14.4 2.4 9.6 C2.4 5.4 5.4 2.6 10 2.6 Z"
      />
      <path
        className="ln-mask__shade"
        d="M10 2.6 C5.4 2.6 2.4 5.4 2.4 9.6 C2.4 14.4 5.4 19.4 10 23 C7.6 19 6.2 14 6.4 9.4 C6.6 5.8 8 3.6 10 2.6 Z"
      />
      <path
        className="ln-mask__eye"
        d="M3.9 9.2 L8.9 10.6 L8.3 12.7 L4.4 11.4 Z M16.1 9.2 L11.1 10.6 L11.7 12.7 L15.6 11.4 Z"
      />
      <path className="ln-mask__stripe" d="M5.2 4.6 L6.8 4 L7.2 9.4 L5.8 9.1 Z" />
      <path
        className="ln-mask__teeth"
        d="M6.6 16.2 L13.4 16.2 M8 15.4 V17.2 M10 15.3 V17.6 M12 15.4 V17.2"
      />
      {spent && (
        <path className="ln-mask__crack" d="M12.5 3 L10 7.6 L12 10.8 L9.6 14.6 L10.8 21.6" />
      )}
    </svg>
  )
}

export function Divider({ width = 300 }: { width?: number }) {
  const gradient = `ln-g-div-${width}`
  return (
    <svg
      className="ln-divider"
      viewBox="0 0 420 24"
      width={width}
      height={(24 * width) / 420}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e8f1f5" stopOpacity="0" />
          <stop offset="0.3" stopColor="#e8f1f5" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.7" stopColor="#e8f1f5" stopOpacity="0.55" />
          <stop offset="1" stopColor="#e8f1f5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M194 10.6 C150 8.4 80 5 4 8.2 C80 10.4 150 13.6 194 14.4 Z M226 10.6 C270 8.4 340 5 416 8.2 C340 10.4 270 13.6 226 14.4 Z"
        fill={`url(#${gradient})`}
      />
      <path
        className="ln-divider__curl"
        d="M194 12.5 C190 7 184 6 180 9 M226 12.5 C230 7 236 6 240 9"
      />
      <path className="ln-divider__gem" d="M210 4 L218 12.5 L210 21 L202 12.5 Z" />
    </svg>
  )
}

export function Crown() {
  return (
    <svg
      className="ln-crown"
      viewBox="0 0 14 10"
      width={12}
      height={9}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1 9 L1.6 2.4 L4.6 5.6 L7 0.8 L9.4 5.6 L12.4 2.4 L13 9 Z" />
    </svg>
  )
}

/** A value that replays Reborn's tick animation whenever it changes. */
export function Tick({ value }: { value: string | number }) {
  const [seen, setSeen] = useState({ value, changes: 0 })
  if (seen.value !== value) setSeen({ value, changes: seen.changes + 1 })
  return (
    <span key={seen.changes} className={`ln-tick${seen.changes > 0 ? ' ln-tick--changed' : ''}`}>
      {value}
    </span>
  )
}

// The rift meter: a jagged seam across the sky, torn open up to the current floor.
const RIFT_WIDTH = 600
const RIFT_HEIGHT = 124
const SEAM_POINTS = Array.from({ length: 19 }, (_, index): [number, number] => {
  const t = index / 18
  const jitter = index === 0 || index === 18 ? 0 : (noise(index) - 0.5) * (index % 3 === 1 ? 20 : 9)
  return [12 + t * (RIFT_WIDTH - 24), 86 - 52 * Math.sin(Math.PI * (0.05 + 0.9 * t)) + jitter]
})
const SEAM_LENGTHS = SEAM_POINTS.reduce<number[]>((lengths, [x, y], index) => {
  if (index === 0) return [0]
  const [px, py] = SEAM_POINTS[index - 1]!
  return [...lengths, lengths[index - 1]! + Math.hypot(x - px, y - py)]
}, [])
const SEAM_TOTAL = SEAM_LENGTHS[SEAM_LENGTHS.length - 1]!
const SEAM = `M${SEAM_POINTS.map(([x, y]) => `${fixed(x)} ${fixed(y)}`).join(' L')}`

/** Point and direction along the seam at a percentage of its length. */
function seamAt(percent: number) {
  const distance = (Math.max(0, Math.min(100, percent)) / 100) * SEAM_TOTAL
  let index = 1
  while (index < SEAM_LENGTHS.length - 1 && SEAM_LENGTHS[index]! < distance) index++
  const span = SEAM_LENGTHS[index]! - SEAM_LENGTHS[index - 1]! || 1
  const along = (distance - SEAM_LENGTHS[index - 1]!) / span
  const [x0, y0] = SEAM_POINTS[index - 1]!
  const [x1, y1] = SEAM_POINTS[index]!
  return {
    x: x0 + (x1 - x0) * along,
    y: y0 + (y1 - y0) * along,
    dx: (x1 - x0) / span,
    dy: (y1 - y0) / span,
  }
}

/** CSS position of a marker on the seam, relative to the meter box. */
export function seamPosition(percent: number) {
  const { x, y } = seamAt(percent)
  return {
    left: `${Math.round((x / RIFT_WIDTH) * 1e4) / 100}%`,
    top: `${Math.round((y / RIFT_HEIGHT) * 1e4) / 100}%`,
  }
}

/** Outline of the torn part of the seam, from 0 to `open` percent. */
function tornPath(open: number) {
  if (open <= 0) return ''
  const steps = Math.max(2, Math.round(open))
  const width = 3.5 + 12 * Math.min(1, open / 100)
  const upper: string[] = []
  const lower: string[] = []
  for (let step = 0; step <= steps; step++) {
    const at = (open * step) / steps
    const { x, y, dx, dy } = seamAt(at)
    const swell = Math.pow(Math.sin(Math.PI * (step / steps)), 0.65)
    const seed = Math.round(at)
    const up = width * swell * (0.55 + 0.9 * noise(2 * seed + 1))
    const down = width * swell * (0.55 + 0.9 * noise(2 * seed + 2))
    upper.push(`${fixed(x - dy * up)} ${fixed(y + dx * up)}`)
    lower.push(`${fixed(x + dy * down)} ${fixed(y - dx * down)}`)
  }
  return `M${upper.join(' L')} L${lower.reverse().join(' L')} Z`
}

/** The seam, torn open to `open` percent, with `lit` of its ten bands burning. */
export function Rift({ open, lit }: { open: number; lit: number }) {
  const torn = tornPath(open)
  const spark = seamAt(open)
  return (
    <svg
      className="ln-rift"
      viewBox={`0 0 ${RIFT_WIDTH} ${RIFT_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="ln-f-rift" x="-20%" y="-150%" width="140%" height="400%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <linearGradient id="ln-g-rift-void" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1830" />
          <stop offset="0.5" stopColor="#010205" />
          <stop offset="1" stopColor="#0b1830" />
        </linearGradient>
      </defs>
      <path className="ln-rift__seam" d={SEAM} />
      <g className="ln-rift__torn" data-progress={open}>
        {torn && (
          <>
            <path className="ln-rift__glow" d={torn} filter="url(#ln-f-rift)" />
            <path className="ln-rift__void" d={torn} fill="url(#ln-g-rift-void)" />
          </>
        )}
      </g>
      {Array.from({ length: 10 }, (_, band) => {
        const { x, y } = seamAt(10 * (band + 1))
        return band < lit ? (
          <circle
            key={band}
            className="ln-band ln-band--lit ln-rift__ember"
            cx={x}
            cy={y}
            r={1.3}
          />
        ) : (
          <path
            key={band}
            className="ln-band ln-rift__seal"
            d={`M${fixed(x)} ${fixed(y - 3.4)} L${fixed(x + 3.4)} ${fixed(y)} L${fixed(x)} ${fixed(y + 3.4)} L${fixed(x - 3.4)} ${fixed(y)} Z`}
          />
        )
      })}
      {open > 0 && <circle className="ln-rift__spark" cx={spark.x} cy={spark.y} r={3.4} />}
    </svg>
  )
}

// The Garganta: a black mouth torn across the stage while a floor fight starts.
const MOUTH_WIDTH = 1300
const MOUTH_HEIGHT = 320
const GARGANTA = (() => {
  const random = seededRandom(1337)
  const middle = MOUTH_HEIGHT / 2
  const edge = (side: number) => {
    const points: [number, number][] = []
    let x = 0
    while (x < MOUTH_WIDTH) {
      const open = Math.pow(Math.sin(Math.PI * (x / MOUTH_WIDTH)), 0.75) * (0.36 * MOUTH_HEIGHT)
      const bite = (points.length % 2 === 0 ? 1 : 0.35) * (6 + 20 * random())
      points.push([x, middle - side * Math.max(0, open - bite)])
      x += 12 + 26 * random()
    }
    points.push([MOUTH_WIDTH, middle])
    return points
  }
  const top = edge(1)
  const bottom = edge(-1).reverse()
  const point = ([x, y]: [number, number]) => `${x.toFixed(1)} ${y.toFixed(1)}`
  const mouth = `M0 ${middle} L${top.map(point).join(' L')} L${bottom.map(point).join(' L')} Z`
  const forks = [
    ...top.filter((_, index) => index % 5 === 2),
    ...bottom.filter((_, index) => index % 6 === 3),
  ].map(([startX, startY]) => {
    const direction = startY < middle ? -1 : 1
    let x = startX
    let y = startY
    let path = `M${x.toFixed(1)} ${y.toFixed(1)}`
    for (let step = 0; step < 3; step++) {
      x += 18 * random() - 9
      y += direction * (6 + 10 * random())
      path += ` L${x.toFixed(1)} ${y.toFixed(1)}`
    }
    return path
  })
  return { mouth, forks }
})()
const GARGANTA_MS = 1200

export function Garganta({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, GARGANTA_MS)
    return () => window.clearTimeout(timer)
  }, [onDone])
  return (
    <div
      className="ln-garganta"
      data-testid="las-noches-garganta"
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onDone()
      }}
    >
      <div className="ln-garganta__veil" />
      <div className="ln-garganta__seam" />
      <svg
        className="ln-garganta__rift"
        viewBox={`0 0 ${MOUTH_WIDTH} ${MOUTH_HEIGHT}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <radialGradient id="ln-g-void" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#000000" />
            <stop offset="0.75" stopColor="#03050c" />
            <stop offset="1" stopColor="#0b3354" />
          </radialGradient>
          <filter id="ln-f-garganta" x="-5%" y="-30%" width="110%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
          </filter>
        </defs>
        <path className="ln-garganta__halo" d={GARGANTA.mouth} filter="url(#ln-f-garganta)" />
        <path className="ln-garganta__mouth" d={GARGANTA.mouth} fill="url(#ln-g-void)" />
        <g className="ln-garganta__forks">
          {GARGANTA.forks.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
    </div>
  )
}

/** Reborn skips the Garganta for reduced motion and hidden tabs. */
export const gargantaAllowed = () =>
  !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches && !document.hidden
