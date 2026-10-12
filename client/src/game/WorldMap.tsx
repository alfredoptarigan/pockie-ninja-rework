import type { Character } from '@pockie/shared'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { gameWorldMap, type MapButtonArt } from '../generated/game-extra'
import { errorMessage, useTravel } from './api'
import { GameButton, Notice } from './skin'
import { GameText, plainText } from './text'
import { DEFEATED_REASON, destinations, isDefeated, sceneNameKey } from './world'

const { width: MAP_WIDTH, height: MAP_HEIGHT, locations, close } = gameWorldMap
const onPainting = (sceneId: number) => Object.hasOwn(locations, String(sceneId))
const sceneName = (sceneId: number) => plainText(sceneNameKey(sceneId), `Area ${sceneId}`)
const TIP_WIDTH = 240
// Place buttons stack by Flash depth (up to 70); the glow, tooltip and close button go above.

type Rect = Pick<MapButtonArt, 'x' | 'y' | 'width' | 'height'>
const box = (art: Rect, origin = { x: 0, y: 0 }): CSSProperties => ({
  left: art.x - origin.x,
  top: art.y - origin.y,
  width: art.width,
  height: art.height,
})

/** The original tooltip (MulTipFrame): under the place, kept inside the painting. */
function MapTip({ sceneId, nation }: { sceneId: number; nation: number }) {
  const r = locations[String(sceneId)]
  if (!r) return null
  const left = Math.min(Math.max(r.x + r.width / 2 - TIP_WIDTH / 2, 4), MAP_WIDTH - TIP_WIDTH - 4)
  const below = r.y + r.height + 4
  const style: CSSProperties =
    below > MAP_HEIGHT * 0.7
      ? { left, bottom: MAP_HEIGHT - r.y + 4, width: TIP_WIDTH }
      : { left, top: below, width: TIP_WIDTH }
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-[102] rounded-[3px] border-2 border-[#5c5c5c] bg-black/80 px-2 py-1 text-xs leading-snug text-[#00ffff]"
      style={style}
    >
      <GameText
        k={`lg_Tip_WorldMap_${sceneId}_${nation}`}
        fallback={sceneName(sceneId)}
        tone="dark"
      />
    </div>
  )
}

/**
 * World map window as in WorldMapFrame.as: the original 768x426 movie clip centred on the stage,
 * no labels on the painting. Each place is its coloured button art (up/over/down); hovering or
 * focusing one shows the original tooltip (Tip_WorldMap_<scene>_<nation>), the place the ninja
 * stands in glows (face_<scene>). Buttons stack by their Flash depth, so overlaps go to the higher
 * one. Travel rules stay on the server: `destinations` only mirrors them to decide what to offer.
 */
export function WorldMap({ character, onClose }: { character: Character; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const travel = useTravel()
  const defeated = isDefeated(character)
  const roads = new Map(destinations(character).map((place) => [place.sceneId, place]))
  const others = [...roads.keys()].filter((sceneId) => !onPainting(sceneId))
  const [tip, setTip] = useState<number>()

  useEffect(() => {
    // Unmounting removes the element, which also ends the modal state; no close() needed.
    if (!ref.current?.open) ref.current?.showModal()
  }, [])

  const canGo = (sceneId: number) =>
    !defeated && !travel.isPending && sceneId !== character.sceneId && !!roads.get(sceneId)?.open

  const go = async (sceneId: number) => {
    if (!canGo(sceneId)) return
    try {
      await travel.mutateAsync(sceneId)
      onClose()
    } catch {
      // shown from travel.error below
    }
  }

  /** Accessible name: the place, its level lock and where the ninja is. */
  const label = (sceneId: number) => {
    const road = roads.get(sceneId)
    const level = road && !road.open && road.level > character.level ? ` Lv. ${road.level}` : ''
    return `${sceneName(sceneId)}${level}${sceneId === character.sceneId ? ' (You are here)' : ''}`
  }

  const here = locations[String(character.sceneId)]
  return (
    <dialog
      ref={ref}
      aria-label="World Map"
      onClose={onClose}
      className="game-window m-auto overflow-visible bg-transparent p-0 font-game backdrop:bg-black/25"
    >
      <div className="relative select-none" style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}>
        <img
          src={gameWorldMap.file}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full"
        />
        {/* First in the DOM so showModal focuses it, not a place (and its tooltip). */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute z-[103] bg-(image:--up) bg-no-repeat hover:bg-(image:--over) active:bg-(image:--down) focus-visible:outline-2 focus-visible:outline-[#ffe27a]"
          style={
            {
              ...box(close.over),
              '--up': `url(${close.up.file})`,
              '--over': `url(${close.over.file})`,
              '--down': `url(${close.down.file})`,
              backgroundPosition: 'center',
            } as CSSProperties
          }
        />
        {Object.entries(locations).map(([id, r]) => {
          const sceneId = Number(id)
          const open = canGo(sceneId)
          // Disabled places keep their tooltip (it says why), so aria-disabled, not disabled.
          return (
            <button
              key={id}
              type="button"
              aria-disabled={!open}
              aria-label={label(sceneId)}
              onClick={() => void go(sceneId)}
              onMouseEnter={() => setTip(sceneId)}
              onMouseLeave={() => setTip((t) => (t === sceneId ? undefined : t))}
              onFocus={() => setTip(sceneId)}
              onBlur={() => setTip((t) => (t === sceneId ? undefined : t))}
              className={`group absolute focus-visible:outline-2 focus-visible:outline-[#ffe27a] ${open ? 'cursor-pointer' : 'cursor-default'}`}
              style={{ ...box(r), zIndex: r.depth }}
            >
              <img
                src={r.states.up.file}
                alt=""
                draggable={false}
                className="absolute max-w-none group-hover:invisible group-focus-visible:invisible"
                style={box(r.states.up, r)}
              />
              <img
                src={r.states.over.file}
                alt=""
                draggable={false}
                className={`invisible absolute max-w-none group-hover:visible group-focus-visible:visible ${open ? 'group-active:invisible' : ''}`}
                style={box(r.states.over, r)}
              />
              {open && (
                <img
                  src={r.states.down.file}
                  alt=""
                  draggable={false}
                  className="invisible absolute max-w-none group-active:visible"
                  style={box(r.states.down, r)}
                />
              )}
            </button>
          )
        })}
        {here && (
          <img
            src={here.face.file}
            alt=""
            draggable={false}
            className="pointer-events-none absolute z-[101] max-w-none"
            style={box(here.face)}
          />
        )}
        {tip !== undefined && <MapTip sceneId={tip} nation={character.nation} />}
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
              disabled={!canGo(sceneId)}
              onClick={() => void go(sceneId)}
            >
              {label(sceneId)}
            </GameButton>
          ))}
        </section>
      )}
    </dialog>
  )
}
