// Team window: the controls of the original party frame (UI_TeamRoleIcon, teams.md 6) in one
// window. Members in fight order with level and captain mark; the captain reorders, kicks and
// hands over the lead; anyone leaves. Invite by name, and the pending prompts with their timer.
import {
  TEAM_MAX_SIZE,
  type TeamBoardView,
  type TeamMemberView,
  type TeamView,
} from '@pockie/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { useFriends } from '../social/api'
import type { WindowProps } from '../windows'
import { teamKeys, teamScene, useTeam, useTeamAction } from './api'
import { TeamPromptList } from './TeamPrompts'

export function TeamWindow({ character, onClose }: WindowProps) {
  const team = useTeam()
  const action = useTeamAction()
  const [inviting, setInviting] = useState(false)
  const view = team.data?.team ?? null
  const captain = view?.captainId === character.id
  const run = (path: string, body?: object) => action.mutate({ path, body })

  return (
    <Dialog title="Team" onClose={onClose} className="w-[420px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        {team.isError && <Notice tone="error">{errorMessage(team.error)}</Notice>}
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        {team.data && <TeamPromptList prompts={team.data.prompts} />}
        {team.isSuccess && !view && (
          <>
            <p>You are not in a team.</p>
            {!teamScene(character.sceneId) && (
              <Notice>Teams can only be formed in the neutral fields and Valhalla.</Notice>
            )}
            {inviting ? (
              <InviteForm />
            ) : (
              <GameButton small className="self-start" onClick={() => setInviting(true)}>
                Create team
              </GameButton>
            )}
          </>
        )}
        {view && (
          <>
            <ol aria-label="Members" className="flex flex-col gap-1">
              {view.members.map((member, index) => (
                <MemberRow
                  key={member.characterId}
                  member={member}
                  self={member.characterId === character.id}
                  captainView={captain}
                  first={index === 0}
                  last={index === view.members.length - 1}
                  busy={action.isPending}
                  run={run}
                />
              ))}
            </ol>
            {captain && view.members.length < TEAM_MAX_SIZE && <InviteForm />}
            <GameButton
              small
              className="self-start"
              disabled={action.isPending}
              onClick={() => {
                if (window.confirm(leaveQuestion(view))) run('leave')
              }}
            >
              {view.members.length <= 2 ? 'Disband team' : 'Leave team'}
            </GameButton>
          </>
        )}
      </div>
    </Dialog>
  )
}

const leaveQuestion = (view: TeamView) =>
  view.members.length <= 2 ? 'Leave the team? A team of two is disbanded.' : 'Leave the team?'

function MemberRow({
  member,
  self,
  captainView,
  first,
  last,
  busy,
  run,
}: {
  member: TeamMemberView
  self: boolean
  captainView: boolean
  first: boolean
  last: boolean
  busy: boolean
  run: (path: string, body?: object) => void
}) {
  const target = { characterId: member.characterId }
  return (
    <li
      aria-label={member.name}
      className="flex items-center gap-1 bg-[url(/assets/game/ui/list-row.webp)] bg-size-[100%_100%] px-1 py-0.5"
    >
      <span className="w-4 text-center">{member.fightOrder + 1}.</span>
      <span className="min-w-0 flex-1 truncate">
        <span className={self ? 'font-bold' : 'font-semibold'}>{member.name}</span> Lv.{' '}
        {member.level}
        {member.captain && <span className="ml-1 font-bold text-[#9a6a00]">Captain</span>}
        {!member.online && <span className="ml-1 text-[#8a1610]">Offline</span>}
      </span>
      {captainView && (
        <>
          <GameButton
            small
            aria-label={`Move ${member.name} up`}
            disabled={busy || first}
            onClick={() => run('order', { ...target, direction: 'up' })}
          >
            Up
          </GameButton>
          <GameButton
            small
            aria-label={`Move ${member.name} down`}
            disabled={busy || last}
            onClick={() => run('order', { ...target, direction: 'down' })}
          >
            Down
          </GameButton>
          {!self && (
            <>
              <GameButton
                small
                aria-label={`Make ${member.name} captain`}
                disabled={busy}
                onClick={() => run('captain', target)}
              >
                Lead
              </GameButton>
              <GameButton
                small
                aria-label={`Kick ${member.name}`}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Kick ${member.name} out of the team?`)) run('kick', target)
                }}
              >
                Kick
              </GameButton>
            </>
          )}
        </>
      )}
    </li>
  )
}

/**
 * Invite by name. The server takes a character id, so the name is looked up among the players
 * this client knows: friends and the team stone board.
 * ponytail: known players only; drop the lookup once /invite accepts a name.
 */
function InviteForm() {
  const [name, setName] = useState('')
  const [missing, setMissing] = useState<string | null>(null)
  const friends = useFriends()
  const queryClient = useQueryClient()
  const action = useTeamAction()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const wanted = name.trim().toLowerCase()
    if (!wanted) return
    const board = queryClient.getQueryData<TeamBoardView>(teamKeys.board)
    const known = [
      ...(friends.data?.friends ?? []),
      ...(board?.solos ?? []),
      ...(board?.teams.flatMap((t) => [t.captain, t.member]) ?? []),
    ]
    const target = known.find((player) => player.name.toLowerCase() === wanted)
    setMissing(target ? null : 'No such ninja among your friends or on the team stone board here.')
    if (target)
      action.mutate(
        { path: 'invite', body: { characterId: target.characterId } },
        { onSuccess: () => setName('') },
      )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2">
          <span>Ninja name</span>
          <input
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 border border-wood-light bg-white px-1"
          />
        </label>
        <GameButton small type="submit" disabled={action.isPending}>
          Invite
        </GameButton>
      </div>
      {missing && <Notice tone="error">{missing}</Notice>}
      {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      {action.isSuccess && <Notice>Invitation sent. It expires in 60 seconds.</Notice>}
    </form>
  )
}
