// Reborn's Ninja Diary (WM key ninjaDiary, data/reborn-raw/audit-2026-10-14): tabs Daily Login
// (780x360), Weekly Rewards (780x460) and Task Board (660x450, our daily quests); the window takes
// the size of the open tab. ponytail: "Days Claimed" stands in for Reborn's "Current Streak" (our
// login cycle counts claimed days and never breaks a streak).
import { useId, useState } from 'react'
import type { EventsView } from '../../../../shared/src/schemas/events'
import { errorMessage } from '../api'
import { TaskBoard } from '../daily'
import { Dialog, Notice, Tabs } from '../skin'
import { useEventAction, useEvents } from './api'
import { RewardTile } from './RewardTile'
import { rewardCountdown, useNow } from './timer'
import { WeeklyRewards } from './WeeklyRewards'

type DiaryTab = 'login' | 'weekly' | 'tasks'

const TABS: { id: DiaryTab; title: string }[] = [
  { id: 'login', title: 'Daily Login' },
  { id: 'weekly', title: 'Weekly Rewards' },
  { id: 'tasks', title: 'Task Board' },
]
/** Window width per tab: the tab's panel plus the frame's 5px sides. */
const WIDTH: Record<DiaryTab, string> = {
  login: 'w-[790px]',
  weekly: 'w-[790px]',
  tasks: 'w-[670px]',
}

export function NinjaDiaryWindow({ onClose }: { onClose: () => void }) {
  const events = useEvents()
  const action = useEventAction()
  const [tab, setTab] = useState<DiaryTab>('login')
  const panelId = useId()
  const error = events.error ?? action.error
  const claim = (path: string) => action.mutate(path)
  return (
    <Dialog title="Ninja Diary" onClose={onClose} className={`game-window-bare ${WIDTH[tab]}`}>
      <Tabs label="Ninja Diary" tabs={TABS} active={tab} onChange={setTab} panelId={panelId} />
      <div
        id={panelId}
        role="tabpanel"
        className="flex flex-col gap-1 font-game text-xs text-black"
      >
        {tab === 'tasks' ? (
          <TaskBoard />
        ) : (
          <>
            {events.isPending && <p>Loading rewards...</p>}
            {error && <Notice tone="error">{errorMessage(error)}</Notice>}
            {events.data &&
              (tab === 'login' ? (
                <DailyLogin view={events.data} busy={action.isPending} claim={claim} />
              ) : (
                <WeeklyRewards
                  view={events.data}
                  busy={action.isPending}
                  claim={claim}
                  onTaskBoard={() => setTab('tasks')}
                />
              ))}
          </>
        )}
      </div>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="game-value-box flex h-[44px] flex-col items-center justify-center">
      <dt>{label}</dt>
      <dd className="text-sm font-bold">{value}</dd>
    </div>
  )
}

function DailyLogin({
  view,
  busy,
  claim,
}: {
  view: EventsView
  busy: boolean
  claim: (path: string) => void
}) {
  const now = useNow()
  const { login } = view
  const progress = login.rewards.filter((entry) => entry.claimed).length
  return (
    <div className="game-panel-1 flex h-[360px] w-[780px] flex-col gap-[8px] p-[12px]">
      <header className="game-card flex items-center justify-between px-3 py-2">
        <div>
          <h3 className="text-sm font-bold">Daily Login Rewards</h3>
          <p>Log in daily to earn rewards!</p>
        </div>
        {login.canClaim && (
          <span className="rounded-full bg-[#2f7d1c] px-3 py-1 font-bold text-white">
            Claim Available
          </span>
        )}
      </header>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Days Claimed" value={String(login.completedDays)} />
        <Stat label="Cycle Progress" value={`${progress}/${login.rewards.length}`} />
        <Stat
          label={login.canClaim ? 'Reward ready!' : 'Next Reward'}
          value={`Day ${login.nextDay}`}
        />
      </dl>
      <p role="status" className="text-center">
        {login.canClaim
          ? 'Your reward is ready to claim!'
          : `Next reward unlocks in ${rewardCountdown(view.resetAt, now)}`}
      </p>
      <div className="flex justify-center gap-[6px]">
        <ul aria-label="Login rewards" className="flex gap-[6px]">
          {login.rewards.map((entry) => (
            <RewardTile
              key={entry.day}
              label={`Day ${entry.day}`}
              reward={entry.reward}
              claimed={entry.claimed}
              canClaim={login.canClaim && entry.day === login.nextDay}
              busy={busy}
              onClaim={() => claim('login/claim')}
              size={76}
            />
          ))}
        </ul>
        <ul aria-label="Daily bonus">
          <RewardTile
            label="Daily Bonus"
            reward={login.bonus}
            claimed={!login.canClaimBonus}
            canClaim={login.canClaimBonus}
            busy={busy}
            onClaim={() => claim('login/bonus')}
            size={76}
          />
        </ul>
      </div>
    </div>
  )
}
