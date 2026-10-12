import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage, useFight, useInventory, useScene } from './api'
import { FightSummary } from './FightSummary'
import { DropsMenu } from './MonsterDrops'
import { ReviveWindow } from './ReviveWindow'
import { Dialog, GameButton, Notice } from './skin'
import { BattleReplayMount, ScenePictureMount } from './stage'
import { plainText } from './text'
import type { BagHighlight, FightResult, SceneMonster, SceneNpc } from './types'
import { DEFEATED_REASON, isDefeated } from './world'

/**
 * The scene layer of the stage: the Phaser picture filling the screen (buildings, NPCs, the
 * monster row), the same actions as a keyboard list that appears when focused, and the fight
 * flow (replay, then the result window). While the ninja is defeated it offers the revive
 * window instead of fights.
 */
export function SceneView({
  character,
  onNpc,
  onOpenBag = () => {},
}: {
  character: Character
  onNpc: (npc: SceneNpc) => void
  /** Opens the bag (from the no-weapon warning) pointing at the weapons. */
  onOpenBag?: (highlight: BagHighlight) => void
}) {
  const scene = useScene()
  const fight = useFight()
  const inventory = useInventory()
  const defeated = isDefeated(character)
  const [reviveOpen, setReviveOpen] = useState(true)
  /** A monster picked while no weapon is equipped, waiting for "Fight anyway". */
  const [unarmed, setUnarmed] = useState<SceneMonster | null>(null)
  const [unarmedOk, setUnarmedOk] = useState(false)
  const [refused, setRefused] = useState(false)
  const [fightState, setFightState] = useState<{
    result: FightResult
    monster: SceneMonster
    /** Weapon equipped when the fight started; the replay draws it. */
    weaponItemId?: string
    /** Bumped by "Watch again" to restart the replay. */
    run: number
    finished: boolean
  } | null>(null)

  const weapon = inventory.data?.find((item) => item.equippedSlot === 'Weapon')
  const hasWeapon = !inventory.data || !!weapon

  const startFight = async (monster: SceneMonster, confirmed = unarmedOk) => {
    if (defeated) {
      setRefused(true)
      setReviveOpen(true)
      return
    }
    if (!hasWeapon && !confirmed) {
      setUnarmed(monster)
      return
    }
    try {
      const result = await fight.mutateAsync(monster.id)
      setFightState({ result, monster, weaponItemId: weapon?.itemId, run: 0, finished: false })
      setRefused(false)
      if (!result.won) setReviveOpen(true)
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
                        <li key={monster.id} className="flex flex-wrap gap-1">
                          <GameButton
                            small
                            disabled={fight.isPending || defeated}
                            title={defeated ? DEFEATED_REASON : undefined}
                            aria-label={`Fight ${plainText(monster.nameKey, 'monster')}`}
                            onClick={() => startFight(monster)}
                          >
                            {plainText(monster.nameKey, 'Monster')} Lv. {monster.level}
                          </GameButton>
                          <DropsMenu monster={monster} />
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
        {defeated && refused && <Notice tone="error">{DEFEATED_REASON}</Notice>}
        {defeated && !fightState && !reviveOpen && (
          <div className="game-hud mt-1 flex items-center gap-2 p-1.5 font-game text-xs">
            <span>You were defeated.</span>
            <GameButton small onClick={() => setReviveOpen(true)}>
              Revive
            </GameButton>
          </div>
        )}
      </div>
      {fightState && (
        <BattleReplayMount
          key={fightState.run}
          replay={fightState.result.replay}
          clothing={character.clothing}
          monsterIds={[fightState.monster.id]}
          sceneId={character.sceneId}
          weaponItemId={fightState.weaponItemId}
          onFinished={() => setFightState((s) => s && { ...s, finished: true })}
        />
      )}
      {fightState?.finished && (
        <FightSummary
          result={fightState.result}
          onClose={() => setFightState(null)}
          onReplay={() => setFightState((s) => s && { ...s, run: s.run + 1, finished: false })}
          onFightAgain={
            defeated || fightState.result.character.hp <= 0
              ? undefined
              : () => {
                  const { monster } = fightState
                  setFightState(null)
                  void startFight(monster)
                }
          }
        />
      )}
      {/* After the replay and its result window, so the defeat is seen first. */}
      {defeated && !fightState && reviveOpen && (
        <ReviveWindow
          character={character}
          terms={scene.data?.revive}
          onClose={() => setReviveOpen(false)}
        />
      )}
      {unarmed && (
        <Dialog title="No weapon equipped" onClose={() => setUnarmed(null)} className="w-[28rem]">
          <p>
            You have no weapon equipped, so your attacks will barely scratch a monster. Equip a
            weapon from your bag first.
          </p>
          <div className="mt-3 flex gap-2">
            <GameButton
              small
              onClick={() => {
                setUnarmed(null)
                onOpenBag({ equipment: true })
              }}
            >
              Open Bag
            </GameButton>
            <GameButton
              small
              onClick={() => {
                const monster = unarmed
                setUnarmed(null)
                setUnarmedOk(true)
                void startFight(monster, true)
              }}
            >
              Fight anyway
            </GameButton>
          </div>
        </Dialog>
      )}
    </>
  )
}
