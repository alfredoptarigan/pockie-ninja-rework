// Impel Down's tower view (Reborn chunk 286 #8860, reborn-lazy-features.md "Left: tower view"): the
// gate art behind a 500x380 window onto 26 floor tiles (25 floors and "Next Gate") joined by
// bridges, with the ninja standing on the current floor. The view scrolls only by itself.
// ponytail: Reborn draws the ninja's idle animation on a Phaser canvas; we show its pose image.
import { useEffect, useRef } from 'react'
import { IMPEL_DOWN_RULES } from '../../../../shared/src/schemas/impel-down'
import { poseUrl } from '../dungeons'

export const impelArt = (name: string) => `/assets/reborn/ui/UIResource/ImpelDown/${name}.webp`

const ROW = 90
const OFFSET = 100
const VIEW = { width: 500, height: 380 }
const CONTENT_HEIGHT = 2340
const TILES = IMPEL_DOWN_RULES.floorsPerGate + 1
/** floor{G}.png position per gate index. */
const GATE_FLOOR = [
  [35, 246],
  [35, 263],
  [30, 281],
  [27, 300],
  [22, 319],
  [15, 340],
] as const
const MARKER_HEIGHT = 90

const tileLeft = (t: number) => (t % 2 === 0 ? 80 : 280)
/** Scroll that keeps floor `w` in view (Reborn: max(0, W*90 + 135 - 190)). */
const scrollFor = (w: number) => Math.max(0, w * ROW + OFFSET + 35 - VIEW.height / 2)

export function Tower({
  gate,
  floor,
  maxFloor,
  intersection,
  clothing,
  disabled,
  onFloor,
}: {
  gate: number
  floor: number
  maxFloor: number
  intersection: boolean
  clothing: number
  disabled: boolean
  onFloor: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    // Optional call: jsdom has no element scrollTo.
    scroller.current?.scrollTo?.({
      top: scrollFor(floor),
      behavior: first.current ? 'auto' : 'smooth',
    })
    first.current = false
  }, [floor])
  const [floorX, floorY] = GATE_FLOOR[gate] ?? GATE_FLOOR[0]
  return (
    <section
      aria-label="Tower"
      className="game-inset relative h-[386px] w-[500px] shrink-0 overflow-hidden p-[2px]"
    >
      <img src={impelArt(`gate${gate}`)} alt="" className="absolute top-0 left-0" />
      <img
        src={impelArt(`floor${gate}`)}
        alt=""
        className="absolute"
        style={{ left: floorX, top: floorY }}
      />
      <img src={impelArt('floor')} alt="" className="absolute" style={{ left: 10, top: 225 }} />
      <div
        ref={scroller}
        className="absolute top-0 left-0 overflow-hidden"
        style={{ width: VIEW.width, height: VIEW.height }}
      >
        <div
          className="relative"
          style={{ height: CONTENT_HEIGHT, marginTop: OFFSET, marginBottom: 20 }}
        >
          <ol aria-label="Floors">
            {Array.from({ length: TILES }, (_, t) => {
              const current = t === floor
              // Floors not reached yet look knocked down (our maxFloor counts floors cleared).
              const knocked = !intersection && gate * IMPEL_DOWN_RULES.floorsPerGate + t > maxFloor
              const label = t < IMPEL_DOWN_RULES.floorsPerGate ? `Floor ${t + 1}` : 'Next Gate'
              return (
                <li key={t}>
                  {t < TILES - 1 && (
                    <div
                      aria-hidden
                      className="absolute bg-no-repeat"
                      style={{
                        left: 160,
                        top: t * ROW + 35,
                        width: t % 2 === 0 ? 120 : 60,
                        height: 100,
                        backgroundImage: `url(${impelArt(t % 2 === 0 ? 'prisonbridgeright' : 'prisonbridgeleft')})`,
                      }}
                    />
                  )}
                  <button
                    type="button"
                    aria-label={label}
                    aria-current={current ? 'step' : undefined}
                    disabled={!current || disabled}
                    onClick={onFloor}
                    className="absolute z-[2] bg-no-repeat enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-default"
                    style={{
                      left: tileLeft(t),
                      top: t * ROW,
                      width: 140,
                      height: 40,
                      backgroundImage: `url(${impelArt(knocked ? 'prisonfloorknock' : 'prisonfloor')})`,
                    }}
                  >
                    <span
                      className="absolute h-[20px] w-[75px] text-[12px] font-bold whitespace-nowrap [text-shadow:1px_1px_2px_#000]"
                      style={{
                        left: t % 2 === 0 ? 0 : 80,
                        top: 50,
                        color: current ? '#ffff00' : '#ffffff',
                      }}
                    >
                      {label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          <img
            src={poseUrl(clothing)}
            alt=""
            aria-hidden
            className="pointer-events-none absolute z-10 object-contain transition-[left,top] duration-1000 ease-in-out"
            style={{
              left: tileLeft(floor) + 60,
              top: floor * ROW + 35,
              height: MARKER_HEIGHT,
              transform: `translate(-50%, -100%)${floor % 2 === 0 ? ' scaleX(-1)' : ''}`,
            }}
          />
        </div>
      </div>
    </section>
  )
}
