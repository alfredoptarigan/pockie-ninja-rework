// Reborn's Weekly Rewards tab (780x460): header with the points pill, the weekly tasks in two
// columns with Go, the points rewards, the Sun-Sat day rewards and the Bonus. ponytail: Go only
// where we have a window to open (Arena, Friends) or the Task Board tab; Reborn's scene jumps
// (Valhalla, Las Noches, slot fields) wait for a travel shortcut.
import type { EventsView } from '../../../../shared/src/schemas/events'
import { useOpenWindow, type WindowName } from '../windows'
import { GameButton } from '../skin'
import { RewardTile } from './RewardTile'

/** Day rewards need this many weekly points. */
const DAY_REWARD_POINTS = 50
/** Our weekday numbers (1 Monday ... 7 Sunday) as Reborn's labels. */
const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const GO_WINDOW: Partial<Record<string, WindowName>> = { arenaDuel: 'arena', duelFriend: 'friends' }

export function WeeklyRewards({
  view,
  busy,
  claim,
  onTaskBoard,
}: {
  view: EventsView
  busy: boolean
  claim: (path: string) => void
  onTaskBoard: () => void
}) {
  const open = useOpenWindow()
  const { weekly } = view
  const rows = Math.ceil(weekly.activities.length / 2)
  // Reborn's week row starts on Sunday.
  const days = [...weekly.weekdays].sort((a, b) => (a.day % 7) - (b.day % 7))
  const allDays = weekly.weekdays.every((entry) => entry.claimed)
  const goFor = (id: string) => {
    if (id === 'mission') return onTaskBoard
    const window = GO_WINDOW[id]
    return window ? () => open(window) : undefined
  }
  return (
    <div className="game-panel-1 flex h-[460px] w-[780px] flex-col gap-[8px] p-[12px]">
      <header className="game-card flex items-center justify-between px-3 py-2">
        <div>
          <h3 className="text-base font-bold uppercase">Weekly Rewards</h3>
          <p>Complete daily tasks to earn points and unlock rewards.</p>
        </div>
        <span className="rounded-full bg-[#7a5a2a] px-3 py-1 font-bold text-white">
          {`Points: ${weekly.points}`}
        </span>
      </header>
      <ul
        aria-label="Weekly tasks"
        className="grid grid-flow-col grid-cols-2 gap-x-3 gap-y-[3px]"
        style={{ gridTemplateRows: `repeat(${rows}, auto)` }}
      >
        {weekly.activities.map((activity) => {
          const complete = activity.count >= activity.max
          const go = complete ? undefined : goFor(activity.id)
          return (
            <li
              key={activity.id}
              aria-label={activity.label}
              className="game-value-box flex h-[22px] items-center gap-2 px-2"
            >
              <span className="flex-1 truncate">{activity.label}</span>
              <span>{`${Math.min(activity.count, activity.max)}/${activity.max}${complete ? ' ✓' : ''}`}</span>
              <span className="w-[44px] text-right">{`${activity.points} pts`}</span>
              <span className="w-[36px]">
                {go && (
                  <GameButton className="h-[16px] w-[36px] !min-h-0 !min-w-0 !px-0" onClick={go}>
                    Go
                  </GameButton>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <ul aria-label="Points rewards" className="flex justify-center gap-[6px]">
        {weekly.milestones.map((entry) => (
          <RewardTile
            key={entry.points}
            label={`${entry.points} pts`}
            reward={entry.reward}
            claimed={entry.claimed}
            canClaim={weekly.points >= entry.points}
            busy={busy}
            onClaim={() => claim(`weekly/milestone/${entry.points}`)}
            size={72}
          />
        ))}
        <RewardTile
          label="Bonus"
          reward={weekly.bonus}
          claimed={allDays && !weekly.canClaimBonus}
          canClaim={weekly.canClaimBonus}
          busy={busy}
          onClaim={() => claim('weekly/bonus')}
          size={72}
        />
      </ul>
      <ul aria-label="Day rewards" className="flex justify-center gap-[6px]">
        {days.map((entry) => (
          <RewardTile
            key={entry.day}
            label={DAY_LABELS[entry.day]!}
            reward={entry.reward}
            claimed={entry.claimed}
            canClaim={weekly.weekday === entry.day && weekly.points >= DAY_REWARD_POINTS}
            busy={busy}
            onClaim={() => claim(`weekly/weekday/${entry.day}`)}
            size={72}
          />
        ))}
      </ul>
    </div>
  )
}
