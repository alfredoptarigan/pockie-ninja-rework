// Team board at the team stone (UI_TeamFrame, teams.md 3.3): teams of two looking for a third
// (Join applies to the captain) and solo ninjas looking for a team (Invite). A solo ninja or the
// captain of a team of two lists themselves; refusals from the server are shown as they come.
import type { BoardPlayer } from '@pockie/shared'
import { useId, useState } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import type { WindowProps } from '../windows'
import { useBoardListing, useTeam, useTeamAction, useTeamBoard } from './api'

type Tab = 'teams' | 'solos'
const TABS: { id: Tab; title: string }[] = [
  { id: 'teams', title: 'Team List' },
  { id: 'solos', title: 'Looking for a Team' },
]

const tier = (player: BoardPlayer) =>
  player.arenaTier === null ? 'no arena tier' : `arena tier ${player.arenaTier}`

export function TeamBoardWindow({ character, onClose }: WindowProps) {
  const [tab, setTab] = useState<Tab>('teams')
  const panelId = useId()
  const board = useTeamBoard()
  const team = useTeam()
  const listing = useBoardListing()
  const action = useTeamAction()
  const [sent, setSent] = useState<string | null>(null)
  const inTeam = Boolean(team.data?.team)
  const isCaptain = team.data?.team?.captainId === character.id
  const ask = (path: 'apply' | 'invite', player: BoardPlayer) =>
    action.mutate(
      { path, body: { characterId: player.characterId } },
      {
        onSuccess: () =>
          setSent(
            path === 'apply'
              ? `You asked to join ${player.name}'s team.`
              : `You invited ${player.name}.`,
          ),
      },
    )
  const data = board.data

  return (
    <Dialog title="Team Board" onClose={onClose} className="w-[460px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        {board.isError && <Notice tone="error">{errorMessage(board.error)}</Notice>}
        {listing.isError && <Notice tone="error">{errorMessage(listing.error)}</Notice>}
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        {sent && !action.isError && <Notice>{sent} The request expires in 60 seconds.</Notice>}
        {data && (
          <>
            <div className="flex items-center gap-2">
              <GameButton
                small
                disabled={listing.isPending}
                onClick={() => listing.mutate(!data.listed)}
              >
                {data.listed ? 'Remove my listing' : inTeam ? 'List my team' : 'List myself'}
              </GameButton>
              <GameButton small disabled={board.isFetching} onClick={() => board.refetch()}>
                Refresh
              </GameButton>
            </div>
            <Tabs label="Team board" tabs={TABS} active={tab} onChange={setTab} panelId={panelId} />
            <ul id={panelId} role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.title}>
              {tab === 'teams' &&
                (data.teams.length === 0 ? (
                  <li>No teams are looking for members here.</li>
                ) : (
                  data.teams.map((row) => (
                    <BoardRow
                      key={row.teamId}
                      label={`${row.captain.name} (Lv ${row.captain.level}, ${tier(row.captain)}) and ${row.member.name} (Lv ${row.member.level}, ${tier(row.member)})`}
                      button="Join"
                      disabled={action.isPending || inTeam}
                      onClick={() => ask('apply', row.captain)}
                    />
                  ))
                ))}
              {tab === 'solos' &&
                (data.solos.length === 0 ? (
                  <li>Nobody is looking for a team here.</li>
                ) : (
                  data.solos.map((player) => (
                    <BoardRow
                      key={player.characterId}
                      label={`${player.name} (Lv ${player.level}, ${tier(player)})`}
                      button="Invite"
                      disabled={
                        action.isPending ||
                        player.characterId === character.id ||
                        (inTeam && !isCaptain)
                      }
                      onClick={() => ask('invite', player)}
                    />
                  ))
                ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  )
}

function BoardRow({
  label,
  button,
  disabled,
  onClick,
}: {
  label: string
  button: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <li
      aria-label={label}
      className="flex items-center gap-1 bg-[url(/assets/game/ui/list-row.webp)] bg-size-[100%_100%] px-1 py-0.5"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <GameButton small disabled={disabled} onClick={onClick}>
        {button}
      </GameButton>
    </li>
  )
}
