// Friends window (UI_Society, HUD "Friends"): Friends and Blocked tabs, add by name, add-back
// prompts, online dot, Whisper / Mail / Remove / Block per friend.
import { useId, useState, type FormEvent } from 'react'
import type { FriendEntry, SocialPlayer } from '../../../../shared/src/schemas/social'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { plainText } from '../text'
import { useBlocked, useFriendAction, useFriends } from './api'
import { ComposeMail } from './ComposeMail'
import { requestWhisper } from './requests'

type Tab = 'friends' | 'blocked'
const UI = '/assets/game/ui'
const village = (nation: number) => plainText(`lg_Common_Nation_${nation}`, 'Village')

function PlayerInfo({ player }: { player: SocialPlayer }) {
  return (
    <span className="min-w-0 flex-1 truncate">
      <span className="font-semibold">{player.name}</span> Lv {player.level}{' '}
      {village(player.nation)}
    </span>
  )
}

export function FriendsWindow({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('friends')
  const [name, setName] = useState('')
  const panelId = useId()
  const friends = useFriends()
  const blocked = useBlocked()
  const action = useFriendAction()
  const [composeTo, setComposeTo] = useState<string | null>(null)
  const run = (path: string, body: object) => action.mutate({ path, body })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    action.mutate(
      { path: tab === 'friends' ? 'friends/add' : 'blocks/add', body: { name: trimmed } },
      { onSuccess: () => setName('') },
    )
  }
  const whisper = (friend: FriendEntry) => {
    requestWhisper(friend.name)
    onClose()
  }
  const confirmBlock = (friend: FriendEntry) => {
    if (window.confirm(`Block ${friend.name}? They will be removed from your friends.`))
      run('blocks/add', { characterId: friend.characterId })
  }

  const list = tab === 'friends' ? friends : blocked
  return (
    <Dialog title="Friends" onClose={onClose} className="w-[440px]">
      <Tabs
        label="Friends lists"
        panelId={panelId}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'friends', title: 'Friends' },
          { id: 'blocked', title: 'Blocked' },
        ]}
      />
      <div id={panelId} role="tabpanel" className="mt-2 flex flex-col gap-2 text-[12px] text-black">
        <form onSubmit={submit} className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2">
            <span>Ninja name</span>
            <input
              value={name}
              maxLength={12}
              onChange={(event) => setName(event.target.value)}
              className="min-w-0 flex-1 border border-wood-light bg-white px-1"
            />
          </label>
          <GameButton small type="submit" disabled={action.isPending}>
            {tab === 'friends' ? 'Add Friend' : 'Block'}
          </GameButton>
        </form>
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        {list.isError && <Notice tone="error">{errorMessage(list.error)}</Notice>}

        {tab === 'friends' && friends.data && (
          <>
            <p>
              Friends: {friends.data.friends.length}/{friends.data.max}
            </p>
            {friends.data.addBack.map((player) => (
              <div key={player.characterId} className="game-card flex items-center gap-2 p-1">
                <span className="flex-1">
                  {player.name} (Level {player.level}) added you as a friend. Add them too?
                </span>
                <GameButton
                  small
                  onClick={() =>
                    run('friends/add-back', { characterId: player.characterId, accept: true })
                  }
                >
                  Add
                </GameButton>
                <GameButton
                  small
                  onClick={() =>
                    run('friends/add-back', { characterId: player.characterId, accept: false })
                  }
                >
                  Dismiss
                </GameButton>
              </div>
            ))}
            <ul aria-label="Friends" className="flex flex-col gap-1">
              {friends.data.friends.map((friend) => (
                <li
                  key={friend.characterId}
                  className="flex items-center gap-1 bg-[url(/assets/game/ui/list-row.webp)] bg-size-[100%_100%] px-1 py-0.5"
                >
                  <img
                    src={`${UI}/icon-${friend.online ? 'online' : 'offline'}.webp`}
                    alt={friend.online ? 'Online' : 'Offline'}
                    className="h-3 w-3"
                  />
                  <img
                    src={`${UI}/icon-${friend.mutual ? 'mutual' : 'one-sided'}.webp`}
                    alt={friend.mutual ? 'Mutual friend' : 'One-sided friend'}
                    title={friend.mutual ? 'You are friends with each other.' : undefined}
                    className="h-3 w-auto"
                  />
                  <PlayerInfo player={friend} />
                  <GameButton
                    small
                    disabled={!friend.online}
                    title={friend.online ? undefined : 'The player is offline.'}
                    onClick={() => whisper(friend)}
                  >
                    Whisper
                  </GameButton>
                  <GameButton small onClick={() => setComposeTo(friend.name)}>
                    Mail
                  </GameButton>
                  <GameButton
                    small
                    onClick={() => run('friends/remove', { characterId: friend.characterId })}
                  >
                    Remove
                  </GameButton>
                  <GameButton small onClick={() => confirmBlock(friend)}>
                    Block
                  </GameButton>
                </li>
              ))}
            </ul>
            {!friends.data.friends.length && <p>Add a ninja by name to start your friend list.</p>}
          </>
        )}

        {tab === 'blocked' && blocked.data && (
          <>
            <p>
              Blocked: {blocked.data.blocked.length}/{blocked.data.max}. Blocked ninjas cannot
              whisper, mail, add you or invite you.
            </p>
            <ul aria-label="Blocked ninjas" className="flex flex-col gap-1">
              {blocked.data.blocked.map((player) => (
                <li key={player.characterId} className="game-card flex items-center gap-2 p-1">
                  <PlayerInfo player={player} />
                  <GameButton
                    small
                    onClick={() => run('blocks/remove', { characterId: player.characterId })}
                  >
                    Unblock
                  </GameButton>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {composeTo && (
        <Dialog title="Write Letter" onClose={() => setComposeTo(null)} className="w-[360px]">
          <ComposeMail
            to={composeTo}
            onSent={() => setComposeTo(null)}
            onCancel={() => setComposeTo(null)}
          />
        </Dialog>
      )}
    </Dialog>
  )
}
