import type { Character } from '@pockie/shared'
import { useState, type CSSProperties } from 'react'
import { Navigate } from 'react-router'
import { errorMessage, useCharacter, useScene, useTalk, useTravel } from './api'
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
import { SceneView } from './SceneView'
import { Dialog, GameButton, Notice, useFitScale } from './skin'
import type { BagHighlight, SceneNpc } from './types'
import { destinations, isDefeated, isVillage, villageOf } from './world'
import { WorldMap } from './WorldMap'

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
  const [openWindow, setWindow] = useState<Window | null>(null)
  const [hudLayer, setHudLayer] = useState<HTMLDivElement | null>(null)
  const [npc, setNpc] = useState<SceneNpc | null>(null)
  const [bagHighlight, setBagHighlight] = useState<BagHighlight | undefined>()
  const close = () => setWindow(null)
  const open = (window: Window) => {
    setBagHighlight(undefined)
    setWindow(window)
  }
  const openBag = (highlight: BagHighlight) => {
    setNpc(null)
    setBagHighlight(highlight)
    setWindow('bag')
  }

  const openNpc = (target: SceneNpc) => {
    setWindow(null)
    setNpc(target)
    talk.mutate(target.id)
  }
  const inVillage = isVillage(character.sceneId)
  // "Village" goes home when the road is open; "Leave" (and a closed road) opens the map.
  const onVillage = () => {
    const home = villageOf(character.nation)
    const road = destinations(character).find((d) => d.sceneId === home)
    if (!inVillage && road?.open) travel.mutate(home)
    else setWindow('map')
  }

  return (
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
          {travel.isError && (
            <div className="pointer-events-auto absolute top-[88px] right-[6px] w-[168px]">
              <Notice tone="error">{errorMessage(travel.error)}</Notice>
            </div>
          )}
          <QuestNavigation
            character={character}
            scene={scene.data}
            onNpc={openNpc}
            onOpenBag={openBag}
          />
          <RealtimePanels characterId={character.id} />
          <ExpStrip character={character} />
          <MenuBar onOpen={open} />
        </div>
      </main>

      {openWindow === 'bag' && (
        <Dialog title="Inventory" onClose={close} className="w-[379px] px-[5px]! pb-[7px]!">
          <Inventory highlight={bagHighlight} />
        </Dialog>
      )}
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
    </div>
  )
}
