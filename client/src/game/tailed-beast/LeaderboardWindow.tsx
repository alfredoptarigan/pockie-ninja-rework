// Reborn's Tailed Beast Leaderboard (reborn-windows-M-Z-hud.md, `Pn`): a 520x345 panel with
// Your Rank / Honor chips, village tabs, Refresh with a 3 s cooldown and a 10-row table.
// ponytail: no Damage chip or column (we keep Honor only, not damage per ninja); the third chip is
// the tab's village Honor and Level fills Damage's column. Village tabs filter the top 100.
import { useEffect, useId, useState } from 'react'
import type { TailedBeastView } from '../../../../shared/src/schemas/tailed-beast'
import { Dialog, GameButton, Tabs } from '../skin'
import { number, REBORN_VILLAGE_ORDER, VILLAGES } from './api'

const PAGE = 10
const COOLDOWN_S = 3
const RANK_COLORS = ['#D4A017', '#7A8B8B', '#CD7F32']
type Tab = 'all' | `${number}`
const TABS: { id: Tab; title: string }[] = [
  { id: 'all', title: 'All' },
  ...REBORN_VILLAGE_ORDER.map((v) => ({ id: `${v}` as Tab, title: VILLAGES[v]! })),
]
const COLUMNS: [string, string][] = [
  ['Rank', 'w-[50px]'],
  ['Player Name', 'w-[140px]'],
  ['Level', 'w-[90px]'],
  ['Honor', 'w-[80px]'],
  ['Village', 'w-[132px]'],
]
const CELL = 'h-[20px] px-1 text-center whitespace-nowrap'

export function LeaderboardWindow({
  view,
  fetching,
  onRefresh,
  onClose,
}: {
  view: TailedBeastView
  fetching: boolean
  onRefresh: () => Promise<unknown>
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const panelId = useId()
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])
  const village = tab === 'all' ? null : Number(tab)
  const rows = view.leaderboard.filter((row) => village === null || row.village === village)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const shown = rows.slice(page * PAGE, (page + 1) * PAGE)
  const myRank = village === null || village === view.me.village ? view.me.place : null
  const villageHonor = view.villages
    .filter((v) => village === null || v.village === village)
    .reduce((sum, v) => sum + v.honor, 0)
  return (
    <Dialog
      title="Tailed Beast Leaderboard"
      onClose={onClose}
      className="game-window-bare w-[530px]"
    >
      <div className="game-panel-1 relative h-[345px] p-[4px] font-game text-xs">
        <div className="flex gap-[5px] pl-px">
          <span className="game-title-plate flex h-[22px] w-[160px] items-center px-2 text-white">
            Your Rank: {myRank ? `#${myRank}` : '--'}
          </span>
          <span className="game-title-plate flex h-[22px] w-[160px] items-center px-2 text-white">
            Honor: {number(view.me.honor)}
          </span>
          <span className="game-title-plate flex h-[22px] w-[170px] items-center px-2 text-white">
            Village Honor: {number(villageHonor)}
          </span>
        </div>
        <div className="mt-[5px] flex items-end justify-between">
          <Tabs
            label="Villages"
            tabs={TABS}
            active={tab}
            onChange={(next) => {
              setTab(next)
              setPage(0)
            }}
            panelId={panelId}
          />
          <GameButton
            className="h-[22px] w-[70px] !min-w-0 !px-0"
            disabled={fetching || cooldown > 0}
            onClick={() => void onRefresh().then(() => setCooldown(COOLDOWN_S))}
          >
            {fetching ? 'Loading...' : cooldown > 0 ? `${cooldown}s` : 'Refresh'}
          </GameButton>
        </div>
        <div id={panelId} role="tabpanel">
          <table className="mt-[4px] border-separate border-spacing-[2px]">
            <thead>
              <tr>
                {COLUMNS.map(([title, width]) => (
                  <th
                    key={title}
                    className={`game-title-plate font-bold text-white ${CELL} ${width}`}
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.place}>
                  <td
                    className={`game-value-box font-bold ${CELL}`}
                    style={{ color: RANK_COLORS[row.place - 1] }}
                  >
                    #{row.place}
                  </td>
                  <td className={`game-value-box ${CELL} max-w-[140px] truncate`}>{row.name}</td>
                  <td className={`game-value-box ${CELL}`}>{row.level}</td>
                  <td className={`game-value-box ${CELL}`}>{number(row.honor)}</td>
                  <td className={`game-value-box ${CELL}`}>{VILLAGES[row.village]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="mt-[30px] text-center">No leaderboard data</p>}
        </div>
        <div className="absolute top-[300px] right-0 left-0 flex items-center justify-center gap-2">
          <GameButton
            small
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            &lt;
          </GameButton>
          <span>
            {page + 1} / {pages}
          </span>
          <GameButton
            small
            aria-label="Next page"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            &gt;
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}
