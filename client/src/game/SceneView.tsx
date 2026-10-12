import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage, useFight, useScene } from './api'
import { FightSummary } from './FightSummary'
import { GameButton, Notice } from './skin'
import { BattleReplayMount, ScenePictureMount } from './stage'
import { plainText } from './text'
import type { FightResult, SceneMonster, SceneNpc } from './types'

/**
 * The scene layer of the stage: the Phaser picture filling the screen (buildings, NPCs, the
 * monster row), the same actions as a keyboard list that appears when focused, and the fight
 * flow (replay, then the result window).
 */
export function SceneView({
  character,
  onNpc,
}: {
  character: Character
  onNpc: (npc: SceneNpc) => void
}) {
  const scene = useScene()
  const fight = useFight()
  const [fightState, setFightState] = useState<{
    result: FightResult
    monster: SceneMonster
    /** Bumped by "Watch again" to restart the replay. */
    run: number
    finished: boolean
  } | null>(null)

  const startFight = async (monster: SceneMonster) => {
    try {
      const result = await fight.mutateAsync(monster.id)
      setFightState({ result, monster, run: 0, finished: false })
    } catch {
      // shown from fight.error below
    }
  }

  return (
    <>
      {scene.data && <ScenePictureMount scene={scene.data} onNpc={onNpc} onMonster={startFight} />}
      {/* Keyboard and screen-reader access to the picture: hidden until it has the focus. */}
      <div className="pointer-events-auto absolute top-[150px] left-1 z-10 w-[300px]">
        <section aria-label="Scene actions" className="sr-only focus-within:not-sr-only">
          <div className="game-hud flex flex-col gap-3 p-2 font-game text-xs">
            {scene.isError && <Notice tone="error">{errorMessage(scene.error)}</Notice>}
            {scene.data && (
              <>
                <section aria-labelledby="scene-people">
                  <h3 id="scene-people" className="mb-1 font-bold text-trim">
                    People and buildings
                  </h3>
                  {scene.data.npcs.length === 0 ? (
                    <p>Nobody is around.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {scene.data.npcs.map((target) => (
                        <li key={target.id}>
                          <GameButton small onClick={() => onNpc(target)}>
                            {plainText(target.nameKey, 'Villager')}
                          </GameButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-labelledby="scene-monsters">
                  <h3 id="scene-monsters" className="mb-1 font-bold text-trim">
                    Monsters
                  </h3>
                  {scene.data.monsters.length === 0 ? (
                    <p>No monsters here. Villages are safe.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {scene.data.monsters.map((monster) => (
                        <li key={monster.id}>
                          <GameButton
                            small
                            disabled={fight.isPending}
                            aria-label={`Fight ${plainText(monster.nameKey, 'monster')}`}
                            onClick={() => startFight(monster)}
                          >
                            {plainText(monster.nameKey, 'Monster')} Lv. {monster.level}
                          </GameButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </section>
        {/* Fight errors are shown even when the list is hidden (the picture starts fights too). */}
        {fight.isError && <Notice tone="error">{errorMessage(fight.error)}</Notice>}
      </div>
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
    </>
  )
}
