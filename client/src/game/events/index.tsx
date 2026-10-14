import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { useEventAction, useEvents } from './api'
import { rewardCountdown, useNow } from './timer'

export { NinjaDiaryWindow } from './NinjaDiaryWindow'

const DICE_BUFFS: Record<number, string> = {
  80101: 'Blessing',
  80102: 'Great Blessing',
  80201: 'Curse',
  80202: 'Great Curse',
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
