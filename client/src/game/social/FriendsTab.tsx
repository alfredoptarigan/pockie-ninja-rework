// Reborn's Friends tab (`ju`): the raised top card (Player Name, Send Friend Request, the status
// line) over the friend list, 8 rows a page, Remove with a confirmation.
// Our server adds friends one way and asks the other side to add back (their Requests tab), so a
// "request" here adds the friend at once; the line still reads "Friend request sent!".
import { useId, useState, type FormEvent } from 'react'
import type { FriendEntry, FriendsView } from '../../../../shared/src/schemas/social'
import { ApiError } from '../../lib/api'
import { GameButton } from '../skin'
import { useFriendAction } from './api'
import { EmptyCard, PlayerTable } from './PlayerTable'

const FRIENDS_PER_PAGE = 8
/** Names are 3-12 letters, digits or underscores; the server checks the rest. */
const NAME = /^\w{1,12}$/
const TONES = { error: 'text-[#a01818]', success: 'text-[#256c2b]', info: 'text-black' }

interface Status {
  text: string
  tone: keyof typeof TONES
}

const failure = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'Unable to send request'
  if (error.code === 'unknown_name') return 'Player not found'
  if (error.code === 'self') return 'You cannot add yourself as a friend'
  // Refusals (full list, a block) keep the server's own line.
  return error.status === 400 ? error.message : 'Unable to send request'
}

export function FriendsTab({
  selfName,
  data,
  onView,
}: {
  selfName: string
  data: FriendsView | undefined
  onView: (friend: FriendEntry) => void
}) {
  const inputId = useId()
  const [name, setName] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const action = useFriendAction()
  const friends = data?.friends ?? []
  const online = friends.filter((friend) => friend.online).length

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const wanted = name.trim()
    const same = (other: string) => other.toLowerCase() === wanted.toLowerCase()
    const refusal = !wanted
      ? "Enter the player's name."
      : !NAME.test(wanted)
        ? 'Invalid Player'
        : same(selfName)
          ? 'You cannot add yourself as a friend'
          : friends.some((friend) => same(friend.name))
            ? 'Already friends'
            : null
    if (refusal) return setStatus({ text: refusal, tone: 'error' })
    setStatus({ text: `Sending request to ${wanted}...`, tone: 'info' })
    action.mutate(
      { path: 'friends/add', body: { name: wanted } },
      {
        onSuccess: () => {
          setName('')
          setStatus({ text: 'Friend request sent!', tone: 'success' })
        },
        onError: (error) => setStatus({ text: failure(error), tone: 'error' }),
      },
    )
  }
  const remove = (friend: FriendEntry) => {
    if (window.confirm('Remove this friend?'))
      action.mutate({ path: 'friends/remove', body: { characterId: friend.characterId } })
  }

  return (
    <div className="flex h-full flex-col gap-[6px]">
      <section aria-label="Send a friend request" className="game-panel-1 p-[8px] text-black">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-bold">Friends</h3>
          <span className="text-[11px]">
            Total Friends: {friends.length} | Online: {online}
          </span>
        </div>
        <form onSubmit={submit} className="flex items-center gap-[8px]">
          <label htmlFor={inputId} className="w-[78px] text-[12px]">
            Player Name
          </label>
          <input
            id={inputId}
            value={name}
            maxLength={12}
            placeholder="Search by name..."
            onChange={(event) => setName(event.target.value)}
            className="game-text-box h-[26px] w-[262px] px-2 text-[12px]"
          />
          <GameButton type="submit" disabled={action.isPending} className="h-[24px] w-[170px]">
            {action.isPending ? 'Sending...' : 'Send Friend Request'}
          </GameButton>
        </form>
        <p
          role="status"
          className={`mt-1 min-h-[16px] text-[11px] ${TONES[status?.tone ?? 'info']}`}
        >
          {status?.text}
        </p>
      </section>
      <PlayerTable
        label="Friends"
        players={friends}
        perPage={FRIENDS_PER_PAGE}
        onView={onView}
        empty={
          <EmptyCard
            title="Your friends list is empty"
            hint="Type a player name above and send a friend request."
          />
        }
        action={(friend) => (
          <GameButton
            small
            onClick={() => remove(friend)}
            className="h-[22px] w-[84px] text-[#ffd0d0]"
          >
            Remove
          </GameButton>
        )}
      />
    </div>
  )
}
