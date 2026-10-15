// Arena / Squad Arena Weekly Rewards (Reborn `Kc` / `Bd`, 720x520): the header with the rules
// tooltip, Your Rank / Your Points / Reset in, the Top 10 Leaderboard, Rewards by Rank (1-10 and
// #11-50) and the Claim footer for last week's reward.
import type { ReactNode } from 'react'
import { useState } from 'react'
import { errorMessage } from '../api'
import { useNow } from '../events/timer'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice } from '../skin'
import { useArenaPost, useWeekly } from './api'
import type {
  Ladder,
  WeeklyClaimResult,
  WeeklyView,
} from '../../../../shared/src/schemas/arena-extras'

const RULES = [
  'Your rank is checked every hour.',
  'Top 50 players earn points each hour.',
  'Higher ranks earn more points per hour.',
  'Points accumulate throughout the week.',
  'Points Per Hour by Rank: Rank 1-3: 10 / 9 / 8 points, Rank 4-6: 7 / 6 / 5 points, Rank 7-9: 4 / 3 / 2 points, Rank 10-50: 1 point.',
  'Your total points determine your reward tier.',
  'Rewards can be claimed for 5 days after the reset.',
  'Points and rankings reset every Monday at 00:00 UTC.',
]
const RANK_COLORS: Record<number, string> = { 1: '#D4A017', 2: '#7A8B8B', 3: '#CD7F32' }
const TITLES: Record<Ladder, { window: string; header: string; medals: string }> = {
  arena: { window: 'Arena Weekly Rewards', header: 'Weekly Arena Rewards', medals: 'Honor' },
  squad: {
    window: 'Squad Arena Weekly Rewards',
    header: 'Weekly Squad Arena Rewards',
    medals: 'Team Coins',
  },
}

/** "Xd Yh" over a day, else "Xh Ym" (Reborn `Xc`). */
export function countdown(ms: number) {
  const hours = Math.floor(Math.max(0, ms) / 3_600_000)
  const minutes = Math.floor((Math.max(0, ms) % 3_600_000) / 60_000)
  return hours > 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${minutes}m`
}

/** The reward row of a rank: 1-10, else the #11-50 row. */
const tierPlace = (rank: number | null) =>
  rank === null || rank > 50 ? null : rank <= 10 ? rank : 50

export function WeeklyRewards({ kind, onClose }: { kind: Ladder; onClose: () => void }) {
  const weekly = useWeekly(kind)
  const title = TITLES[kind]
  return (
    <Dialog title={title.window} onClose={onClose} className="w-[720px]">
      {weekly.isPending && <p>Loading...</p>}
      {weekly.isError && <Notice tone="error">Failed to load data</Notice>}
      {weekly.data && <Body view={weekly.data} kind={kind} />}
    </Dialog>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="game-card flex flex-1 flex-col px-2 py-1">
      <span className="text-[10px] font-bold uppercase">{label}</span>
      <span className="text-sm font-bold">{children}</span>
    </div>
  )
}

function Body({ view, kind }: { view: WeeklyView; kind: Ladder }) {
  const claim = useArenaPost<WeeklyClaimResult>()
  const [message, setMessage] = useState<string | null>(null)
  const title = TITLES[kind]
  const myPlace = tierPlace(view.userRank)
  const rank = view.userRank
  const now = useNow()
  const resetIn = countdown(new Date(view.resetAt).getTime() - now)
  return (
    <div className="flex flex-col gap-2 text-xs">
      <header className="game-card flex items-start justify-between gap-2 px-3 py-2">
        <div>
          <h3 className="text-base font-bold uppercase">{title.header}</h3>
          <p>
            {view.isMonday
              ? "Showing last week's standings for Monday rewards."
              : 'Complete tasks and challenges to earn points.'}
          </p>
        </div>
        {view.canClaim && (
          <span className="game-card px-2 py-1 font-bold uppercase">Claim Available</span>
        )}
        <details className="relative">
          <summary aria-label="How Weekly Rewards Work" className="cursor-pointer font-bold">
            i
          </summary>
          <ul className="game-card absolute right-0 z-10 w-[280px] list-disc px-5 py-2">
            {RULES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      </header>
      <div className="flex gap-2">
        <Stat label="Your Rank">
          <span style={{ color: rank ? RANK_COLORS[rank] : undefined }}>
            {rank === null ? '—' : `#${rank}`}
          </span>
        </Stat>
        <Stat label="Your Points">{view.userPoints}</Stat>
        <Stat label={view.isMonday ? 'Reset in' : 'Next Monday in'}>{resetIn}</Stat>
      </div>
      <div className="flex gap-2">
        <section aria-label="Top 10 Leaderboard" className="w-[200px] shrink-0">
          <h4 className="font-bold">Top 10 Leaderboard</h4>
          {view.leaderboard.length === 0 ? (
            <p>No data yet</p>
          ) : (
            <ol>
              {view.leaderboard.map((row) => (
                <li
                  key={row.characterId}
                  className={`flex justify-between ${row.rank === rank ? 'font-bold text-[#8a5a00]' : ''}`}
                >
                  <span>
                    #{row.rank} {row.name}
                  </span>
                  <span>{row.points}p</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <table aria-label="Rewards by Rank" className="flex-1 text-left">
          <thead>
            <tr>
              <th>Rank</th>
              <th>{title.medals}</th>
              <th>Coupons</th>
              <th>Gold</th>
              <th>Item</th>
            </tr>
          </thead>
          <tbody>
            {view.rewards.map((reward) => (
              <tr key={reward.place} className={reward.place === myPlace ? 'font-bold' : ''}>
                <td>{reward.place === 50 ? '#11-50' : `#${reward.place}`}</td>
                <td>{reward.medals}</td>
                <td>{reward.giftCoupons}</td>
                <td>{reward.gold || '—'}</td>
                <td className="flex gap-0.5">
                  {reward.items.map((itemId, index) => (
                    <ItemIcon
                      key={`${itemId}-${index}`}
                      itemId={itemId}
                      name={itemName(itemId)}
                      className="size-6"
                    />
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-end gap-2">
        {message && <p role="status">{message}</p>}
        {claim.isError && <Notice tone="error">{errorMessage(claim.error)}</Notice>}
        {view.claim.rank !== null && view.claim.rank <= 50 && (
          <>
            <span>
              Last week: #{view.claim.rank}.{' '}
              {view.claim.claimed ? 'Already claimed this week' : null}
            </span>
            <GameButton
              disabled={!view.canClaim || claim.isPending}
              onClick={() =>
                claim.mutate(
                  { path: 'weekly/claim', body: { kind } },
                  { onSuccess: () => setMessage('Claimed Rank Rewards') },
                )
              }
            >
              {claim.isPending ? 'Claiming' : 'Claim'}
            </GameButton>
          </>
        )}
      </footer>
    </div>
  )
}
