import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { gameUi } from '../generated/game-ui'
import { Link, Navigate } from 'react-router'
import { useLogout } from '../lib/auth'
import { errorMessage, useCharacter } from './api'
import { CharacterPanel } from './CharacterPanel'
import { RealtimePanels } from './Chat'
import { CreateCharacter } from './CreateCharacter'
import { Inventory } from './Inventory'
import { QuestLog, QuestTracker } from './QuestLog'
import { SceneView } from './SceneView'
import { GameButton, Notice, Tabs } from './skin'

/** `/play` (the game) and `/play/create` (character creation); the account is already checked. */
export default function GameApp({ view }: { view: 'game' | 'create' }) {
  const character = useCharacter()
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
        ) : view === 'create' ? (
          <Navigate to="/play" replace />
        ) : (
          <GameScreen character={character.data} />
        ))}
    </div>
  )
}

type SideTab = 'quests' | 'bag'
const SIDE_TABS: { id: SideTab; title: string; icon: string }[] = [
  { id: 'quests', title: 'Quest log', icon: gameUi.pieces['icon-quests']!.file },
  { id: 'bag', title: 'Bag', icon: gameUi.pieces['icon-bag']!.file },
]

function GameScreen({ character }: { character: Character }) {
  const [tab, setTab] = useState<SideTab>('quests')
  const logout = useLogout()
  return (
    <div className="mx-auto grid max-w-7xl gap-3 p-3 lg:grid-cols-[1fr_22rem]">
      <header className="game-topbar flex items-center justify-between px-3 py-1.5 lg:col-span-2">
        <h1 className="font-game text-base font-bold text-white [text-shadow:var(--shadow-game-text)]">
          Pockie Ninja Remastered
        </h1>
        <nav aria-label="Account" className="flex items-center gap-3">
          <Link to="/" className="text-xs text-trim-soft underline">
            Back to the website
          </Link>
          <GameButton small disabled={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </GameButton>
        </nav>
      </header>
      <main className="flex min-w-0 flex-col gap-3">
        <CharacterPanel character={character} />
        <SceneView key={character.sceneId} character={character} />
      </main>
      <aside className="flex min-w-0 flex-col gap-3">
        <QuestTracker />
        <div className="game-frame flex flex-col px-2 pt-1 pb-2">
          <Tabs
            label="Panels"
            tabs={SIDE_TABS}
            active={tab}
            onChange={setTab}
            panelId="side-panel"
          />
          <div
            id="side-panel"
            role="tabpanel"
            className="game-inset mt-1 max-h-96 overflow-auto p-3 text-sm"
          >
            {tab === 'quests' ? <QuestLog /> : <Inventory />}
          </div>
        </div>
        <RealtimePanels characterId={character.id} />
      </aside>
    </div>
  )
}
