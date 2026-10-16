import { AreaLoading } from './AreaLoading'
import type { Character } from '@pockie/shared'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { errorMessage, useScene, useTravel } from './api'
import { GameButton, Notice } from './skin'
import { GameText, plainText } from './text'
import { DEFEATED_REASON, destinations, isDefeated, sceneNameKey } from './world'
import {
  HERE_DOT,
  MAP_ART,
  MAP_PIECES,
  MAP_SIZE,
  pieceBox,
  type MapPiece,
} from './world-map-places'

type Place = Pick<MapPiece, 'scene' | 'unavailable'>
type Lock = 'unavailable' | 'village' | 'level' | 'visit'
type Look = 'idle' | 'hover' | 'press'

const onPainting = new Set(MAP_PIECES.map((p) => p.scene))
const sceneName = (p: Place) => p.unavailable ?? plainText(sceneNameKey(p.scene), `Area ${p.scene}`)
const TIP_WIDTH = 300
const DOT_SIZE = 24 * 0.96
/** An art pixel this opaque belongs to its place (Reborn hit-tests pixel-perfect). */
const SOLID_ALPHA = 16

/**
 * Reborn's Phaser tints as CSS filters: locked places are multiplied by 0x666666 (0x999999 under
 * the pointer), an open place under the pointer by 0xCC6666 and pressed by 0xAAAAAA.
 */
function tint(locked: boolean, look: Look) {
  if (locked) return look === 'idle' ? 'brightness(0.4)' : 'brightness(0.6)'
  if (look === 'hover') return 'url(#world-map-hover)'
  if (look === 'press') return 'brightness(0.667)'
  return undefined
}

const inBox = (p: MapPiece, x: number, y: number) => {
  const box = pieceBox(p)
  return x >= box.left && y >= box.top && x < box.left + box.width && y < box.top + box.height
}

/**
 * The topmost place at a painting point, by the alpha of its art once loaded (boxes until then,
 * and where pixels cannot be read, like tests).
 */
function usePlaceAt() {
  const [alpha, setAlpha] = useState<Map<number, ImageData>>()
  useEffect(() => {
    if (typeof OffscreenCanvas === 'undefined') return
    let live = true
    Promise.all(
      MAP_PIECES.map(async (p) => {
        const image = new Image()
        image.src = `${MAP_ART}/locations/${p.art}.webp`
        await image.decode()
        const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight)
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        return [p.art, context.getImageData(0, 0, canvas.width, canvas.height)] as const
      }),
    )
      .then((rows) => {
        if (live) setAlpha(new Map(rows))
      })
      .catch(() => undefined) // the boxes stay the hit area
    return () => {
      live = false
    }
  }, [])
  return (x: number, y: number) =>
    MAP_PIECES.findLast((p) => {
      if (!inBox(p, x, y)) return false
      const data = alpha?.get(p.art)
      if (!data) return true
      const px = Math.floor((x - p.x) / p.scale)
      const py = Math.floor((y - p.y) / p.scale)
      return (data.data[(py * data.width + px) * 4 + 3] ?? 0) > SOLID_ALPHA
    })
}

/** Reborn's tooltip: the place name over the original text, 300 px wide, inside the painting. */
function MapTip({ piece, nation }: { piece: MapPiece; nation: number }) {
  const box = pieceBox(piece)
  const left = Math.min(
    Math.max(box.left + box.width / 2 - TIP_WIDTH / 2, 4),
    MAP_SIZE.width - TIP_WIDTH - 4,
  )
  const style: CSSProperties =
    box.top > MAP_SIZE.height * 0.4
      ? { left, bottom: MAP_SIZE.height - box.top + 4, width: TIP_WIDTH }
      : { left, top: box.top + box.height + 4, width: TIP_WIDTH }
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-[102] rounded-[3px] border-2 border-[#5c5c5c] bg-black/80 px-2 py-1 text-xs leading-snug text-[#00ffff]"
      style={style}
    >
      {piece.unavailable ? (
        <>
          <p className="font-bold text-[#fff67c]">{piece.unavailable}</p>
          <p className="text-[#ff6565]">This location is unavailable.</p>
        </>
      ) : (
        <GameText
          k={`lg_Tip_WorldMap_${piece.scene}_${nation}`}
          fallback={sceneName(piece)}
          tone="dark"
        />
      )}
    </div>
  )
}

/**
 * World map window like Pockie Ninja Reborn's (WorldMapScene): the grey painting with one coloured
 * piece per place. Places the ninja cannot enter (another village, its level, a place reached on
 * foot that was never entered (decision 7), or one this game does not have) are darkened and do
 * not travel; a level lock shows the level needed. The place the ninja stands in has a pulsing
 * dot. The pointer hits a place's art pixels, not its box; keyboard and screen readers use one
 * button per place. Travel rules stay on the server: this only decides what to offer.
 */
export function WorldMap({ character, onClose }: { character: Character; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const travel = useTravel()
  const scene = useScene().data
  const defeated = isDefeated(character)
  const roads = new Map(destinations(character).map((place) => [place.sceneId, place]))
  const others = [...roads.keys()].filter((sceneId) => !onPainting.has(sceneId))
  // Until the scene arrives only the place the ninja stands in is known to be entered.
  const visited = new Set(scene?.visitedScenes ?? [character.sceneId])
  const visitRequired = new Set(scene?.visitRequired ?? [])
  const [tip, setTip] = useState<number>()
  const [pointer, setPointer] = useState<{ scene: number; pressed: boolean }>()
  const placeAt = usePlaceAt()

  useEffect(() => {
    // Unmounting removes the element, which also ends the modal state; no close() needed.
    if (!ref.current?.open) ref.current?.showModal()
  }, [])

  /** Why the ninja cannot enter a place yet, whatever else is going on. */
  const lockOf = (p: Place): Lock | null => {
    if (p.unavailable) return 'unavailable'
    const road = roads.get(p.scene)
    if (!road) return 'village'
    if (!road.open) return 'level'
    if (visitRequired.has(p.scene) && !visited.has(p.scene)) return 'visit'
    return null
  }
  const canGo = (p: Place) =>
    !defeated && !travel.isPending && p.scene !== character.sceneId && lockOf(p) === null

  const go = async (p: Place) => {
    if (!canGo(p)) return
    try {
      await travel.mutateAsync({ sceneId: p.scene, via: 'map' })
      onClose()
    } catch {
      // shown from travel.error below
    }
  }

  /** Accessible name: the place, why it is locked and where the ninja is. */
  const label = (p: Place) => {
    const lock = lockOf(p)
    const reason =
      lock === 'level'
        ? ` Lv. ${roads.get(p.scene)!.level}`
        : lock === 'visit'
          ? ' (not visited yet)'
          : lock === 'unavailable'
            ? ' (unavailable)'
            : ''
    return `${sceneName(p)}${reason}${p.scene === character.sceneId ? ' (You are here)' : ''}`
  }

  const pointAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return placeAt(event.clientX - rect.left, event.clientY - rect.top)
  }
  const point = (p: MapPiece | undefined, pressed = false) => {
    setPointer(p && { scene: p.scene, pressed })
    setTip(p?.scene)
  }
  const pointed = MAP_PIECES.find((p) => p.scene === pointer?.scene)
  const tipped = MAP_PIECES.find((p) => p.scene === tip)
  const dot = HERE_DOT[character.sceneId]

  return (
    <dialog
      ref={ref}
      aria-label="World Map"
      onClose={onClose}
      className="game-window m-auto overflow-visible bg-transparent p-0 font-game backdrop:bg-black/25"
    >
      <svg aria-hidden="true" className="absolute size-0">
        <filter id="world-map-hover">
          <feColorMatrix values="0.8 0 0 0 0 0 0.4 0 0 0 0 0 0.4 0 0 0 0 0 1 0" />
        </filter>
      </svg>
      <div
        className={`relative select-none ${pointed && canGo(pointed) ? 'cursor-pointer' : ''}`}
        style={MAP_SIZE}
        onPointerMove={(event) => {
          const p = pointAt(event)
          if (p?.scene !== pointer?.scene) point(p, pointer?.pressed)
        }}
        onPointerLeave={() => point(undefined)}
        onPointerDown={(event) => point(pointAt(event), true)}
        onPointerUp={(event) => {
          const p = pointAt(event)
          const pressed = pointer?.pressed && p?.scene === pointer.scene
          point(p)
          if (p && pressed) void go(p)
        }}
      >
        <img
          src={`${MAP_ART}/map.webp`}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full"
        />
        {travel.isPending && <AreaLoading />}
        {/* First in the DOM so showModal focuses it, not a place (and its tooltip). */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          className="absolute top-[9px] right-[10px] z-[103] h-[22px] w-[25px] bg-(image:--up) bg-center bg-no-repeat hover:bg-(image:--over) active:bg-(image:--down) focus-visible:outline-2 focus-visible:outline-[#ffe27a]"
          style={
            {
              '--up': `url(${MAP_ART}/closeInactive.webp)`,
              '--over': `url(${MAP_ART}/closeHover.webp)`,
              '--down': `url(${MAP_ART}/closePressed.webp)`,
            } as CSSProperties
          }
        />
        {MAP_PIECES.map((p) => {
          const look: Look =
            pointer?.scene !== p.scene ? 'idle' : pointer.pressed && canGo(p) ? 'press' : 'hover'
          return (
            <img
              key={p.scene}
              src={`${MAP_ART}/locations/${p.art}.webp`}
              alt=""
              draggable={false}
              data-place={p.scene}
              className="pointer-events-none absolute max-w-none"
              style={{ ...pieceBox(p), filter: tint(lockOf(p) !== null, look) }}
            />
          )
        })}
        {dot && (
          <img
            src={`${MAP_ART}/world_location.webp`}
            alt=""
            draggable={false}
            className="world-map-here pointer-events-none absolute z-[101] max-w-none"
            style={{
              left: dot[0] - DOT_SIZE / 2,
              top: dot[1] - DOT_SIZE / 2,
              width: DOT_SIZE,
              height: DOT_SIZE,
            }}
          />
        )}
        {MAP_PIECES.map((p) => {
          const lock = lockOf(p)
          // Keyboard and screen-reader access; the pointer goes through to the painting.
          // Disabled places keep their tooltip (it says why), so aria-disabled, not disabled.
          return (
            <button
              key={p.scene}
              type="button"
              aria-disabled={!canGo(p)}
              aria-label={label(p)}
              data-locked={lock ?? undefined}
              onClick={() => void go(p)}
              onMouseEnter={() => setTip(p.scene)}
              onMouseLeave={() => setTip((t) => (t === p.scene ? undefined : t))}
              onFocus={() => setTip(p.scene)}
              onBlur={() => setTip((t) => (t === p.scene ? undefined : t))}
              className="pointer-events-none absolute focus-visible:outline-2 focus-visible:outline-[#ffe27a]"
              style={pieceBox(p)}
            >
              {lock === 'level' && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 left-1/2 -translate-1/2 rounded-[3px] bg-black/75 px-1 font-mono text-[10px] leading-[14px] whitespace-nowrap text-[#ffd700]"
                >
                  Lv. {roads.get(p.scene)!.level}
                </span>
              )}
            </button>
          )
        })}
        {tipped && <MapTip piece={tipped} nation={character.nation} />}
        {(travel.isError || defeated) && (
          <div className="absolute top-2 left-1/2 z-[103] w-80 -translate-x-1/2">
            {travel.isError && <Notice tone="error">{errorMessage(travel.error)}</Notice>}
            {defeated && (
              <Notice tone="error">{DEFEATED_REASON} You cannot travel until then.</Notice>
            )}
          </div>
        )}
      </div>
      {others.length > 0 && (
        <section aria-label="Other areas" className="mt-1 flex flex-wrap justify-center gap-1.5">
          {others.map((sceneId) => (
            <GameButton
              key={sceneId}
              small
              disabled={!canGo({ scene: sceneId })}
              onClick={() => void go({ scene: sceneId })}
            >
              {label({ scene: sceneId })}
            </GameButton>
          ))}
        </section>
      )}
    </dialog>
  )
}
