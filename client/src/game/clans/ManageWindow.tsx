// Reborn's Manage (`Vh`, Roles tab) and Applications windows, opened from the Clan window by the
// leader, Vice-Leader and Officers. The buttons follow canClanAction, the server's own rule. The
// leader-only Settings tab (vice permissions, inactivity automation) is not built.
import {
  CLAN_MAX_OFFICERS,
  CLAN_ROLE_TITLES,
  canClanAction,
  type ClanMemberView,
  type ClanRoleAction,
  type ClanView,
} from '@pockie/shared'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { useApplications, useClanAction } from './api'

const ACTIONS: { action: ClanRoleAction; label: string }[] = [
  { action: 'vice', label: 'Vice' },
  { action: 'officer', label: 'Officer' },
  { action: 'member', label: 'Remove' },
  { action: 'kick', label: 'Kick' },
]
const LEGEND = [
  ['Leader', 'Leader: full control of the clan'],
  ['Vice-Leader', 'Vice: manages members and events'],
  ['Officer', 'Officer: helps with training and garden'],
  ['Member', 'Member: standard clan member'],
] as const

export function ManageWindow({ clan, onClose }: { clan: ClanView; onClose: () => void }) {
  const action = useClanAction()
  const officers = clan.members.filter((m) => m.role === 'officer').length
  const vice = clan.members.find((m) => m.role === 'vice')
  const rows = clan.members.filter((m) => m.role !== 'leader')

  const run = (member: ClanMemberView, act: ClanRoleAction) => {
    if (act === 'kick') {
      if (!window.confirm(`Kick ${member.name}?`)) return
      action.mutate({ path: 'kick', body: { characterId: member.characterId } })
      return
    }
    if (
      act === 'vice' &&
      vice &&
      !window.confirm(`Replace ${vice.name} as Vice-Leader with ${member.name}?`)
    )
      return
    action.mutate({ path: 'role', body: { characterId: member.characterId, role: act } })
  }

  return (
    <Dialog title="Manage" onClose={onClose} className="w-[460px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        <ul className="text-[11px]">
          {LEGEND.map(([role, text]) => (
            <li key={role}>{text}</li>
          ))}
        </ul>
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        <table className="w-full border-collapse" aria-label="Roles">
          <thead>
            <tr className="game-title-plate h-[18px] text-white">
              <th className="px-1 text-left">Player</th>
              <th className="px-1 text-left">Role</th>
              <th className="px-1 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => {
              const allowed = ACTIONS.filter(({ action: act }) =>
                canClanAction(clan.myRole, member.role, act, officers),
              )
              return (
                <tr key={member.characterId} aria-label={member.name} className="game-text-box">
                  <td className="px-1">{member.name}</td>
                  <td className="px-1">{CLAN_ROLE_TITLES[member.role]}</td>
                  <td className="flex gap-1 px-1 py-[2px]">
                    {allowed.length === 0
                      ? '--'
                      : allowed.map(({ action: act, label }) => (
                          <GameButton
                            key={act}
                            small
                            disabled={action.isPending}
                            onClick={() => run(member, act)}
                          >
                            {label}
                          </GameButton>
                        ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className={officers >= CLAN_MAX_OFFICERS ? 'text-[#b33]' : ''}>
          Officers: {officers}/{CLAN_MAX_OFFICERS}
          {officers >= CLAN_MAX_OFFICERS && ' (limit reached)'}
        </p>
      </div>
    </Dialog>
  )
}

export function ApplicationsWindow({ onClose }: { onClose: () => void }) {
  const applications = useApplications()
  const action = useClanAction()
  const answer = (path: 'accept' | 'reject', characterId: string) =>
    action.mutate(
      { path: `applications/${path}`, body: { characterId } },
      { onSettled: () => void applications.refetch() },
    )
  const rows = applications.data?.applications ?? []
  return (
    <Dialog title="Applications" onClose={onClose} className="w-[440px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        {applications.isError && <Notice tone="error">{errorMessage(applications.error)}</Notice>}
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        <table className="w-full border-collapse" aria-label="Applications">
          <thead>
            <tr className="game-title-plate h-[20px] text-white">
              <th className="px-1 text-left">Name</th>
              <th className="px-1">Level</th>
              <th className="px-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.characterId} aria-label={row.name} className="game-text-box h-[22px]">
                <td className="px-1">{row.name}</td>
                <td className="px-1 text-center">{row.level}</td>
                <td className="flex justify-center gap-1 px-1 py-[2px]">
                  <GameButton
                    small
                    disabled={action.isPending}
                    onClick={() => answer('accept', row.characterId)}
                  >
                    Accept
                  </GameButton>
                  <GameButton
                    small
                    disabled={action.isPending}
                    onClick={() => answer('reject', row.characterId)}
                  >
                    Decline
                  </GameButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {applications.data && rows.length === 0 && <p className="text-center">No applications</p>}
        <div className="flex justify-end">
          <GameButton
            small
            disabled={applications.isFetching}
            onClick={() => applications.refetch()}
          >
            Refresh
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}
