// Party window, laid out like Reborn's Select Your Squad (reborn-windows-M-Z-hud.md): the party's
// fight order as pose cards with their order badge, "n/3 Members" and the sequence line. Invite
// by name (the leader, or anyone to create a party) and leave. Kick, promote and reorder live on
// the party portraits, as in Reborn; invitations arrive in the Party Invite popup.
import { TEAM_MAX_SIZE, type TeamMemberView, type TeamView } from '@pockie/shared'
import { useState, type FormEvent } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import type { WindowProps } from '../windows'
import { teamScene, useTeam, useTeamAction } from './api'
import { leaveQuestion } from './PartyPortraits'

export function TeamWindow({ character, onClose }: WindowProps) {
  const team = useTeam()
  const action = useTeamAction()
  const [inviting, setInviting] = useState(false)
  const view = team.data?.team ?? null

  return (
    <Dialog title="Party" onClose={onClose} className="w-[520px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        {team.isError && <Notice tone="error">{errorMessage(team.error)}</Notice>}
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        {team.isSuccess && !view && (
          <>
            <p>You are not in a party.</p>
            {!teamScene(character.sceneId) && (
              <Notice>Parties can only be formed in the neutral fields and Valhalla.</Notice>
            )}
            {inviting ? (
              <InviteForm />
            ) : (
              <GameButton small className="self-start" onClick={() => setInviting(true)}>
                Create party
              </GameButton>
            )}
          </>
        )}
        {view && (
          <>
            <Squad view={view} selfId={character.id} />
            {view.captainId === character.id && view.members.length < TEAM_MAX_SIZE && (
              <InviteForm />
            )}
            <GameButton
              small
              className="self-start"
              disabled={action.isPending}
              onClick={() => {
                if (window.confirm(leaveQuestion(view))) action.mutate({ path: 'leave' })
              }}
            >
              {view.members.length <= 2 ? 'Disband party' : 'Leave party'}
            </GameButton>
          </>
        )}
      </div>
    </Dialog>
  )
}

/** Select Your Squad's body: title, rule, one card per slot, the count and the sequence. */
function Squad({ view, selfId }: { view: TeamView; selfId: string }) {
  const empty = TEAM_MAX_SIZE - view.members.length
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-bold">Your Party&apos;s Fight Order</h3>
      <p>
        Your party fights in this order. The leader sets it with the arrows on the party portraits.
      </p>
      <ol aria-label="Fight order" className="flex justify-center gap-2">
        {view.members.map((member) => (
          <SquadCard
            key={member.characterId}
            member={member}
            self={member.characterId === selfId}
          />
        ))}
        {Array.from({ length: empty }, (_, index) => (
          <li
            key={`empty-${index}`}
            aria-hidden="true"
            className="game-card flex h-[150px] w-[140px] items-center justify-center text-[#5a4a3a]"
          >
            Empty
          </li>
        ))}
      </ol>
      <p className="text-center">
        <span className="font-bold">
          {view.members.length}/{TEAM_MAX_SIZE} Members
        </span>{' '}
        <span>
          ({view.members.map((member, index) => `#${index + 1} ${member.name}`).join(' → ')})
        </span>
      </p>
    </section>
  )
}

function SquadCard({ member, self }: { member: TeamMemberView; self: boolean }) {
  return (
    <li
      aria-label={member.name}
      className={`game-card relative flex h-[150px] w-[140px] flex-col items-center justify-end p-1 ${member.online ? '' : 'opacity-60'}`}
    >
      <span className="absolute top-1 left-1 rounded-full bg-[#5a3a1a] px-1.5 font-bold text-white">
        #{member.fightOrder + 1}
      </span>
      {member.captain && (
        <span className="absolute top-1 right-1 font-bold text-[#9a6a00]">Leader</span>
      )}
      <img
        src={`/assets/reborn/poses/${member.clothing}.webp`}
        alt=""
        className="h-[100px] object-contain"
      />
      <span className="max-w-full truncate">
        <span className={self ? 'font-bold' : 'font-semibold'}>{member.name}</span> Lv.{' '}
        {member.level}
      </span>
      {!member.online && <span className="text-[#8a1610]">Offline</span>}
    </li>
  )
}

/** Invite by name; the server looks the ninja up and refuses an unknown name. */
function InviteForm() {
  const [name, setName] = useState('')
  const action = useTeamAction()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const wanted = name.trim()
    if (wanted)
      action.mutate({ path: 'invite', body: { name: wanted } }, { onSuccess: () => setName('') })
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
      {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      {action.isSuccess && <Notice>Invitation sent. It expires in 60 seconds.</Notice>}
    </form>
  )
}
