import type { Character } from '@pockie/shared'
import { useState, type CSSProperties, type MouseEvent } from 'react'
import { gameWorldMap } from '../generated/game-extra'
import { errorMessage, useTravel } from './api'
import { Dialog, Notice } from './skin'
import { plainText } from './text'
import { DEFEATED_REASON, destinations, isDefeated, isVillage, sceneNameKey } from './world'
import { locationAt, percentBox, toPainting, type MapRect } from './world-map'

const { width: MAP_WIDTH, height: MAP_HEIGHT, locations } = gameWorldMap
const onPainting = (sceneId: number) => Object.hasOwn(locations, String(sceneId))
const sceneName = (sceneId: number) => plainText(sceneNameKey(sceneId), `Area ${sceneId}`)

/**
 * Where a place's English label sits: villages at the bottom edge inside their rectangle, fields
 * just above theirs, so neighbouring village and field labels do not cover each other.
 */
function labelStyle(sceneId: number, r: MapRect): CSSProperties {
  return {
    left: `${((r.x + r.width / 2) / MAP_WIDTH) * 100}%`,
    top: `${((isVillage(sceneId) ? r.y + r.height : r.y) / MAP_HEIGHT) * 100}%`,
    transform: 'translate(-50%, -100%)',
  }
}

/**
 * World map window: the original text-free painting with its places (the villages and their first
 * fields) and the other roads from here as a list. Clicks on the painting hit-test the original
 * button rectangles; the labels are buttons for the keyboard. Travel rules stay on the server:
 * `destinations` only mirrors them to decide what to offer.
 */
export function WorldMap({ character, onClose }: { character: Character; onClose: () => void }) {
  const travel = useTravel()
  const defeated = isDefeated(character)
  const roads = new Map(destinations(character).map((place) => [place.sceneId, place]))
  const others = [...roads.keys()].filter((sceneId) => !onPainting(sceneId))
  const [hover, setHover] = useState<number>()

  const canGo = (sceneId: number) =>
    !defeated && !travel.isPending && sceneId !== character.sceneId && !!roads.get(sceneId)?.open

  const go = async (sceneId: number) => {
    try {
      await travel.mutateAsync(sceneId)
      onClose()
    } catch {
      // shown from travel.error below
    }
  }

  const placeAt = (event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const { x, y } = toPainting(event.clientX, event.clientY, box)
    return locationAt(locations, x, y)
  }

  const pin = (sceneId: number, className: string, style?: CSSProperties) => {
    const road = roads.get(sceneId)
    const level = road && !road.open && road.level > character.level ? ` Lv. ${road.level}` : ''
    const here = sceneId === character.sceneId
    return (
      <button
        key={sceneId}
        type="button"
        disabled={!canGo(sceneId)}
        onClick={() => go(sceneId)}
        onMouseEnter={() => setHover(sceneId)}
        onMouseLeave={() => setHover(undefined)}
        onFocus={() => setHover(sceneId)}
        onBlur={() => setHover(undefined)}
        className={`game-map-pin font-bold ${here ? 'bg-[#1b6e17]! text-white!' : ''} ${className}`}
        style={style}
      >
        {sceneName(sceneId)}
        {level}
        {here && ' (You are here)'}
      </button>
    )
  }

  const outline = (sceneId: number | undefined, className: string) => {
    const r = sceneId === undefined ? undefined : locations[String(sceneId)]
    return (
      r && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-md border-2 ${className}`}
          style={percentBox(r)}
        />
      )
    )
  }

  return (
    <Dialog title="World Map" onClose={onClose} className="w-[52rem]">
      <div className="flex flex-col gap-3">
        {travel.isError && <Notice tone="error">{errorMessage(travel.error)}</Notice>}
        {defeated && <Notice tone="error">{DEFEATED_REASON} You cannot travel until then.</Notice>}
        <div
          className="relative mx-auto w-full max-w-[768px] overflow-hidden rounded-sm bg-[#e2c27c] ring-3 ring-[#6b4a1e]"
          style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
        >
          <img
            src={gameWorldMap.file}
            alt=""
            draggable={false}
            className={`absolute inset-0 size-full ${hover !== undefined && canGo(hover) ? 'cursor-pointer' : ''}`}
            onClick={(event) => {
              const sceneId = placeAt(event)
              if (sceneId !== undefined && canGo(sceneId)) void go(sceneId)
            }}
            onMouseMove={(event) => setHover(placeAt(event))}
            onMouseLeave={() => setHover(undefined)}
          />
          {outline(character.sceneId, 'border-dashed border-[#1b6e17]')}
          {hover !== undefined &&
            canGo(hover) &&
            outline(hover, 'border-[#ffe27a] shadow-[0_0_10px_#ffe27a]')}
          {Object.entries(locations).map(([id, r]) =>
            pin(
              Number(id),
              'absolute z-10 px-1 text-[11px] leading-tight whitespace-nowrap',
              labelStyle(Number(id), r),
            ),
          )}
        </div>
        {others.length > 0 && (
          <section aria-label="Other areas">
            <h3 className="mb-1 text-xs font-bold tracking-widest text-[#5a3a12] uppercase">
              Other areas
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {others.map((sceneId) => pin(sceneId, 'w-full px-2 py-1 text-left text-xs'))}
            </div>
          </section>
        )}
      </div>
    </Dialog>
  )
}
