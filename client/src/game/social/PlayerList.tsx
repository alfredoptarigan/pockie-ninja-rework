// Reborn's Player List (`vy`, 190x218, minimizable): shown in every field scene, not in villages.
// Tabs Area / Friend / Apprentice; Area pages the scene's players by 7 (Lv., name, Invite). Friend
// is an empty panel in Reborn too; Apprentice (empty in Reborn) is our master / apprentice list.
// Invite is our team invite, where teams form.
import type { Character } from '@pockie/shared'
import { useId, useState } from 'react'
import { ApprenticeTab } from '../apprentice'
import { errorMessage } from '../api'
import { Tabs } from '../skin'
import { teamScene, useTeamAction } from '../teams/api'
import { showToast } from '../toast'
import { useScenePlayers } from './api'
import { Pager, usePages } from './Pager'
import { ViewCharacter } from './ViewCharacter'

type Tab = 'area' | 'friend' | 'apprentice'
const TABS: { id: Tab; title: string }[] = [
  { id: 'area', title: 'Area' },
  { id: 'friend', title: 'Friend' },
  { id: 'apprentice', title: 'Apprentice' },
]
const PER_PAGE = 7
const NO_TEAMS = 'Teams form only in the neutral fields.'

function AreaTab({ character, onView }: { character: Character; onView: (id: string) => void }) {
  const scene = useScenePlayers(character.sceneId)
  const invite = useTeamAction()
  const { page, pages, setPage, rows } = usePages(scene.data?.players ?? [], PER_PAGE)
  const canInvite = teamScene(character.sceneId)
  const send = (characterId: string) =>
    invite.mutate(
      { path: 'invite', body: { characterId } },
      {
        onSuccess: () => showToast('Invite sent.', 'success'),
        onError: (error) => showToast(errorMessage(error), 'failure'),
      },
    )
  return (
    <>
      <ul aria-label="Players in this area" className="flex w-[185px] flex-col gap-[2px]">
        {rows.map((player) => (
          <li
            key={player.characterId}
            className="game-text-box grid h-[22px] w-[182px] grid-cols-[30px_1fr_44px] items-center px-[2px] text-[11px]"
          >
            <span className="text-[10px] font-bold">Lv.{player.level}</span>
            <button
              type="button"
              onClick={() => onView(player.characterId)}
              className="min-w-0 truncate text-left text-[#1a5276] hover:underline"
            >
              {player.name}
            </button>
            <button
              type="button"
              disabled={!canInvite || invite.isPending}
              title={canInvite ? undefined : NO_TEAMS}
              onClick={() => send(player.characterId)}
              className="game-button h-[16px] w-[44px] text-[9px] disabled:cursor-not-allowed"
            >
              Invite
            </button>
          </li>
        ))}
        {Array.from({ length: PER_PAGE - rows.length }, (_, i) => (
          <li key={i} aria-hidden className="game-text-box h-[22px] w-[182px]" />
        ))}
      </ul>
      <Pager page={page} pages={pages} onPage={setPage} className="mt-[8px]" />
    </>
  )
}

export function PlayerList({ character }: { character: Character }) {
  const [tab, setTab] = useState<Tab>('area')
  const [open, setOpen] = useState(true)
  const [viewing, setViewing] = useState<string | null>(null)
  const panelId = useId()
  return (
    <section
      aria-label="Player List"
      className="pointer-events-auto absolute top-[240px] right-[6px] w-[190px] font-game text-black"
    >
      <div className="game-frame-title flex h-[24px] items-center justify-between px-1">
        <h2 className="game-title-tag text-[12px] font-bold">Player List</h2>
        <button
          type="button"
          aria-label={open ? 'Minimize' : 'Restore'}
          aria-expanded={open}
          onClick={() => setOpen((shown) => !shown)}
          className="game-button h-[16px] w-[18px] text-[10px] leading-none"
        >
          {open ? '-' : '+'}
        </button>
      </div>
      {open && (
        <div className="h-[218px] w-[190px]">
          <Tabs label="Player List" panelId={panelId} active={tab} onChange={setTab} tabs={TABS} />
          <div
            id={panelId}
            role="tabpanel"
            className="game-panel-1 flex h-[194px] w-[190px] flex-col items-center pt-[3px]"
          >
            {tab === 'area' && <AreaTab character={character} onView={setViewing} />}
            {tab === 'apprentice' && <ApprenticeTab onView={setViewing} />}
          </div>
        </div>
      )}
      {viewing && (
        <ViewCharacter
          characterId={viewing}
          selfId={character.id}
          onClose={() => setViewing(null)}
          onWhisper={() => setViewing(null)}
        />
      )}
    </section>
  )
}
