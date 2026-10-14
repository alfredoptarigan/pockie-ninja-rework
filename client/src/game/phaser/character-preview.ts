import { useEffect, useRef } from 'react'
import wingsJson from '../../generated/reborn-wings.json'
import aurasJson from '../../generated/reborn-auras.json'
import type { MotionSheet } from '../../generated/game-assets'
import { useOutfitStand } from '../art'
import { fetchJsonOnce, frameAt } from './motion'

interface CosmeticAsset {
  atlas: string
  pages: string[]
  item: number
  offset?: number[]
  animations?: Record<string, number[]>
}
export interface CharacterCosmetics {
  wingSprite?: string
  wing?: string
  aura?: string
}
const wings = wingsJson as Record<string, CosmeticAsset>
const auras = aurasJson as Record<string, CosmeticAsset>

/** Accept sprite names or item ids from the character's equipped look. */
export function characterCosmetics(look: CharacterCosmetics) {
  const resolve = (catalog: Record<string, CosmeticAsset>, value?: string) =>
    value
      ? (catalog[value] ?? Object.values(catalog).find((asset) => String(asset.item) === value))
      : undefined
  return { wing: resolve(wings, look.wingSprite ?? look.wing), aura: resolve(auras, look.aura) }
}
interface AtlasFrame {
  filename: string
  frame: { x: number; y: number; w: number; h: number }
  sourceSize: { w: number; h: number }
  spriteSourceSize: { x: number; y: number }
}
interface Atlas {
  textures: { image: string; frames: AtlasFrame[] }[]
  meta?: { anchor?: { x: number; y: number }; fps?: number }
}
interface LoadedAtlas {
  data: Atlas
  pages: HTMLImageElement[]
}
const image = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const result = new Image()
    result.onload = () => resolve(result)
    result.onerror = reject
    result.src = url
  })
async function loadAtlas(asset?: CosmeticAsset): Promise<LoadedAtlas | undefined> {
  if (!asset) return undefined
  const data = await fetchJsonOnce<Atlas>(asset.atlas)
  if (!data) return undefined
  return { data, pages: await Promise.all(asset.pages.map(image)) }
}
type PageFrame = { frame: AtlasFrame; pageIndex: number }
const frameCache = new WeakMap<Atlas, Map<string, PageFrame[]>>()
/** The atlas frames under `prefix` in numeric order, sorted once per (atlas, prefix). */
export function sortedFrames(atlas: Atlas, prefix: string) {
  const byPrefix = frameCache.get(atlas) ?? new Map<string, PageFrame[]>()
  frameCache.set(atlas, byPrefix)
  const cached = byPrefix.get(prefix)
  if (cached) return cached
  const frames = atlas.textures
    .flatMap((page, pageIndex) =>
      page.frames
        .filter((frame) => frame.filename.startsWith(prefix))
        .map((frame) => ({ frame, pageIndex })),
    )
    .sort((a, b) => a.frame.filename.localeCompare(b.frame.filename, undefined, { numeric: true }))
  byPrefix.set(prefix, frames)
  return frames
}
function drawAtlas(
  context: CanvasRenderingContext2D,
  atlas: LoadedAtlas,
  prefix: string,
  elapsed: number,
  x: number,
  y: number,
) {
  const frames = sortedFrames(atlas.data, prefix)
  const current =
    frames[Math.floor((elapsed * (atlas.data.meta?.fps ?? 16.8)) / 1000) % frames.length]
  if (!current) return
  const { frame: value, pageIndex } = current
  const { frame, spriteSourceSize: trim } = value
  const anchor = atlas.data.meta?.anchor ?? { x: 0, y: 0 }
  context.drawImage(
    atlas.pages[pageIndex]!,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    x - anchor.x + trim.x,
    y - anchor.y + trim.y,
    frame.w,
    frame.h,
  )
}
function drawStand(
  context: CanvasRenderingContext2D,
  stand: MotionSheet,
  picture: HTMLImageElement,
  elapsed: number,
) {
  const frame = frameAt(stand.durations, (elapsed * 12) / 1000, true)
  context.drawImage(
    picture,
    (frame % stand.columns) * stand.frameWidth,
    Math.floor(frame / stand.columns) * stand.frameHeight,
    stand.frameWidth,
    stand.frameHeight,
    -stand.anchor.x,
    -stand.anchor.y,
    stand.frameWidth,
    stand.frameHeight,
  )
}

/** A private canvas loads only the equipped cosmetics and preserves the atlas trim and anchor. */
export function useCharacterPreview(clothing: number, look: CharacterCosmetics) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const stand = useOutfitStand(clothing)
  const { wing, aura } = characterCosmetics(look)
  useEffect(() => {
    if (!stand || !canvas.current || (!wing && !aura)) return
    let disposed = false
    let request = 0
    const context = canvas.current.getContext('2d')
    if (!context) return
    void Promise.all([image(stand.file), loadAtlas(wing), loadAtlas(aura)])
      .then(([body, wingArt, auraArt]) => {
        if (disposed) return
        const start = performance.now()
        const render = (now: number) => {
          if (disposed) return
          const elapsed = now - start
          context.clearRect(0, 0, 310, 180)
          context.save()
          context.translate(155, 155)
          context.scale(0.6, 0.6)
          if (auraArt) drawAtlas(context, auraArt, 'back/idle/', elapsed, 0, 0)
          if (wingArt && wing) {
            const offset = wing.offset ?? [0, 0]
            const pose = wing.animations?.['999'] ?? [0, 0]
            drawAtlas(
              context,
              wingArt,
              '999/',
              elapsed,
              (offset[0] ?? 0) + (pose[0] ?? 0),
              (offset[1] ?? 0) + (pose[1] ?? 0),
            )
          }
          drawStand(context, stand, body, elapsed)
          if (auraArt) drawAtlas(context, auraArt, 'front/idle/', elapsed, 0, 0)
          context.restore()
          request = requestAnimationFrame(render)
        }
        request = requestAnimationFrame(render)
      })
      .catch(() => {
        /* Missing cosmetic art leaves the existing stats window usable. */
      })
    return () => {
      disposed = true
      cancelAnimationFrame(request)
    }
  }, [stand, wing, aura])
  return { canvas, visible: Boolean(wing || aura) }
}
