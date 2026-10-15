import { errorMessage } from '../api'
import { Notice } from '../skin'
import { useEventAction, useEvents } from './api'
import { rewardCountdown, useNow } from './timer'

export { DiceOfFateWindow } from './DiceOfFateWindow'
export { NinjaDiaryWindow } from './NinjaDiaryWindow'

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
