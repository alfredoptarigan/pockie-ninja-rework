// Rankings window (UI_GameTop, HUD button "Rank"): the list tree on the left, the ranking table on
// the right with the original pager (first/prev/next/last) and Find me; the Demon City group holds
// the weekly toll gate rankings (TollGateRankFrame) with last week's reward claim.
import {
  RANKING_PAGE_SIZE,
  type RankingKey,
  type RankingTree,
  type TollGateWeek,
} from '@pockie/shared'
import { useState, type ReactNode } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { plainText } from '../text'
import { useClaimTollGateReward, useRankingPage, useRankingTree, useTollGateRanking } from './api'

type Selection = { kind: 'list'; key: RankingKey } | { kind: 'gate'; gateId: number }

const village = (nation: number) => plainText(`lg_Common_Nation_${nation}`, `Village ${nation}`)
const gateName = (gate: { id: number; nameKey: string }) =>
  plainText(gate.nameKey, `Toll Gate ${gate.id}`)

const VALUE_TITLE: Record<RankingKey, string> = {
  level: 'EXP',
  stone: 'Stone',
  lasNoches: 'Best Floor',
  arena: 'Score',
}

export function RankingsWindow({ onClose }: { onClose: () => void }) {
  const tree = useRankingTree()
  const [selection, setSelection] = useState<Selection>({ kind: 'list', key: 'level' })
  return (
    <Dialog title="Rankings" onClose={onClose} className="w-[46rem]">
      {tree.isPending && <p>Loading...</p>}
      {tree.isError && <Notice tone="error">{errorMessage(tree.error)}</Notice>}
      {tree.data && (
        <div className="flex gap-3">
          <ListTree tree={tree.data} selection={selection} onSelect={setSelection} />
          <div className="min-w-0 flex-1">
            {selection.kind === 'list' ? (
              <ListTable key={selection.key} listKey={selection.key} />
            ) : (
              <TollGateTable key={selection.gateId} gateId={selection.gateId} />
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function ListTree({
  tree,
  selection,
  onSelect,
}: {
  tree: RankingTree
  selection: Selection
  onSelect: (selection: Selection) => void
}) {
  const groups = new Map<string, { label: string; selection: Selection }[]>()
  for (const list of tree.lists) {
    const items = groups.get(list.group) ?? []
    groups.set(list.group, [
      ...items,
      { label: list.label, selection: { kind: 'list', key: list.key } },
    ])
  }
  groups.set(
    tree.tollGates.group,
    tree.tollGates.gates.map((gate) => ({
      label: gateName(gate),
      selection: { kind: 'gate', gateId: gate.id },
    })),
  )
  const same = (a: Selection, b: Selection) =>
    a.kind === 'list' && b.kind === 'list'
      ? a.key === b.key
      : a.kind === 'gate' && b.kind === 'gate' && a.gateId === b.gateId
  return (
    <nav aria-label="Ranking lists" className="w-44 shrink-0">
      <ul className="flex flex-col gap-1">
        {[...groups].map(([group, items]) => (
          <li key={group}>
            <span className="flex items-center gap-1 font-bold">
              <span aria-hidden className="size-4 bg-(image:--ui-tree-folder-open) bg-contain" />
              {group === tree.tollGates.group ? `${group}: ${tree.tollGates.label}` : group}
            </span>
            <ul className="ml-4">
              {items.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    aria-current={same(item.selection, selection) ? 'true' : undefined}
                    onClick={() => onSelect(item.selection)}
                    className="flex items-center gap-1 text-left hover:underline aria-[current=true]:font-bold aria-[current=true]:text-[#a01010]"
                  >
                    <span
                      aria-hidden
                      className="size-4 shrink-0 bg-(image:--ui-tree-leaf) bg-contain"
                    />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
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
    <div className="mt-2 flex items-center gap-2">
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

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} className="border-b border-wood-light px-1 py-0.5">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

function ListTable({ listKey }: { listKey: RankingKey }) {
  const [page, setPage] = useState<number | 'me'>(1)
  const { data, isPending, isError, error } = useRankingPage(listKey, page)
  if (isPending) return <p>Loading...</p>
  if (isError) return <Notice tone="error">{errorMessage(error)}</Notice>
  const arena = listKey === 'arena'
  return (
    <div>
      {data.rows.length === 0 ? (
        <p>Nobody is ranked yet.</p>
      ) : (
        <Table
          headers={[
            'Place',
            'Name',
            'Level',
            'Village',
            ...(arena ? ['Tier'] : []),
            VALUE_TITLE[listKey],
          ]}
        >
          {data.rows.map((row) => (
            <tr key={row.place}>
              <td className="px-1">{row.place}</td>
              <td className="px-1">{row.name}</td>
              <td className="px-1">{row.level}</td>
              <td className="px-1">{village(row.nation)}</td>
              {arena && <td className="px-1">{row.tier}</td>}
              <td className="px-1">{row.value}</td>
            </tr>
          ))}
        </Table>
      )}
      <p role="status" className="mt-2">
        {data.myPlace ? `Your place: ${data.myPlace}` : 'You are not in the top 100.'}
      </p>
      <Pager page={data.page} pages={data.pages} onPage={setPage}>
        <GameButton small onClick={() => setPage('me')}>
          Find me
        </GameButton>
      </Pager>
    </div>
  )
}

type WeekTab = 'thisWeek' | 'lastWeek'

function TollGateTable({ gateId }: { gateId: number }) {
  const { data, isPending, isError, error } = useTollGateRanking(gateId)
  const claim = useClaimTollGateReward()
  const [tab, setTab] = useState<WeekTab>('thisWeek')
  const [page, setPage] = useState(1)
  if (isPending) return <p>Loading...</p>
  if (isError) return <Notice tone="error">{errorMessage(error)}</Notice>
  const week: TollGateWeek = data[tab]
  const pages = Math.max(1, Math.ceil(week.rows.length / RANKING_PAGE_SIZE))
  const rows = week.rows.slice((page - 1) * RANKING_PAGE_SIZE, page * RANKING_PAGE_SIZE)
  const reward = data.lastWeek.reward
  const panelId = `toll-gate-ranking-${gateId}`
  return (
    <div>
      <Tabs
        label="Week"
        panelId={panelId}
        tabs={[
          { id: 'thisWeek', title: 'This Week' },
          { id: 'lastWeek', title: 'Last Week' },
        ]}
        active={tab}
        onChange={(next) => {
          setTab(next)
          setPage(1)
        }}
      />
      <div id={panelId} role="tabpanel" className="mt-2">
        {rows.length === 0 ? (
          <p>Nobody is ranked yet.</p>
        ) : (
          <Table headers={['Place', 'Name', 'Level', 'Village', 'Progress']}>
            {rows.map((row) => (
              <tr key={row.place}>
                <td className="px-1">{row.place}</td>
                <td className="px-1">{row.name}</td>
                <td className="px-1">{row.level}</td>
                <td className="px-1">{village(row.nation)}</td>
                <td className="px-1">{row.schedule}%</td>
              </tr>
            ))}
          </Table>
        )}
        <p role="status" className="mt-2">
          {week.myPlace ? `Your place: ${week.myPlace}` : 'You are not in the top 50.'}
        </p>
        <Pager page={page} pages={pages} onPage={setPage} />
        {tab === 'lastWeek' && reward && (
          <div className="mt-2 flex items-center gap-2">
            <span>
              Reward for place {reward.place}: {reward.exp} EXP, {reward.stone} Stone
            </span>
            {reward.claimed ? (
              <span>Claimed</span>
            ) : (
              <GameButton small disabled={claim.isPending} onClick={() => claim.mutate(gateId)}>
                Claim
              </GameButton>
            )}
          </div>
        )}
        {claim.isError && <Notice tone="error">{errorMessage(claim.error)}</Notice>}
      </div>
    </div>
  )
}
