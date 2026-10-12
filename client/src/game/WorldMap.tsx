import type { Character } from '@pockie/shared'
import { errorMessage, useTravel } from './api'
import { Dialog, Notice } from './skin'
import { plainText } from './text'
import { DEFEATED_REASON, destinations, isDefeated, isVillage, sceneNameKey } from './world'

/**
 * World map window: the places reachable from here as a list on a parchment map.
 * ponytail: a list; the original's picture map is a later task.
 */
export function WorldMap({ character, onClose }: { character: Character; onClose: () => void }) {
  const travel = useTravel()
  const places = destinations(character)
  const defeated = isDefeated(character)
  const groups = [
    { title: 'Villages', places: places.filter((p) => isVillage(p.sceneId)) },
    { title: 'Areas', places: places.filter((p) => !isVillage(p.sceneId)) },
  ].filter((group) => group.places.length > 0)

  const go = async (sceneId: number) => {
    try {
      await travel.mutateAsync(sceneId)
      onClose()
    } catch {
      // shown from travel.error below
    }
  }

  return (
    <Dialog title="World Map" onClose={onClose} className="w-[44rem]">
      <div className="game-map flex flex-col gap-3 p-3">
        {travel.isError && <Notice tone="error">{errorMessage(travel.error)}</Notice>}
        {defeated && <Notice tone="error">{DEFEATED_REASON} You cannot travel until then.</Notice>}
        {groups.length === 0 && <p>There is no road out of here.</p>}
        {groups.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="mb-1 text-xs font-bold tracking-widest text-[#5a3a12] uppercase">
              {group.title}
            </h3>
            <ul className="grid grid-cols-3 gap-1.5">
              {group.places.map((place) => {
                const name = plainText(sceneNameKey(place.sceneId), `Area ${place.sceneId}`)
                const locked = !place.open && place.level > character.level
                return (
                  <li key={place.sceneId}>
                    <button
                      type="button"
                      disabled={!place.open || defeated || travel.isPending}
                      onClick={() => go(place.sceneId)}
                      className="game-map-pin flex w-full items-center justify-between gap-1 px-2 py-1 text-left text-xs font-bold"
                    >
                      <span>{name}</span>
                      {locked && (
                        <span className="font-normal whitespace-nowrap">Lv. {place.level}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
