// The list card of Reborn's Friends and Requests tabs: header strip Name / Level / Village /
// Status / Action at x 28 / 184 / 238 / 362 / 452, rows 572x28 alternating TextBG1 / TextBG2.
import type { ReactNode } from 'react'
import type { SocialPlayer } from '../../../../shared/src/schemas/social'
import { plainText } from '../text'
import { Pager, usePages } from './Pager'

const UI = '/assets/game/ui'
const COLUMNS = 'grid grid-cols-[28px_156px_54px_124px_90px_1fr] items-center'
export const village = (nation: number) => plainText(`lg_Common_Nation_${nation}`, 'Village')

/** Reborn's player-name link: opens View Character. */
export function NameLink({ player, onView }: { player: SocialPlayer; onView: () => void }) {
  return (
    <button
      type="button"
      onClick={onView}
      className="min-w-0 truncate text-left font-bold text-[#1a5276] hover:underline"
    >
      {player.name}
    </button>
  )
}

export function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="font-bold">{title}</p>
      <p className="text-[11px] opacity-80">{hint}</p>
    </div>
  )
}

export function PlayerTable<P extends SocialPlayer & { online: boolean }>({
  label,
  players,
  perPage,
  onView,
  action,
  empty,
}: {
  label: string
  players: readonly P[]
  perPage: number
  onView: (player: P) => void
  action: (player: P) => ReactNode
  empty: ReactNode
}) {
  const { page, pages, setPage, rows } = usePages(players, perPage)
  return (
    <div className="game-panel-1 flex flex-1 flex-col p-[8px] text-[12px] text-black">
      <div className={`${COLUMNS} game-title-plate h-[24px] font-bold text-white`}>
        <span />
        <span>Name</span>
        <span className="text-center">Level</span>
        <span className="text-center">Village</span>
        <span className="text-center">Status</span>
        <span className="text-center">Action</span>
      </div>
      {players.length === 0 ? (
        <div className="flex-1">{empty}</div>
      ) : (
        <ul aria-label={label} className="mt-[2px] flex flex-1 flex-col gap-[2px]">
          {rows.map((player, index) => (
            <li
              key={player.characterId}
              className={`${COLUMNS} h-[28px] ${index % 2 ? 'game-value-box' : 'game-text-box'}`}
            >
              <img
                src={`${UI}/icon-${player.online ? 'online' : 'offline'}.webp`}
                alt=""
                className="mx-auto h-3 w-3"
              />
              <NameLink player={player} onView={() => onView(player)} />
              <span className="text-center">{player.level}</span>
              <span className="truncate text-center">{village(player.nation)}</span>
              <span
                className={`mx-auto rounded-full px-2 text-[11px] font-bold text-white ${
                  player.online ? 'bg-[#256c2b]' : 'bg-[#6b6b6b]'
                }`}
              >
                {player.online ? 'Online' : 'Offline'}
              </span>
              <span className="flex justify-center gap-1">{action(player)}</span>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={pages} onPage={setPage} className="mt-1" />
    </div>
  )
}
