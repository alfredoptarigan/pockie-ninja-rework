import { useEffect, useId, useState } from 'react'
import type { EventsView } from '../../../../shared/src/schemas/events'
import { errorMessage } from '../api'
import { QuestRewardList } from '../Rewards'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { useEventAction, useEvents } from './api'
import { rewardCountdown } from './timer'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DICE_BUFFS: Record<number, string> = {
  80101: 'Blessing',
  80102: 'Great Blessing',
  80201: 'Curse',
  80202: 'Great Curse',
}

function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

export function NinjaDiaryWindow({ onClose }: { onClose: () => void }) {
  const events = useEvents()
  const action = useEventAction()
  const [tab, setTab] = useState<'login' | 'weekly'>('login')
  const panelId = useId()
  const error = events.error ?? action.error
  return (
    <Dialog title="Ninja Diary" onClose={onClose} className="game-window-bare w-[620px]">
      <Tabs
        label="Ninja Diary"
        tabs={[
          { id: 'login', title: 'Daily Login' },
          { id: 'weekly', title: 'Weekly Rewards' },
        ]}
        active={tab}
        onChange={setTab}
        panelId={panelId}
      />
      <div id={panelId} role="tabpanel" className="mt-2 flex flex-col gap-2 text-xs text-black">
        {events.isPending && <p>Loading rewards...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {events.data &&
          (tab === 'login' ? (
            <>
              <p>
                Claim one reward a day. The 7-day cycle moves forward each time you claim. Resets
                daily at 00:00 UTC.
              </p>
              <ul aria-label="Login rewards" className="grid grid-cols-2 gap-2">
                {events.data.login.rewards.map((entry) => (
                  <li key={entry.day} className="game-card p-2">
                    <h3 className="font-bold">Day {entry.day}</h3>
                    <QuestRewardList rewards={entry.reward} />
                    <GameButton
                      small
                      disabled={
                        action.isPending ||
                        entry.claimed ||
                        !events.data!.login.canClaim ||
                        entry.day !== events.data!.login.nextDay
                      }
                      onClick={() => action.mutate('login/claim')}
                    >
                      {entry.claimed ? 'Claimed' : 'Claim'}
                    </GameButton>
                  </li>
                ))}
              </ul>
              <div className="game-card p-2">
                <QuestRewardList title="Login bonus" rewards={events.data.login.bonus} />
                <GameButton
                  disabled={action.isPending || !events.data.login.canClaimBonus}
                  onClick={() => action.mutate('login/bonus')}
                >
                  Claim login bonus
                </GameButton>
              </div>
            </>
          ) : (
            <WeeklyRewards
              view={events.data}
              busy={action.isPending}
              claim={(path) => action.mutate(path)}
            />
          ))}
      </div>
    </Dialog>
  )
}

function WeeklyRewards({
  view,
  busy,
  claim,
}: {
  view: EventsView
  busy: boolean
  claim: (path: string) => void
}) {
  const { weekly } = view
  return (
    <>
      <p>Activity points: {weekly.points}. Resets every Monday at 00:00 UTC.</p>
      <ul aria-label="Weekly activities" className="game-card grid grid-cols-2 gap-1 p-2">
        {weekly.activities.map((activity) => (
          <li key={activity.id}>
            {activity.label}: {activity.count}/{activity.max} ({activity.points} points)
          </li>
        ))}
      </ul>
      <ul aria-label="Point milestones" className="grid grid-cols-3 gap-2">
        {weekly.milestones.map((entry) => (
          <li key={entry.points} className="game-card p-2">
            <h3 className="font-bold">{entry.points} points</h3>
            <QuestRewardList rewards={entry.reward} />
            <GameButton
              small
              disabled={busy || entry.claimed || weekly.points < entry.points}
              onClick={() => claim(`weekly/milestone/${entry.points}`)}
            >
              {entry.claimed ? 'Claimed' : `Claim ${entry.points}-point reward`}
            </GameButton>
          </li>
        ))}
      </ul>
      <p>
        Earn 50 points to claim the reward for today's weekday. Each reward is available only on its
        own weekday.
      </p>
      <ul aria-label="Weekday rewards" className="grid grid-cols-2 gap-2">
        {weekly.weekdays.map((entry) => (
          <li key={entry.day} className="game-card p-2">
            <h3 className="font-bold">{WEEKDAYS[entry.day - 1]}</h3>
            <QuestRewardList rewards={entry.reward} />
            <GameButton
              small
              disabled={busy || entry.claimed || weekly.points < 50 || weekly.weekday !== entry.day}
              onClick={() => claim(`weekly/weekday/${entry.day}`)}
            >
              {entry.claimed ? 'Claimed' : `Claim ${WEEKDAYS[entry.day - 1]} reward`}
            </GameButton>
          </li>
        ))}
      </ul>
      <div className="game-card p-2">
        <QuestRewardList title="Weekly bonus" rewards={weekly.bonus} />
        <GameButton disabled={busy || !weekly.canClaimBonus} onClick={() => claim('weekly/bonus')}>
          Claim weekly bonus
        </GameButton>
      </div>
    </>
  )
}

export function DiceOfFateWindow({ onClose }: { onClose: () => void }) {
  const events = useEvents()
  const action = useEventAction()
  const error = events.error ?? action.error
  const dice = events.data?.dice
  return (
    <Dialog title="Dice of Fate" onClose={onClose} className="game-window-bare w-[440px]">
      <div className="flex flex-col gap-2 text-xs text-black">
        {events.isPending && <p>Loading dice...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {dice && (
          <>
            <p>Rolls left today: {dice.rollsLeft}. Resets daily at 00:00 UTC.</p>
            <p>Six fair dice decide your fate. Lucky and unlucky dice cancel each other out.</p>
            {dice.lastRoll && (
              <div className="game-card p-2" role="status">
                <p>
                  Dice: {dice.lastRoll.dice.join(', ')}. Net lucky dice: {dice.lastRoll.net}.
                </p>
                <p>{dice.lastRoll.buffId ? DICE_BUFFS[dice.lastRoll.buffId] : 'Neutral fate'}</p>
              </div>
            )}
            <ul aria-label="Fate effects">
              {dice.buffs.map((buff) => (
                <li key={buff.buffId}>
                  {DICE_BUFFS[buff.buffId] ?? 'Fate effect'}
                  {buff.expiresAt
                    ? ` until ${new Date(buff.expiresAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`
                    : ''}
                </li>
              ))}
            </ul>
            <GameButton
              disabled={action.isPending || dice.rollsLeft === 0}
              onClick={() => action.mutate('dice/roll')}
            >
              Roll dice
            </GameButton>
            <GameButton
              disabled={
                action.isPending ||
                dice.rollsLeft !== 0 ||
                dice.bought >= dice.buyLimit ||
                events.data!.character.stone < dice.replenishCost
              }
              onClick={() => action.mutate('dice/replenish')}
            >
              Replenish rolls ({dice.replenishCost.toLocaleString('en-US')} Stone)
            </GameButton>
            <p>
              Replenishments today: {dice.bought}/{dice.buyLimit}. Available after all rolls are
              used.
            </p>
            <GameButton
              disabled={
                action.isPending || !dice.curse || events.data!.character.stone < dice.clearCost
              }
              onClick={() => action.mutate('dice/clear')}
            >
              Clear curse ({dice.clearCost.toLocaleString('en-US')} Stone)
            </GameButton>
          </>
        )}
      </div>
    </Dialog>
  )
}

const CLAIM_TEXT =
  'font-bold leading-[12px] text-[#ffe27a] [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]'

/**
 * Reborn's 71x71 CLAIM widget for the 20-minute Gift Coupon reward: the reward art and CLAIM when
 * ready, the 20-minute art and a countdown while cooling down, faded with Daily Limit and the time
 * to the daily reset once capped. The HUD positions it next to the player card.
 */
export function TwentyMinuteRewardButton({ className = '' }: { className?: string }) {
  const events = useEvents()
  const action = useEventAction()
  const now = useNow()
  const reward = events.data?.twentyMinute
  const capped = reward ? reward.claimsToday >= reward.dailyCap : false
  const ready = reward ? Date.parse(reward.nextClaimAt) <= now : false
  const error = events.error ?? action.error
  const countdown = reward ? rewardCountdown(reward.nextClaimAt, now) : ''
  const [label, text] = !reward
    ? ['Loading reward...', 'Loading...']
    : capped
      ? ['Daily limit reached', `Daily Limit\n${rewardCountdown(events.data!.resetAt, now)}`]
      : ready
        ? [`Claim ${reward.coupons} Gift Coupons`, 'CLAIM']
        : [`Reward in ${countdown}`, countdown]
  return (
    <div className={`pointer-events-auto flex w-[71px] flex-col items-center gap-1 ${className}`}>
      <button
        type="button"
        aria-label={label}
        disabled={!reward || !ready || capped || action.isPending}
        title={reward ? `${label}. ${reward.claimsToday}/${reward.dailyCap} claims today.` : label}
        onClick={() => action.mutate('twenty-minute/claim')}
        className="relative size-[71px] cursor-pointer font-game text-xs whitespace-pre-line hover:brightness-110 disabled:cursor-default disabled:hover:brightness-100"
      >
        <img
          src={`/assets/reborn/dailylogin/${ready && !capped ? 'reward' : '20min'}.webp`}
          alt=""
          className={`absolute inset-0 m-auto ${reward ? 'size-full' : 'size-[51px] opacity-50'} ${capped ? 'opacity-70' : ''}`}
        />
        <span className={`absolute inset-x-0 bottom-[2px] ${CLAIM_TEXT}`}>{text}</span>
      </button>
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
    </div>
  )
}
