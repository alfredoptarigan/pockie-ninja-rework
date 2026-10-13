import type { Character } from '@pockie/shared'
import { useCallback, useState, type CSSProperties } from 'react'
import { Navigate } from 'react-router'
import { errorMessage, useCharacter, useScene, useTalk, useTravel } from './api'
import { SkillsWindow } from './SkillsWindow'
import { CharacterWindow } from './CharacterWindow'
import { RealtimePanels } from './Chat'
import { CreateCharacter } from './CreateCharacter'
import {
  ExpStrip,
  HudLayer,
  MenuBar,
  PlayerCard,
  ScenePlaque,
  TopBar,
  type MenuWindow,
} from './Hud'
import { Inventory } from './Inventory'
import { NpcDialog } from './NpcDialog'
import { QuestLog } from './QuestLog'
import { QuestNavigation } from './QuestNavigation'
import { SceneExits } from './SceneExits'
import { SceneView } from './SceneView'
import { Dialog, GameButton, Notice, useFitScale } from './skin'
import type { BagHighlight, SceneNpc } from './types'
import { isDefeated, isVillage } from './world'
import { FeatureWindow, OpenWindowProvider, type OpenWindow, type WindowName } from './windows'
import { WorldMap } from './WorldMap'
import { teamHudScene, useTeam } from './teams/api'

/** `/play` (the game) and `/play/create` (character creation); the account is already checked. */
export default function GameApp({ view }: { view: 'game' | 'create' }) {
  const character = useCharacter()
  if (character.isSuccess && character.data && view === 'game') {
    return <GameScreen character={character.data} />
  }
  return (
    <div
      data-game-ui
      className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#3a4044,#0c0e0f)] font-game text-parchment"
    >
      {character.isPending && <p className="p-6">Entering the village...</p>}
      {character.isError && (
        <div className="mx-auto max-w-md p-6">
          <Notice tone="error">{errorMessage(character.error)}</Notice>
          <GameButton className="mt-3" onClick={() => character.refetch()}>
            Try again
          </GameButton>
        </div>
      )}
      {character.isSuccess &&
        (character.data === null ? (
          view === 'create' ? (
            <CreateCharacter />
          ) : (
            <Navigate to="/play/create" replace />
          )
        ) : (
          <Navigate to="/play" replace />
        ))}
    </div>
  )
}

/**
 * The scene keeps the original 1280x720 stage, scaled to cover the window (explore and drop
 * overlays share it through --hud-scale). The HUD and windows draw 1:1 on top, anchored to the
 * window edges like the original client and Pockie Ninja Reborn.
 */
const STAGE = { width: 1280, height: 720 }

type Window = MenuWindow | 'map'

function GameScreen({ character }: { character: Character }) {
  const scale = useFitScale(STAGE.width, STAGE.height, 'cover')
  const scene = useScene()
  const talk = useTalk()
  const travel = useTravel()
  const team = useTeam(teamHudScene(character.sceneId))
  const [openWindow, setWindow] = useState<Window | null>(null)
  const [hudLayer, setHudLayer] = useState<HTMLDivElement | null>(null)
  const [npc, setNpc] = useState<SceneNpc | null>(null)
  const [bagHighlight, setBagHighlight] = useState<BagHighlight | undefined>()
  const [feature, setFeature] = useState<OpenWindow | null>(null)
  const close = () => setWindow(null)
  const open = (window: Window) => {
    setBagHighlight(undefined)
    setFeature(null)
    setWindow(window)
  }
  const openFeature = useCallback((name: WindowName, options: { npcId?: string } = {}) => {
    setNpc(null)
    setWindow(null)
    setFeature({ name, npcId: options.npcId })
  }, [])
  const openBag = (highlight: BagHighlight) => {
    setNpc(null)
    setBagHighlight(highlight)
    setWindow('bag')
  }

  const openNpc = (target: SceneNpc) => {
    setWindow(null)
    setFeature(null)
    setNpc(target)
    talk.mutate(target.id)
  }
  const inVillage = isVillage(character.sceneId)
  // SceneSystem.GoHome: "Village" uses the scene's ToScene (Angel City lands in Crossroads, as in
  // the original), else the home village; "Leave" goes out to the village's first field.
  const onVillage = () => travel.mutate({ via: inVillage ? 'out' : 'home' })

  return (
    <OpenWindowProvider value={openFeature}>
      <div
        data-game-ui
        className="h-[100dvh] w-screen overflow-hidden bg-black font-game text-parchment"
        style={{ '--hud-scale': scale } as CSSProperties}
      >
        <main aria-label="Game" className="relative size-full overflow-hidden">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: STAGE.width * scale, height: STAGE.height * scale }}
          >
            <HudLayer value={hudLayer}>
              <SceneView
                key={character.sceneId}
                character={character}
                onNpc={openNpc}
                onOpenBag={openBag}
              />
            </HudLayer>
          </div>
          {/* HUD overlay: only its widgets take the pointer; the rest goes to the picture. */}
          <div ref={setHudLayer} className="pointer-events-none absolute inset-0">
            <TopBar character={character} />
            <PlayerCard character={character} />
            <ScenePlaque
              sceneId={scene.data?.sceneId}
              inVillage={inVillage}
              defeated={isDefeated(character)}
              onVillage={onVillage}
              onWorldMap={() => open('map')}
            />
            <div className="pointer-events-none absolute top-[88px] right-[6px] flex w-[168px] flex-col items-end gap-1">
              {scene.data && (
                <SceneExits character={character} links={scene.data.links} travel={travel} />
              )}
              {travel.isError && (
                <div className="pointer-events-auto w-[168px]">
                  <Notice tone="error">{errorMessage(travel.error)}</Notice>
                </div>
              )}
            </div>
            <QuestNavigation
              character={character}
              scene={scene.data}
              onNpc={openNpc}
              onOpenBag={openBag}
            />
            <RealtimePanels characterId={character.id} inTeam={Boolean(team.data?.team)} />
            <ExpStrip character={character} />
            <MenuBar onOpen={open} />
          </div>
        </main>

        {openWindow === 'bag' && (
          <Dialog title="Inventory" onClose={close} className="w-[379px] px-[5px]! pb-[7px]!">
            <Inventory highlight={bagHighlight} />
          </Dialog>
        )}
        {openWindow === 'skills' && <SkillsWindow character={character} onClose={close} />}
        {openWindow === 'character' && <CharacterWindow character={character} onClose={close} />}
        {openWindow === 'quests' && (
          <Dialog title="Quest Log" onClose={close} className="w-[32rem]">
            <QuestLog onNpc={openNpc} />
          </Dialog>
        )}
        {openWindow === 'map' && <WorldMap character={character} onClose={close} />}
        {npc && (
          <NpcDialog npc={npc} talk={talk} character={character} onClose={() => setNpc(null)} />
        )}
        {feature && (
          <FeatureWindow open={feature} character={character} onClose={() => setFeature(null)} />
        )}
      </div>
    </OpenWindowProvider>
  )
}
