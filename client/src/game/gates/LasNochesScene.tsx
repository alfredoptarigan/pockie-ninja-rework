/**
 * Las Noches scene background with Reborn's ambient motion (lnfx, main.cfd1c9d9): a moon bloom,
 * two clouds cut from the background art drifting across the sky, mist, snow drifts, embers and
 * three depths of falling snow. The background covers the window; effects use its coordinates.
 */
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { seededRandom } from './las-noches-art'

export const LAS_NOCHES_BACKGROUND = '/assets/reborn/las-noches/background.webp'
export const ART_WIDTH = 1920
export const ART_HEIGHT = 1080

const x = (value: number) => `${((value / ART_WIDTH) * 100).toFixed(3)}cqw`
const y = (value: number) => `${((value / ART_HEIGHT) * 100).toFixed(3)}cqh`
/** A piece of the background art shown at its own place. */
const crop = (left: number, top: number, width: number, height: number): CSSProperties => ({
  left: x(left),
  top: y(top),
  width: x(width),
  height: y(height),
  backgroundPosition: `${x(-left)} ${y(-top)}`,
})

const MOON = { x: 525, y: 205 }
const MOON_BLOOM = crop(MOON.x - 95, MOON.y - 95, 190, 190)
const CLOUDS = [
  {
    src: { x: 820, y: 150, width: 420, height: 72 },
    atX: MOON.x - 470,
    atY: MOON.y + 2,
    duration: '84s',
    delay: '-30s',
  },
  {
    src: { x: 760, y: 70, width: 420, height: 150 },
    atX: 860,
    atY: 10,
    duration: '110s',
    delay: '-70s',
  },
]
const FLAKE_DEPTHS = [
  { name: 'far', count: 9, size: [1.1, 1.8], speed: [34, 46], sway: [3.2, 4.6], opacity: [0.6, 1] },
  { name: 'mid', count: 6, size: [2, 3], speed: [20, 27], sway: [2.4, 3.4], opacity: [0.65, 1] },
  { name: 'near', count: 3, size: [7, 10], speed: [11, 15], sway: [1.8, 2.6], opacity: [0.7, 1] },
] as const
const FLAKES = (() => {
  const random = seededRandom(3101)
  const between = ([low, high]: readonly [number, number]) => low + random() * (high - low)
  return FLAKE_DEPTHS.flatMap((depth) =>
    Array.from({ length: depth.count }, () => {
      const speed = between(depth.speed)
      const sway = between(depth.sway)
      return {
        depth: depth.name,
        left: `${(95 * random() - 12).toFixed(2)}%`,
        top: `${(62 * random() - 8).toFixed(2)}%`,
        size: +between(depth.size).toFixed(1),
        duration: `${speed.toFixed(1)}s`,
        delay: `${(-random() * speed).toFixed(1)}s`,
        sway: `${sway.toFixed(1)}s`,
        swayDelay: `${(-random() * sway).toFixed(1)}s`,
        opacity: +between(depth.opacity).toFixed(2),
      }
    }),
  )
})()
const SPINDRIFTS = [
  { x: 560, y: 560, width: 300, duration: '13s', delay: '-2s' },
  { x: 1180, y: 585, width: 340, duration: '17s', delay: '-9s' },
  { x: 170, y: 700, width: 380, duration: '15s', delay: '-6s' },
]
const EMBERS = [
  { x: 930, y: 470, duration: '9s', delay: '-1s' },
  { x: 1010, y: 462, duration: '11s', delay: '-6s' },
  { x: 965, y: 480, duration: '13s', delay: '-9s' },
  { x: 1050, y: 476, duration: '10s', delay: '-4s' },
]

function SceneFx({ art }: { art: string }) {
  return (
    <div
      className="lnfx"
      aria-hidden="true"
      data-testid="las-noches-scene-fx"
      style={
        {
          '--lnfx-art': `url(${art})`,
          inset: 0,
          width: '100%',
          aspectRatio: 'auto',
        } as CSSProperties
      }
    >
      <span className="lnfx-art lnfx-moon-bloom" style={MOON_BLOOM} />
      {CLOUDS.map((cloud, index) => (
        <span
          key={index}
          className={`lnfx-art lnfx-cloud lnfx-cloud--${index}`}
          style={{
            ...crop(cloud.src.x, cloud.src.y, cloud.src.width, cloud.src.height),
            left: x(cloud.atX),
            top: y(cloud.atY),
            animationDuration: cloud.duration,
            animationDelay: cloud.delay,
          }}
        />
      ))}
      <span className="lnfx-sheen" />
      <span className="lnfx-mist lnfx-mist--far" />
      <span className="lnfx-mist lnfx-mist--near" />
      {SPINDRIFTS.map((drift, index) => (
        <span
          key={index}
          className="lnfx-spindrift"
          style={{
            left: x(drift.x),
            top: y(drift.y),
            width: x(drift.width),
            animationDuration: drift.duration,
            animationDelay: drift.delay,
          }}
        />
      ))}
      {EMBERS.map((ember, index) => (
        <span
          key={index}
          className="lnfx-ember"
          style={{
            left: x(ember.x),
            top: y(ember.y),
            animationDuration: ember.duration,
            animationDelay: ember.delay,
          }}
        />
      ))}
      {FLAKES.map((flake, index) => (
        <span
          key={index}
          className={`lnfx-flake lnfx-flake--${flake.depth}`}
          style={{
            left: flake.left,
            top: flake.top,
            animationDuration: flake.duration,
            animationDelay: flake.delay,
          }}
        >
          <i
            style={{
              width: flake.size,
              height: flake.size,
              opacity: flake.opacity,
              animationDuration: flake.sway,
              animationDelay: flake.swayDelay,
            }}
          />
        </span>
      ))}
    </div>
  )
}

/** Window size, kept current on resize. */
export function useViewport() {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight })
  const [size, setSize] = useState(read)
  useEffect(() => {
    const onResize = () => setSize(read())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

/** Where the background art sits when it covers a width x height window. */
export function artBox(width: number, height: number) {
  const scale = Math.max(width / ART_WIDTH, height / ART_HEIGHT)
  return {
    scale,
    left: (width - ART_WIDTH * scale) / 2,
    top: (height - ART_HEIGHT * scale) / 2,
    width: ART_WIDTH * scale,
    height: ART_HEIGHT * scale,
  }
}

/** The background art with its motion. */
export function LasNochesScene({ onLoad }: { onLoad?: () => void }) {
  const viewport = useViewport()
  const box = artBox(viewport.width, viewport.height)
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      <img
        src={LAS_NOCHES_BACKGROUND}
        alt=""
        className="absolute inset-0 size-full"
        onLoad={onLoad}
        onError={onLoad}
      />
      <SceneFx art={LAS_NOCHES_BACKGROUND} />
    </div>
  )
}
