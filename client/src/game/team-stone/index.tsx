// Team Stone window (M5 task 14, decision 28): the ranked 3v3 queue, leagues, the monthly
// leaderboard and the Battle Coin shop. Matches run on the server; the window polls while queued.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import type {
  TeamStoneLeaderboard,
  TeamStoneMatchEntry,
  TeamStoneReplay,
  TeamStoneShopResult,
  TeamStoneShopView,
  TeamStoneView,
} from '../../../../shared/src/schemas/team-stone'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { BattleReplayMount } from '../stage'
import type { Replay } from '../types'

const BASE = '/api/game/team-stone'
export const teamStoneKey = ['game', 'team-stone'] as const
const QUEUE_POLL_MS = 3000

type Tab = 'queue' | 'league' | 'leaderboard' | 'shop'
const TABS: { id: Tab; title: string }[] = [
  { id: 'queue', title: 'Queue' },
  { id: 'league', title: 'Leagues' },
  { id: 'leaderboard', title: 'Leaderboard' },
  { id: 'shop', title: 'Battle Coin Shop' },
]

export const leagueName = (nameKey: string) =>
  (names as Record<string, string>)[nameKey] ?? 'League'
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const resultText = (entry: TeamStoneMatchEntry) =>
  `${entry.won ? 'Victory' : 'Defeat'} (${signed(entry.delta)} score)`

/** Typed system mail of the weekly pay, for client/src/game/social/templates.ts. */
export const TEAM_STONE_MAIL_TEXT = {
  team_stone_weekly: (params: Record<string, string | number>) => ({
    subject: 'Team Stone weekly reward',
    body:
      `Your Team Stone league paid ${Number(params.battleCoins) || 0} Battle Coins this week.` +
      (params.itemId
        ? ` You also received ${Number(params.count) || 1} x ${itemName(String(params.itemId))}.`
        : ''),
  }),
}

export function TeamStoneWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('queue')
  const [watching, setWatching] = useState<TeamStoneReplay<Replay> | null>(null)
  const panelId = useId()
  if (watching) {
    const sideA = watching.looks[0]
    return (
      <BattleReplayMount
        replay={watching.replay}
        clothing={sideA && 'clothing' in sideA ? sideA.clothing : character.clothing}
        weaponItemId={sideA && 'clothing' in sideA ? sideA.weaponItemId : undefined}
        monsterIds={[]}
        defenderLooks={watching.looks.slice(3)}
        sceneId={character.sceneId}
        onFinished={() => setWatching(null)}
      />
    )
  }
  return (
    <Dialog title="Team Stone" onClose={onClose} className="w-[44rem]">
      <Tabs label="Team Stone tabs" tabs={TABS} active={tab} onChange={setTab} panelId={panelId} />
      <section
        role="tabpanel"
        id={panelId}
        aria-label={TABS.find((t) => t.id === tab)!.title}
        className="game-inset mt-1 flex flex-col gap-2 p-2 font-game text-[12px] text-black"
      >
        {tab === 'queue' && <QueueTab character={character} watch={setWatching} />}
        {tab === 'league' && <LeagueTab />}
        {tab === 'leaderboard' && <LeaderboardTab />}
        {tab === 'shop' && <ShopTab />}
      </section>
    </Dialog>
  )
}

function useTeamStone() {
  return useQuery({
    queryKey: teamStoneKey,
    queryFn: () => api<TeamStoneView>(BASE),
    refetchInterval: (query) => (query.state.data?.queue ? QUEUE_POLL_MS : false),
  })
}

function QueueTab({
  character,
  watch,
}: {
  character: Character
  watch: (replay: TeamStoneReplay<Replay>) => void
}) {
  const queryClient = useQueryClient()
  const state = useTeamStone()
  const [message, setMessage] = useState<string | null>(null)
  const action = useMutation({
    mutationFn: (path: 'queue' | 'queue/leave') =>
      api<TeamStoneView>(`${BASE}/${path}`, { method: 'POST' }),
    onSuccess: (view) => queryClient.setQueryData(teamStoneKey, view),
  })
  const replay = useMutation({
    mutationFn: (id: string) => api<TeamStoneReplay<Replay>>(`${BASE}/matches/${id}`),
    onSuccess: watch,
  })
  // Leaving the queue without a click means the match was fought: announce its result.
  const wasQueued = useRef(false)
  const data = state.data
  useEffect(() => {
    if (!data) return
    if (wasQueued.current && !data.queue && data.history[0])
      setMessage(`Match over: ${resultText(data.history[0])}.`)
    wasQueued.current = !!data.queue
  }, [data])

  if (state.isPending) return <p>Loading Team Stone...</p>
  if (state.isError) return <Notice tone="error">{errorMessage(state.error)}</Notice>
  const view = state.data
  const league = view.leagues[view.league]!
  const left = view.attemptsPerDay - view.attemptsUsed
  const locked = character.level < view.minLevel
  const error = action.error ?? replay.error
  return (
    <div className="flex flex-col gap-2">
      {locked && <Notice>Team Stone opens at level {view.minLevel}.</Notice>}
      <p>
        Score: <b>{view.score}</b> ({leagueName(league.nameKey)} League). Battle Coins:{' '}
        <b>{view.battleCoins}</b>. Fights left today: {left}/{view.attemptsPerDay}.
      </p>
      <p>
        Queue alone. Teammates and opponents are matched by score. After 15 to 30 seconds, empty
        seats are filled with arena fighters. A fight counts against your daily limit only when it
        starts.
      </p>
      {message && <p role="status">{message}</p>}
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
      {view.queue ? (
        <div className="flex items-center gap-2">
          <span role="status">Searching for a match...</span>
          <GameButton disabled={action.isPending} onClick={() => action.mutate('queue/leave')}>
            Leave queue
          </GameButton>
        </div>
      ) : (
        <GameButton
          disabled={action.isPending || locked || left <= 0}
          onClick={() => {
            setMessage(null)
            action.mutate('queue')
          }}
        >
          Join queue
        </GameButton>
      )}
      <h3 className="font-bold">Recent matches</h3>
      {view.history.length === 0 ? (
        <p>No matches yet.</p>
      ) : (
        <ul aria-label="Recent matches" className="flex flex-col gap-1">
          {view.history.map((entry) => (
            <li key={entry.id} className="game-card flex items-center gap-2 px-2 py-1">
              <span className="flex flex-1 flex-col">
                <span className="font-bold">{resultText(entry)}</span>
                <span>
                  {entry.team.join(', ')} vs {entry.enemy.join(', ')}
                </span>
              </span>
              <GameButton small disabled={replay.isPending} onClick={() => replay.mutate(entry.id)}>
                Watch
              </GameButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LeagueTab() {
  const state = useTeamStone()
  if (state.isPending) return <p>Loading...</p>
  if (state.isError) return <Notice tone="error">{errorMessage(state.error)}</Notice>
  const view = state.data
  return (
    <div className="flex flex-col gap-2">
      <p>
        Every Monday (UTC), your league pays Battle Coins by mail for the week that just ended, if
        you fought at least once in it. Scores reset to 0 on the 1st of each month.
        {view.playedThisWeek ? ' You have fought this week.' : ' You have not fought this week.'}
      </p>
      <table aria-label="Leagues" className="w-full text-left">
        <thead>
          <tr>
            <th>League</th>
            <th>Score</th>
            <th>Weekly reward</th>
          </tr>
        </thead>
        <tbody>
          {view.leagues.map((league, i) => (
            <tr key={league.id} className={i === view.league ? 'font-bold' : ''}>
              <td>
                {leagueName(league.nameKey)}
                {i === view.league ? ' (you)' : ''}
              </td>
              <td>{league.minScore}+</td>
              <td>
                {league.battleCoins} Battle Coins
                {league.item ? `, ${league.amount ?? 1} x ${itemName(league.item)}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LeaderboardTab() {
  const board = useQuery({
    queryKey: [...teamStoneKey, 'leaderboard'],
    queryFn: () => api<TeamStoneLeaderboard>(`${BASE}/leaderboard`),
  })
  if (board.isPending) return <p>Loading...</p>
  if (board.isError) return <Notice tone="error">{errorMessage(board.error)}</Notice>
  const { rows, myPlace } = board.data
  return (
    <div className="flex flex-col gap-2">
      <p>{myPlace ? `Your place: ${myPlace}.` : 'You are not in the top 10 this month.'}</p>
      {rows.length === 0 ? (
        <p>No scores this month yet.</p>
      ) : (
        <table aria-label="Leaderboard" className="w-full text-left">
          <thead>
            <tr>
              <th>Place</th>
              <th>Name</th>
              <th>Level</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.place}>
                <td>{row.place}</td>
                <td>{row.name}</td>
                <td>{row.level}</td>
                <td>{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ShopTab() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [message, setMessage] = useState<string | null>(null)
  const shopKey = [...teamStoneKey, 'shop']
  const shop = useQuery({
    queryKey: shopKey,
    queryFn: () => api<TeamStoneShopView>(`${BASE}/shop`),
  })
  const buy = useMutation({
    mutationFn: (itemId: string) =>
      api<TeamStoneShopResult>(`${BASE}/shop/buy`, { method: 'POST', body: { itemId } }),
    onSuccess: (result, itemId) => {
      queryClient.setQueryData(shopKey, result.shop)
      apply(result)
      setMessage(`You bought ${itemName(itemId)}.`)
    },
  })
  if (shop.isPending) return <p>Loading...</p>
  if (shop.isError) return <Notice tone="error">{errorMessage(shop.error)}</Notice>
  const view = shop.data
  return (
    <div className="flex flex-col gap-2">
      <p>
        Battle Coins: <b>{view.battleCoins}</b>
      </p>
      {message && <p role="status">{message}</p>}
      {buy.error && <Notice tone="error">{errorMessage(buy.error)}</Notice>}
      <ul aria-label="Battle Coin shop" className="grid grid-cols-2 gap-1">
        {view.offers.map((offer) => {
          const name = itemName(offer.itemId)
          return (
            <li key={offer.itemId} className="game-card flex items-center gap-2 px-2 py-1 text-xs">
              <ItemIcon itemId={offer.itemId} name={name} />
              <span className="flex flex-1 flex-col">
                <span className="font-bold">{name}</span>
                <span>{offer.price} Battle Coins</span>
              </span>
              <GameButton
                small
                aria-label={`Buy ${name}`}
                disabled={buy.isPending || offer.price > view.battleCoins}
                onClick={() => buy.mutate(offer.itemId)}
              >
                Buy
              </GameButton>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
