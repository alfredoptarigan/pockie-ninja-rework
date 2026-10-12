// Scene exits (scenequeue.ini links): the roads out of the current scene, under the scene plaque.
// They travel with SceneSystem.CanSwitchScene rules (level, village); the server re-checks both.
import type { Character } from '@pockie/shared'
import type { useTravel } from './api'
import { GameButton } from './skin'
import { plainText } from './text'
import { destinations, isDefeated, sceneNameKey } from './world'

export function SceneExits({
  character,
  links,
  travel,
}: {
  character: Character
  links: number[]
  /** GameApp's travel mutation, so its error shows under the plaque. */
  travel: ReturnType<typeof useTravel>
}) {
  if (links.length === 0) return null
  const places = new Map(destinations(character).map((place) => [place.sceneId, place]))
  const defeated = isDefeated(character)
  return (
    <nav
      aria-label="Exits"
      className="game-hud pointer-events-auto flex w-[139px] flex-col gap-1 p-1 font-game text-xs"
    >
      {links.map((sceneId) => {
        const place = places.get(sceneId)
        const name = plainText(sceneNameKey(sceneId), `Area ${sceneId}`)
        const reason = !place
          ? 'Only ninjas of that village may enter.'
          : !place.open
            ? `You need level ${place.level} to enter.`
            : undefined
        return (
          <GameButton
            key={sceneId}
            small
            className="w-full justify-start! truncate"
            disabled={defeated || travel.isPending || Boolean(reason)}
            title={reason ?? `Go to ${name}`}
            aria-label={`Go to ${name}${place && !place.open ? ` (Lv. ${place.level})` : ''}`}
            onClick={() => travel.mutate({ sceneId, via: 'link' })}
          >
            <span aria-hidden="true">&gt;</span> {name}
          </GameButton>
        )
      })}
    </nav>
  )
}
