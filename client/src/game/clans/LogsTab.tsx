// Reborn's Clan window Logs tab (`Wh` @2885714): "Clan Activity Log" with a member filter (All
// Members / names), rows of time ago / action / actor / details, 12 a page in a 270px area, a pager;
// polled every 15 s.
import { useMemo, useState } from 'react'
import { errorMessage } from '../api'
import { Pager, usePages } from '../social/Pager'
import { Notice } from '../skin'
import { useClanLogs } from './activities-api'

const LOGS_PER_PAGE = 12
const MINUTE_MS = 60_000

export function timeAgo(iso: string, now = Date.now()) {
  const ms = now - Date.parse(iso)
  const minutes = Math.floor(ms / MINUTE_MS)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function LogsTab({ members }: { members: string[] }) {
  const logs = useClanLogs()
  const [actor, setActor] = useState('')
  const rows = useMemo(() => logs.data?.logs ?? [], [logs.data])
  const actors = useMemo(
    () =>
      [
        ...new Set([...members, ...rows.map((row) => row.actor).filter((a) => a !== 'System')]),
      ].sort((a, b) => a.localeCompare(b)),
    [members, rows],
  )
  const shown = actor ? rows.filter((row) => row.actor === actor) : rows
  const { page, pages, setPage, rows: pageRows } = usePages(shown, LOGS_PER_PAGE)
  return (
    <div className="game-panel-1 flex h-[374px] flex-col p-2 text-[11px] text-black">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-bold">Clan Activity Log</p>
        <select
          aria-label="Member"
          value={actor}
          onChange={(event) => {
            setActor(event.target.value)
            setPage(1)
          }}
          className="max-w-[140px] rounded-[3px] border border-[#999] bg-white px-1 py-[2px] text-[10px]"
        >
          <option value="">All Members</option>
          {actors.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {logs.isError && <Notice tone="error">{errorMessage(logs.error)}</Notice>}
      {logs.isPending ? (
        <p className="pt-[50px] text-center text-[#666]">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="pt-[50px] text-center text-[#666]">
          {actor ? `No logs for ${actor}` : 'No logs yet'}
        </p>
      ) : (
        <>
          <ul aria-label="Clan Activity Log" className="h-[270px] overflow-y-auto">
            {pageRows.map((row, index) => (
              <li
                key={row.id}
                className={`flex min-h-[24px] items-center gap-2 border-b border-[#8b4513] px-2 py-[5px] ${
                  index % 2 ? 'bg-[#eeddb4]' : 'bg-[#f5e7c4]'
                }`}
              >
                <span className="w-[55px] shrink-0 text-[10px] text-[#888]">{timeAgo(row.at)}</span>
                <span className="w-[120px] shrink-0 font-semibold text-[#3a2310]">
                  {row.action}
                </span>
                <span className="w-[90px] shrink-0 font-medium text-[#1a7a1a]">{row.actor}</span>
                <span className="flex-1 truncate text-[#555]">{row.details}</span>
              </li>
            ))}
          </ul>
          <Pager page={page} pages={pages} onPage={setPage} className="mt-2" />
        </>
      )}
    </div>
  )
}
