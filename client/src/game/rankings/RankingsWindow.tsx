// Rankings window after Pockie Ninja Reborn (data/reborn-raw/audit-2026-10-14, "Rankings"): a 542px
// panel with category tabs, Refresh, "Your Rank" and the Rank / Player Name / Level / metric /
// (Arena Rank) / Village table, 10 rows a page. Reborn's tabs are Arena, Level, Pet Tracing and
// Stats; ours are the lists we rank (decision 13) plus the Demon City weekly toll gate rankings
// with last week's reward claim. ponytail: no Pet Tracing / Stats lists, no Clan Name column (no
// clans) and player names are not clickable (no View Character window yet).
import {
  RANKING_PAGE_SIZE,
  type RankingKey,
  type RankingRow,
  type TollGateWeek,
} from '@pockie/shared'
import { useId, useState, type ReactNode } from 'react'
import { errorMessage } from '../api'
import { tierName } from '../arena/labels'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { plainText } from '../text'
import { useClaimTollGateReward, useRankingPage, useRankingTree, useTollGateRanking } from './api'

type Tab = RankingKey | 'tollGates'

const TABS: { id: Tab; title: string }[] = [
  { id: 'arena', title: 'Arena' },
  { id: 'level', title: 'Level' },
  { id: 'stone', title: 'Stone' },
  { id: 'lasNoches', title: 'Las Noches' },
  { id: 'tollGates', title: 'Toll Gates' },
]

/** The metric column title per list (Reborn: "Score" for Arena, "Experience" for Level). */
const METRIC: Record<RankingKey, string> = {
  arena: 'Score',
  level: 'Experience',
  stone: 'Stone',
  lasNoches: 'Best Floor',
}

const number = (value: number) => value.toLocaleString('en-US')
const village = (nation: number) => plainText(`lg_Common_Nation_${nation}`, `Village ${nation}`)
const gateName = (gate: { id: number; nameKey: string }) =>
  plainText(gate.nameKey, `Toll Gate ${gate.id}`)

export function RankingsWindow({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('arena')
  const panelId = useId()
  return (
    <Dialog title="Rankings" onClose={onClose} className="game-window-bare w-[552px]">
      <div className="w-[542px] font-game text-xs text-black">
        <Tabs label="Rankings" tabs={TABS} active={tab} onChange={setTab} panelId={panelId} />
        <div id={panelId} role="tabpanel" className="game-panel-1 relative h-[320px] p-[4px]">
          {tab === 'tollGates' ? <TollGateBoard /> : <ListBoard key={tab} listKey={tab} />}
        </div>
      </div>
    </Dialog>
  )
}

/** The row above the table: Refresh, the tab's own pickers and the "Your Rank" box. */
function Toolbar({
  busy,
  onRefresh,
  myPlace,
  children,
}: {
  busy: boolean
  onRefresh: () => void
  myPlace: number | null | undefined
  children?: ReactNode
}) {
  return (
    <div className="flex h-[24px] items-center gap-[5px] pl-px">
      <GameButton className="h-[23px] w-[70px] !min-w-0 !px-0" disabled={busy} onClick={onRefresh}>
        Refresh
      </GameButton>
      {children}
      <span className="game-value-box ml-auto flex h-[24px] w-[206px] items-center px-2">
        {`Your Rank ${myPlace ?? '--'}`}
      </span>
    </div>
  )
}

interface TableRow {
  place: number
  name: string
  level: number
  nation: number
  metric: string
  rankName?: string
}

const CELL = 'h-[20px] px-1 text-center whitespace-nowrap'

function RankTable({ metric, rows }: { metric: string; rows: TableRow[] }) {
  if (rows.length === 0) return <p className="mt-[30px] text-center">No leaderboard data</p>
  const rankName = rows.some((row) => row.rankName !== undefined)
  const columns: [string, string][] = [
    ['Rank', 'w-[50px]'],
    ['Player Name', 'w-[120px]'],
    ['Level', 'w-[60px]'],
    [metric, 'w-[80px]'],
    ...(rankName ? ([['Arena Rank', 'w-[100px]']] as [string, string][]) : []),
    ['Village', 'w-[102px]'],
  ]
  return (
    <table className="mt-[6px] border-separate border-spacing-[2px]">
      <thead>
        <tr>
          {columns.map(([title, width]) => (
            <th key={title} className={`game-title-plate font-bold text-white ${CELL} ${width}`}>
              {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.place}>
            <td className={`game-value-box ${CELL}`}>{row.place}</td>
            <td className={`game-value-box ${CELL} max-w-[120px] truncate`}>{row.name}</td>
            <td className={`game-value-box ${CELL}`}>{row.level}</td>
            <td className={`game-value-box ${CELL}`}>{row.metric}</td>
            {rankName && <td className={`game-value-box ${CELL}`}>{row.rankName}</td>}
            <td className={`game-value-box ${CELL}`}>{village(row.nation)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const tableRow =
  (key: RankingKey) =>
  (row: RankingRow): TableRow => ({
    ...row,
    metric: number(row.value),
    ...(key === 'arena' ? { rankName: tierName(row.tier ?? 0) } : {}),
  })

function ListBoard({ listKey }: { listKey: RankingKey }) {
  const [page, setPage] = useState<number | 'me'>(1)
  const query = useRankingPage(listKey, page)
  const { data } = query
  return (
    <>
      <Toolbar
        busy={query.isFetching}
        onRefresh={() => void query.refetch()}
        myPlace={data?.myPlace}
      />
      {query.isPending && <p className="mt-[30px] text-center">Loading...</p>}
      {query.isError && <Notice tone="error">{errorMessage(query.error)}</Notice>}
      {data && (
        <>
          <RankTable metric={METRIC[listKey]} rows={data.rows.map(tableRow(listKey))} />
          <Pager page={data.page} pages={data.pages} onPage={setPage}>
            <GameButton small onClick={() => setPage('me')}>
              Find Me
            </GameButton>
          </Pager>
        </>
      )}
    </>
  )
}

/** The Demon City weekly rankings: one gate at a time, this week or last week. */
function TollGateBoard() {
  const tree = useRankingTree()
  const [gateId, setGateId] = useState<number | null>(null)
  if (tree.isPending) return <p className="mt-[30px] text-center">Loading...</p>
  if (tree.isError) return <Notice tone="error">{errorMessage(tree.error)}</Notice>
  const gates = tree.data.tollGates.gates
  const selected = gateId ?? gates[0]?.id
  if (selected === undefined) return <p className="mt-[30px] text-center">No leaderboard data</p>
  return (
    <GateBoard
      key={selected}
      gateId={selected}
      picker={
        <select
          aria-label="Toll gate"
          value={selected}
          onChange={(event) => setGateId(Number(event.target.value))}
          className="h-[24px] w-[170px] border border-wood-light bg-parchment"
        >
          {gates.map((gate) => (
            <option key={gate.id} value={gate.id}>
              {gateName(gate)}
            </option>
          ))}
        </select>
      }
    />
  )
}

type WeekTab = 'thisWeek' | 'lastWeek'

function GateBoard({ gateId, picker }: { gateId: number; picker: ReactNode }) {
  const query = useTollGateRanking(gateId)
  const claim = useClaimTollGateReward()
  const [tab, setTab] = useState<WeekTab>('thisWeek')
  const [page, setPage] = useState(1)
  const week: TollGateWeek | undefined = query.data?.[tab]
  const pages = Math.max(1, Math.ceil((week?.rows.length ?? 0) / RANKING_PAGE_SIZE))
  const rows = (week?.rows ?? [])
    .slice((page - 1) * RANKING_PAGE_SIZE, page * RANKING_PAGE_SIZE)
    .map((row) => ({ ...row, metric: `${row.schedule}%` }))
  const reward = query.data?.lastWeek.reward
  return (
    <>
      <Toolbar
        busy={query.isFetching}
        onRefresh={() => void query.refetch()}
        myPlace={week?.myPlace}
      >
        {picker}
        <select
          aria-label="Week"
          value={tab}
          onChange={(event) => {
            setTab(event.target.value as WeekTab)
            setPage(1)
          }}
          className="h-[24px] w-[90px] border border-wood-light bg-parchment"
        >
          <option value="thisWeek">This Week</option>
          <option value="lastWeek">Last Week</option>
        </select>
      </Toolbar>
      {query.isPending && <p className="mt-[30px] text-center">Loading...</p>}
      {query.isError && <Notice tone="error">{errorMessage(query.error)}</Notice>}
      {week && (
        <>
          <RankTable metric="Progress" rows={rows} />
          <Pager page={page} pages={pages} onPage={setPage} />
        </>
      )}
      {tab === 'lastWeek' && reward && (
        <div className="mt-1 flex items-center justify-center gap-2">
          <span>
            Reward for place {reward.place}: {number(reward.exp)} EXP, {number(reward.stone)} Stone
          </span>
          <GameButton
            small
            disabled={reward.claimed || claim.isPending}
            onClick={() => claim.mutate(gateId)}
          >
            {reward.claimed ? 'Claimed' : 'Claim'}
          </GameButton>
        </div>
      )}
      {claim.isError && <Notice tone="error">{errorMessage(claim.error)}</Notice>}
    </>
  )
}

const PAGE_BUTTONS = {
  first:
    'bg-(image:--ui-page-first-up) hover:bg-(image:--ui-page-first-over) active:bg-(image:--ui-page-first-down)',
  prev: 'bg-(image:--ui-page-prev-up) hover:bg-(image:--ui-page-prev-over) active:bg-(image:--ui-page-prev-down)',
  next: 'bg-(image:--ui-page-next-up) hover:bg-(image:--ui-page-next-over) active:bg-(image:--ui-page-next-down)',
  last: 'bg-(image:--ui-page-last-up) hover:bg-(image:--ui-page-last-over) active:bg-(image:--ui-page-last-down)',
}

function Pager({
  page,
  pages,
  onPage,
  children,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
  children?: ReactNode
}) {
  const button = (name: keyof typeof PAGE_BUTTONS, label: string, target: number) => (
    <button
      type="button"
      aria-label={label}
      disabled={target === page || target < 1 || target > pages}
      onClick={() => onPage(target)}
      className={`h-[15px] w-[17px] bg-contain disabled:opacity-50 ${PAGE_BUTTONS[name]}`}
    />
  )
  return (
    <div className="mt-1 flex items-center justify-center gap-2">
      {button('first', 'First page', 1)}
      {button('prev', 'Previous page', page - 1)}
      <span>
        Page {page} / {pages}
      </span>
      {button('next', 'Next page', page + 1)}
      {button('last', 'Last page', pages)}
      {children}
    </div>
  )
}
