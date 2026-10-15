// Reborn's party portraits (`hi`/`fi`, reborn-windows-M-Z-hud.md "Team / party portraits"): a
// column at the left middle of the HUD, one 185x50 card per member in fight order. Pose, leader
// crown, name (opens View Character), level badge and HP/MP/VP mini bars; X leaves on my own card
// and kicks on another as the leader; the leader also promotes and reorders. Art: the original
// party frame pieces (UI_TeamRoleIcon), Reborn's own Party sprites are not exported.
import type { CSSProperties } from 'react'
import type { TeamMemberView, TeamView } from '@pockie/shared'
import { errorMessage } from '../api'
import { Notice } from '../skin'
import { useTeamAction } from './api'

/** Reborn's energy cap; we have no Energy system yet, so VP stays at 0 like the player card. */
const VP_MAX = 200

export const leaveQuestion = (view: TeamView) =>
  view.members.length <= 2 ? 'Leave the party? A party of two is disbanded.' : 'Leave the party?'

export function PartyPortraits({
  view,
  selfId,
  onView,
}: {
  view: TeamView
  selfId: string
  onView: (characterId: string) => void
}) {
  const action = useTeamAction()
  const leader = view.captainId === selfId
  const run = (path: string, body?: object) => action.mutate({ path, body })
  // Reborn centres the column on the HUD (top 50%); 60px higher keeps three cards clear of our
  // taller chat box on a 720px-high window.
  return (
    <div className="pointer-events-auto fixed top-[calc(50%-60px)] left-[5px] z-[100] -translate-y-1/2 font-game">
      <ol aria-label="Party members">
        {view.members.map((member, index) => (
          <PartyCard
            key={member.characterId}
            member={member}
            self={member.characterId === selfId}
            leader={leader}
            first={index === 0}
            last={index === view.members.length - 1}
            busy={action.isPending}
            onView={() => onView(member.characterId)}
            onLeave={() => {
              if (window.confirm(leaveQuestion(view))) run('leave')
            }}
            run={run}
          />
        ))}
      </ol>
      {action.isError && (
        <div className="w-[185px]">
          <Notice tone="error">{errorMessage(action.error)}</Notice>
        </div>
      )}
    </div>
  )
}

const SHADOW = '[text-shadow:1px_1px_1px_#000,-1px_-1px_1px_#000]'
/** The original three-state image buttons (up, over, down); literal classes for Tailwind. */
const ART = {
  leader:
    'bg-[image:var(--ui-team-leader-up)] hover:bg-[image:var(--ui-team-leader-over)] active:bg-[image:var(--ui-team-leader-down)]',
  leave:
    'bg-[image:var(--ui-team-leave-up)] hover:bg-[image:var(--ui-team-leave-over)] active:bg-[image:var(--ui-team-leave-down)]',
  arrow:
    'bg-[image:var(--ui-team-arrow-up)] hover:bg-[image:var(--ui-team-arrow-over)] active:bg-[image:var(--ui-team-arrow-down)]',
}
const imageButton = (art: keyof typeof ART) =>
  `absolute cursor-pointer bg-size-[100%_100%] disabled:cursor-not-allowed disabled:opacity-50 ${ART[art]}`

function PartyCard({
  member,
  self,
  leader,
  first,
  last,
  busy,
  onView,
  onLeave,
  run,
}: {
  member: TeamMemberView
  self: boolean
  leader: boolean
  first: boolean
  last: boolean
  busy: boolean
  onView: () => void
  onLeave: () => void
  run: (path: string, body?: object) => void
}) {
  const target = { characterId: member.characterId }
  const kick = () => {
    if (window.confirm(`Kick ${member.name} out of the party?`)) run('kick', target)
  }
  return (
    <li
      aria-label={member.name}
      title={member.online ? undefined : `${member.name} is offline`}
      className={`relative mb-[5px] h-[50px] w-[185px] text-[12px] text-[whitesmoke] ${member.online ? '' : 'opacity-60'}`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-[4px] border border-[#8a6d3b] bg-[image:var(--ui-team-name-plate)] bg-size-[100%_100%]"
      />
      <div className="absolute top-[3px] left-[3px] h-[45px] w-[55px] overflow-hidden rounded-[50%]">
        <img
          src={`/assets/reborn/poses/${member.clothing}.webp`}
          alt=""
          className="absolute top-0 left-[7px] h-[45px] max-w-none"
        />
      </div>
      {member.captain && (
        <img
          src="/assets/game/ui/team-crown.webp"
          alt="Party leader"
          className="absolute top-0 left-[13px] h-[12px] w-[22px] -translate-y-full"
        />
      )}
      <button
        type="button"
        onClick={onView}
        className={`absolute inset-x-[30px] top-[2px] cursor-pointer truncate text-center select-none ${SHADOW}`}
      >
        {member.name}
      </button>
      <span
        aria-label="Level"
        className={`absolute top-[43px] left-[3px] flex h-[17px] w-[38px] -translate-y-1/2 items-center justify-center bg-[image:var(--ui-team-level)] bg-size-[100%_100%] select-none ${SHADOW}`}
      >
        {member.level}
      </span>
      <MiniBar label="HP" kind="hp" value={member.hp} max={member.maxHp} top={19} left={63} />
      <MiniBar label="MP" kind="mp" value={member.mp} max={member.maxMp} top={27} />
      <MiniBar label="VP" kind="vp" value={0} max={VP_MAX} top={35} />
      {leader && !self && (
        <button
          type="button"
          aria-label={`Promote ${member.name}`}
          title="Make party leader"
          disabled={busy}
          onClick={() => run('captain', target)}
          className={`top-[1px] left-[154px] size-[11px] ${imageButton('leader')}`}
        />
      )}
      {(self || leader) && (
        <button
          type="button"
          aria-label={self ? 'Leave party' : `Kick ${member.name}`}
          title={self ? 'Leave party' : 'Kick'}
          disabled={busy}
          onClick={self ? onLeave : kick}
          className={`top-[1px] left-[167px] size-[12px] ${imageButton('leave')}`}
        />
      )}
      {leader && !first && (
        <button
          type="button"
          aria-label={`Move ${member.name} up`}
          disabled={busy}
          onClick={() => run('order', { ...target, direction: 'up' })}
          className={`top-[20px] left-[162px] h-[7px] w-[12px] ${imageButton('arrow')}`}
        />
      )}
      {leader && !last && (
        <button
          type="button"
          aria-label={`Move ${member.name} down`}
          disabled={busy}
          onClick={() => run('order', { ...target, direction: 'down' })}
          className={`top-[33px] left-[162px] h-[7px] w-[12px] -scale-y-100 ${imageButton('arrow')}`}
        />
      )}
    </li>
  )
}

/** Reborn's 90x5 bar: the fill clipped to the value. */
function MiniBar({
  label,
  kind,
  value,
  max,
  top,
  left = 60,
}: {
  label: string
  kind: 'hp' | 'mp' | 'vp'
  value: number
  max: number
  top: number
  left?: number
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      title={`${label} ${value} / ${max}`}
      className={`game-bar game-bar-${kind} !absolute h-[5px] w-[90px]`}
      style={{ left, top, '--fill': `${percent}%` } as CSSProperties}
    />
  )
}
