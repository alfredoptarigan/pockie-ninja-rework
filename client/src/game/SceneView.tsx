import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage, useFight, useScene, useTalk, useTravel } from './api'
import { FightSummary } from './FightSummary'
import { NpcDialog } from './NpcDialog'
import { GameButton, Notice, Panel } from './skin'
import { BattleReplayMount, ScenePictureMount } from './stage'
import { GameText, plainText } from './text'
import type { FightResult, SceneMonster, SceneNpc } from './types'
import { destinations, sceneNameKey } from './world'

export function SceneView({ character }: { character: Character }) {
  const scene = useScene()
  const talk = useTalk()
  const fight = useFight()
  const [npc, setNpc] = useState<SceneNpc | null>(null)
  const [fightState, setFightState] = useState<{
    result: FightResult
    monster: SceneMonster
    /** Bumped by "Watch again" to restart the replay. */
    run: number
    finished: boolean
  } | null>(null)

  const openNpc = (target: SceneNpc) => {
    setNpc(target)
    talk.mutate(target.id)
  }
  const startFight = async (monster: SceneMonster) => {
    try {
      const result = await fight.mutateAsync(monster.id)
      setFightState({ result, monster, run: 0, finished: false })
    } catch {
      // shown from fight.error below
    }
  }

  const title = scene.data ? plainText(scene.data.nameKey, 'Unknown place') : 'Loading...'
  return (
    <Panel title={title} className="min-h-0">
      {scene.isError && <Notice tone="error">{errorMessage(scene.error)}</Notice>}
      {scene.data && (
        <div className="flex flex-col gap-4">
          <ScenePictureMount scene={scene.data} onNpc={openNpc} onMonster={startFight} />
          <section aria-labelledby="scene-people">
            <h3 id="scene-people" className="mb-1 font-bold">
              People and buildings
            </h3>
            {scene.data.npcs.length === 0 ? (
              <p className="text-xs">Nobody is around.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {scene.data.npcs.map((target) => (
                  <li key={target.id}>
                    <GameButton small onClick={() => openNpc(target)}>
                      {plainText(target.nameKey, 'Villager')}
                    </GameButton>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="scene-monsters">
            <h3 id="scene-monsters" className="mb-1 font-bold">
              Monsters
            </h3>
            {fight.isError && <Notice tone="error">{errorMessage(fight.error)}</Notice>}
            {scene.data.monsters.length === 0 ? (
              <p className="text-xs">No monsters here. Villages are safe.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {scene.data.monsters.map((monster) => (
                  <li key={monster.id} className="flex flex-col gap-1 game-card p-2">
                    <span className="font-bold">
                      <GameText k={monster.nameKey} fallback="Monster" />
                    </span>
                    <span className="text-xs">Lv. {monster.level}</span>
                    <GameButton
                      small
                      disabled={fight.isPending}
                      aria-label={`Fight ${plainText(monster.nameKey, 'monster')}`}
                      onClick={() => startFight(monster)}
                    >
                      Fight
                    </GameButton>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <WorldMap character={character} />
        </div>
      )}
      {npc && (
        <NpcDialog npc={npc} talk={talk} character={character} onClose={() => setNpc(null)} />
      )}
      {fightState && (
        <BattleReplayMount
          key={fightState.run}
          replay={fightState.result.replay}
          clothing={character.clothing}
          monsterIds={[fightState.monster.id]}
          sceneId={character.sceneId}
          onFinished={() => setFightState((s) => s && { ...s, finished: true })}
        />
      )}
      {fightState?.finished && (
        <FightSummary
          result={fightState.result}
          onClose={() => setFightState(null)}
          onReplay={() => setFightState((s) => s && { ...s, run: s.run + 1, finished: false })}
          onFightAgain={() => {
            const { monster } = fightState
            setFightState(null)
            void startFight(monster)
          }}
        />
      )}
    </Panel>
  )
}

function WorldMap({ character }: { character: Character }) {
  const travel = useTravel()
  const places = destinations(character)
  return (
    <section aria-labelledby="scene-travel">
      <h3 id="scene-travel" className="mb-1 font-bold">
        Travel
      </h3>
      {travel.isError && <Notice tone="error">{errorMessage(travel.error)}</Notice>}
      <ul className="flex flex-wrap gap-1.5">
        {places.map((place) => (
          <li key={place.sceneId}>
            <GameButton
              small
              disabled={!place.open || travel.isPending}
              onClick={() => travel.mutate(place.sceneId)}
            >
              {plainText(sceneNameKey(place.sceneId), `Area ${place.sceneId}`)}
              {!place.open && place.level > character.level && ` (Lv. ${place.level})`}
            </GameButton>
          </li>
        ))}
      </ul>
    </section>
  )
}
