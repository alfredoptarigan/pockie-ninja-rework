// Reborn's Clan window (`Ih`, 860 wide), opened by the bottom-bar Clan icon; without a clan the
// same icon opens the Clan Browser. Tabs: Management (notice, info, Manage / Applications / Quit
// and the member table), Events (clan level bar; the Garden and Picnic tiles, EventsTab.tsx),
// Storage (treasury currencies) and Clans (read-only list). Reborn's Logs tab and the other
// Events tiles (Training, Protection, Clan Wars, Adventure, Missions) are not built.
import {
  CLAN_MAX_MEMBERS,
  CLAN_NOTICE_MAX,
  CLAN_ROLE_TITLES,
  isClanOfficer,
  type ClanView,
} from '@pockie/shared'
import { useId, useState } from 'react'
import { errorMessage } from '../api'
import { Pager, usePages } from '../social/Pager'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import type { WindowProps } from '../windows'
import { useClanAction, useMyClan } from './api'
import { ClanBrowserWindow, ClanList } from './ClanBrowserWindow'
import { EventsTab } from './EventsTab'
import { ApplicationsWindow, ManageWindow } from './ManageWindow'
import { StorageTab } from './StorageTab'

type Tab = 'management' | 'events' | 'storage' | 'clans'
const TABS: { id: Tab; title: string }[] = [
  { id: 'management', title: 'Management' },
  { id: 'events', title: 'Events' },
  { id: 'storage', title: 'Storage' },
  { id: 'clans', title: 'Clans' },
]
const MEMBERS_PER_PAGE = 13
const CELL = 'px-1 text-center'

/** Reborn's Quit confirm; the leader's own line (no English string in Reborn) names the heir. */
function quitQuestion(clan: ClanView, selfId: string) {
  if (clan.myRole !== 'leader') return 'Are you sure you want to leave this clan?'
  const heir = clan.members.find((m) => m.characterId !== selfId)
  return heir
    ? `You lead this clan. Leaving makes ${heir.name} the new leader. Leave this clan?`
    : 'Disband this clan?'
}

function NoticeBox({ clan }: { clan: ClanView }) {
  const [draft, setDraft] = useState<string | null>(null)
  const save = useClanAction()
  const leader = clan.myRole === 'leader'
  const text = draft ?? clan.notice
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label htmlFor="clan-notice" className="font-bold">
          Notice
        </label>
        {leader && (
          <GameButton
            small
            disabled={save.isPending}
            onClick={() =>
              draft === null
                ? setDraft(clan.notice)
                : save.mutate(
                    { path: 'notice', body: { notice: draft } },
                    { onSuccess: () => setDraft(null) },
                  )
            }
          >
            {save.isPending ? 'Saving' : draft === null ? 'Edit' : 'Save'}
          </GameButton>
        )}
      </div>
      <textarea
        id="clan-notice"
        value={text}
        readOnly={draft === null}
        maxLength={CLAN_NOTICE_MAX}
        onChange={(event) => setDraft(event.target.value)}
        className="h-[120px] w-full resize-none border border-black/30 bg-white/70 p-1"
      />
      <span className="self-end text-[11px]">
        {text.length}/{CLAN_NOTICE_MAX}
      </span>
      {save.isError && <Notice tone="error">{errorMessage(save.error)}</Notice>}
    </div>
  )
}

function MemberTable({ clan }: { clan: ClanView }) {
  const { page, pages, setPage, rows } = usePages(clan.members, MEMBERS_PER_PAGE)
  return (
    <div className="flex flex-1 flex-col gap-1">
      <table className="w-full border-collapse" aria-label="Members">
        <thead>
          <tr className="game-title-plate h-[22px] text-white">
            <th className="px-1 text-left">Player</th>
            <th className={CELL}>Lvl</th>
            <th className={CELL}>Position</th>
            <th className={CELL}>Weekly</th>
            <th className={CELL}>Overall</th>
            <th className={CELL}>Offline</th>
            <th className={CELL}>On</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, index) => (
            <tr
              key={m.characterId}
              aria-label={m.name}
              className={`h-[22px] ${index % 2 ? 'game-value-box' : 'game-text-box'}`}
            >
              <td className="px-1">{m.name}</td>
              <td className={CELL}>{m.level}</td>
              <td className={CELL}>{CLAN_ROLE_TITLES[m.role]}</td>
              <td className={CELL}>{m.weeklyPoints}</td>
              <td className={CELL}>{m.totalPoints}</td>
              <td className={CELL}>{m.online ? '-' : `${m.offlineDays}d`}</td>
              <td className={CELL}>
                <span
                  role="img"
                  aria-label={m.online ? 'Online' : 'Offline'}
                  className={m.online ? 'text-[#1f9a1f]' : ''}
                >
                  {m.online ? '●' : '○'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} pages={pages} onPage={setPage} className="mt-auto" />
    </div>
  )
}

function ManagementTab({ clan, selfId }: { clan: ClanView; selfId: string }) {
  const [open, setOpen] = useState<'manage' | 'applications' | null>(null)
  const quit = useClanAction()
  const officer = isClanOfficer(clan.myRole)
  const leader = clan.members.find((m) => m.role === 'leader')
  return (
    <div className="flex gap-2 text-[12px] text-black">
      <div className="game-panel-1 flex w-[240px] flex-col gap-2 p-2">
        <NoticeBox clan={clan} />
        <dl className="grid grid-cols-[70px_1fr]">
          <dt>Name</dt>
          <dd className="font-bold">{clan.name}</dd>
          <dt>Leader</dt>
          <dd>{leader?.name}</dd>
          <dt>Members</dt>
          <dd>
            {clan.members.length}/{CLAN_MAX_MEMBERS}
          </dd>
          <dt>Level</dt>
          <dd>{clan.level}</dd>
        </dl>
        {quit.isError && <Notice tone="error">{errorMessage(quit.error)}</Notice>}
        <div className="mt-auto grid grid-cols-2 gap-1">
          {officer && <GameButton onClick={() => setOpen('manage')}>Manage</GameButton>}
          {officer && <GameButton onClick={() => setOpen('applications')}>Applications</GameButton>}
          <GameButton
            disabled={quit.isPending}
            onClick={() =>
              window.confirm(quitQuestion(clan, selfId)) && quit.mutate({ path: 'leave' })
            }
          >
            Quit
          </GameButton>
        </div>
      </div>
      <MemberTable clan={clan} />
      {open === 'manage' && officer && <ManageWindow clan={clan} onClose={() => setOpen(null)} />}
      {open === 'applications' && officer && <ApplicationsWindow onClose={() => setOpen(null)} />}
    </div>
  )
}

export function ClanWindow({ character, onClose }: WindowProps) {
  const [tab, setTab] = useState<Tab>('management')
  const panelId = useId()
  const mine = useMyClan()
  if (mine.isError)
    return (
      <Dialog title="Clan" onClose={onClose}>
        <Notice tone="error">{errorMessage(mine.error)}</Notice>
      </Dialog>
    )
  if (!mine.data) return null
  const clan = mine.data.clan
  if (!clan) return <ClanBrowserWindow character={character} onClose={onClose} />
  return (
    <Dialog title="Clan" onClose={onClose} className="w-[880px]">
      <Tabs label="Clan" panelId={panelId} active={tab} onChange={setTab} tabs={TABS} />
      <div id={panelId} role="tabpanel" className="mt-1 min-h-[384px]">
        {tab === 'management' && <ManagementTab clan={clan} selfId={character.id} />}
        {tab === 'events' && <EventsTab />}
        {tab === 'storage' && <StorageTab clan={clan} selfId={character.id} />}
        {tab === 'clans' && <ClanList canApply={false} />}
      </div>
    </Dialog>
  )
}
