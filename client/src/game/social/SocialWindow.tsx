// Reborn's Social window (`Au`, "social-window"): 600 wide, tabs Friends / Requests / Mail /
// Blocked. The bottom-bar Social button opens it on Friends, the minimap Mail button on Mail.
// Requests are our add-back prompts: Accept adds the player back, Reject dismisses the prompt.
import type { Character } from '@pockie/shared'
import { useId, useState } from 'react'
import type { SocialPlayer } from '../../../../shared/src/schemas/social'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { useBlocked, useFriendAction, useFriends } from './api'
import { FriendsTab } from './FriendsTab'
import { MailTab } from './MailTab'
import { Pager, usePages } from './Pager'
import { EmptyCard, NameLink, PlayerTable } from './PlayerTable'
import { ViewCharacter } from './ViewCharacter'

export type SocialTab = 'friends' | 'requests' | 'mail' | 'blocked'
const TABS: { id: SocialTab; title: string }[] = [
  { id: 'friends', title: 'Friends' },
  { id: 'requests', title: 'Requests' },
  { id: 'mail', title: 'Mail' },
  { id: 'blocked', title: 'Blocked' },
]
const REQUESTS_PER_PAGE = 11
const BLOCKED_PER_PAGE = 11

function BlockedTab({ onView }: { onView: (player: SocialPlayer) => void }) {
  const blocked = useBlocked()
  const action = useFriendAction()
  const players = blocked.data?.blocked ?? []
  const { page, pages, setPage, rows } = usePages(players, BLOCKED_PER_PAGE)
  return (
    <div className="game-panel-1 flex h-full flex-col p-[8px] text-[12px] text-black">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-bold">Blocked players</h3>
        <span className="text-[11px]">{players.length}</span>
      </div>
      {blocked.isError && <Notice tone="error">{errorMessage(blocked.error)}</Notice>}
      {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      {blocked.data && !players.length ? (
        <div className="flex-1">
          <EmptyCard
            title="No blocked players"
            hint="Players you block from their profile are listed here."
          />
        </div>
      ) : (
        <ul aria-label="Blocked players" className="flex flex-1 flex-col gap-[2px]">
          {rows.map((player, index) => (
            <li
              key={player.characterId}
              className={`flex h-[28px] items-center justify-between px-2 ${index % 2 ? 'game-value-box' : 'game-text-box'}`}
            >
              <NameLink player={player} onView={() => onView(player)} />
              <GameButton
                small
                onClick={() =>
                  action.mutate({
                    path: 'blocks/remove',
                    body: { characterId: player.characterId },
                  })
                }
                className="h-[22px] w-[90px]"
              >
                Unblock
              </GameButton>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={pages} onPage={setPage} className="mt-1" />
    </div>
  )
}

export function SocialWindow({
  character,
  tab: initial = 'friends',
  onClose,
}: {
  character: Character
  tab?: SocialTab
  onClose: () => void
}) {
  const [tab, setTab] = useState<SocialTab>(initial)
  const [viewing, setViewing] = useState<string | null>(null)
  const panelId = useId()
  const friends = useFriends()
  const action = useFriendAction()
  const view = (player: SocialPlayer) => setViewing(player.characterId)
  const answer = (player: SocialPlayer, accept: boolean) =>
    action.mutate({ path: 'friends/add-back', body: { characterId: player.characterId, accept } })

  return (
    <Dialog title="Social" onClose={onClose} className="social-window w-[624px]">
      <Tabs label="Social" panelId={panelId} active={tab} onChange={setTab} tabs={TABS} />
      <div id={panelId} role="tabpanel" className="mt-1 flex h-[420px] flex-col text-[12px]">
        {friends.isError && <Notice tone="error">{errorMessage(friends.error)}</Notice>}
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        {tab === 'friends' && (
          <FriendsTab selfName={character.name} data={friends.data} onView={view} />
        )}
        {tab === 'requests' && (
          <PlayerTable
            label="Friend requests"
            players={friends.data?.addBack ?? []}
            perPage={REQUESTS_PER_PAGE}
            onView={view}
            empty={
              <EmptyCard
                title="No friend requests"
                hint="Requests other players send you appear here."
              />
            }
            action={(player) => (
              <>
                <GameButton small onClick={() => answer(player, true)} className="text-[#c8ffc8]">
                  Accept
                </GameButton>
                <GameButton small onClick={() => answer(player, false)} className="text-[#ffd0d0]">
                  Reject
                </GameButton>
              </>
            )}
          />
        )}
        {tab === 'mail' && <MailTab />}
        {tab === 'blocked' && <BlockedTab onView={view} />}
      </div>
      {viewing && (
        <ViewCharacter
          characterId={viewing}
          selfId={character.id}
          onClose={() => setViewing(null)}
          onWhisper={onClose}
        />
      )}
    </Dialog>
  )
}
