import type { Character } from '@pockie/shared'
import { useCallback, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  errorMessage,
  gameKeys,
  useApplyResult,
  useExplore,
  useFight,
  useInventory,
  useScene,
} from './api'
import { exploreClip } from './explore'
import { ExploreWindow } from './ExploreWindow'
import { FightSummary } from './FightSummary'
import { HudLayer } from './Hud'
import { DropsMenu, lockReason, MonsterRow } from './MonsterDrops'
import { ReviveWindow } from './ReviveWindow'
import { TicketBossPanel } from './TicketBoss'
import { Dialog, GameButton, Notice } from './skin'
import { BattleReplayMount, ScenePictureMount } from './stage'
import { plainText } from './text'
import type { BagHighlight, FightResult, SceneMonster, SceneNpc } from './types'
import { useOpenWindow } from './windows'
import { DEFEATED_REASON, isDefeated } from './world'

/** Scenes with a pub fight line-up (`pub-fights.json` scenes): the neutral fields 26xx-28xx. */
const PUB_FIGHT_SCENES = [
  2601, 2602, 2603, 2604, 2605, 2701, 2702, 2703, 2704, 2801, 2802, 2803, 2804,
]

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
  const openWindow = useOpenWindow()
  const hasSpots = Boolean(scene.data?.exploreSpots.length)
  // The picture waits for the spots, so the explore tree is there from the start.
  const explore = useExplore(hasSpots)
  const pictureReady = !hasSpots || !explore.isPending
  const hudLayer = useContext(HudLayer)
  const [reviveOpen, setReviveOpen] = useState(true)
  /** A monster picked while no weapon is equipped, waiting for "Fight anyway". */
  const [unarmed, setUnarmed] = useState<SceneMonster | null>(null)
  const [unarmedOk, setUnarmedOk] = useState(false)
  const [refused, setRefused] = useState(false)
  const [exploring, setExploring] = useState(false)
  const [fightState, setFightState] = useState<{
    result: FightResult
    monster: SceneMonster
    /** Weapon equipped when the fight started; the replay draws it. */
    weaponItemId?: string
    /** Bumped by "Watch again" to restart the replay. */
    run: number
    finished: boolean
    /** The result reached the HUD (after the first replay). */
    applied: boolean
  } | null>(null)
  const applyResult = useApplyResult()
  const queryClient = useQueryClient()
  const refetchScene = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: gameKeys.scene }),
    [queryClient],
  )
  const ticketBoss = scene.data?.ticketBoss
  // The HUD keeps its pre-fight values while the replay plays (or until it is skipped).
  const finishReplay = () => {
    if (fightState && !fightState.applied) applyResult(fightState.result)
    setFightState((s) => s && { ...s, finished: true, applied: true })
  }

  const weapon = inventory.data?.find((item) => item.equippedSlot === 'Weapon')
  const hasWeapon = !inventory.data || !!weapon

  const startFight = async (monster: SceneMonster, confirmed = unarmedOk) => {
    if (monster.lock) return
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
      setFightState({
        result,
        monster,
        weaponItemId: weapon?.itemId,
        run: 0,
        finished: false,
        applied: false,
      })
      setRefused(false)
      if (!result.won) setReviveOpen(true)
    } catch {
      // shown from fight.error below
    }
  }

  return (
    <>
      {scene.data && pictureReady && (
        <ScenePictureMount
          scene={scene.data}
          exploreClip={exploreClip(explore.data?.spots)}
          onNpc={onNpc}
          onExplore={() => setExploring(true)}
          onBuilding={(clip) => openWindow(clip === 'clip_pet' ? 'pets' : 'cardRoom')}
        />
      )}
      {scene.data &&
        pictureReady &&
        hudLayer &&
        createPortal(
          <>
            <MonsterRow monsters={scene.data.monsters} onFight={(m) => void startFight(m)} />
            <div className="absolute top-[120px] left-[6px] flex flex-col items-start gap-1">
              {PUB_FIGHT_SCENES.includes(character.sceneId) && (
                <GameButton small disabled={defeated} onClick={() => openWindow('pubFight')}>
                  Pub Fight
                </GameButton>
              )}
              {ticketBoss && (
                <TicketBossPanel
                  boss={ticketBoss}
                  disabled={fight.isPending || defeated}
                  onExpire={refetchScene}
                  onFight={() =>
                    void startFight({
                      id: ticketBoss.id,
                      nameKey: ticketBoss.nameKey,
                      level: ticketBoss.level,
                    })
                  }
                />
              )}
            </div>
          </>,
          hudLayer,
        )}
      <ExploreWindow
        character={character}
        scene={scene.data}
        open={exploring}
        onOpenChange={setExploring}
      />
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
                            disabled={fight.isPending || defeated || Boolean(monster.lock)}
                            title={defeated ? DEFEATED_REASON : lockReason(monster)}
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
          onFinished={finishReplay}
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
