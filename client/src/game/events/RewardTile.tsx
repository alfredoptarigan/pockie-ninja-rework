// A Ninja Diary reward tile (Reborn's day column / points tile): label, the reward box with item
// icons and amounts, and a Claim / Claimed button.
import type { QuestRewards } from '@pockie/shared'
import { ItemIcon } from '../ItemIcon'
import { GameButton } from '../skin'
import { plainText } from '../text'

const AMOUNTS = [
  ['gold', 'Gold'],
  ['giftCoupon', 'Coupons'],
  ['stone', 'Stone'],
  ['exp', 'EXP'],
  ['honor', 'Honor'],
] as const

function RewardBox({ reward, className }: { reward: QuestRewards; className: string }) {
  const amounts = AMOUNTS.filter(([key]) => reward[key] > 0)
  return (
    <div
      className={`game-text-box flex flex-col items-center justify-center gap-[2px] p-[3px] text-center ${className}`}
    >
      {reward.items.length === 0 && amounts.length === 0 && <span>No reward</span>}
      {reward.items.length > 0 && (
        <div className="flex flex-wrap justify-center gap-[2px]">
          {reward.items.map(({ itemId, nameKey, count }, index) => {
            const name = plainText(nameKey, 'Unknown item')
            return (
              <span key={`${itemId}-${index}`} title={count > 1 ? `${name} x${count}` : name}>
                <ItemIcon itemId={itemId} name={name} className="size-9">
                  {count > 1 && (
                    <span className="absolute right-px bottom-0 bg-black/75 px-px text-[9px] leading-[11px] font-bold text-white">
                      <span className="sr-only"> x</span>
                      {count}
                    </span>
                  )}
                </ItemIcon>
              </span>
            )
          })}
        </div>
      )}
      {amounts.map(([key, label]) => (
        <span
          key={key}
          className="leading-tight"
        >{`${reward[key].toLocaleString('en-US')} ${label}`}</span>
      ))}
    </div>
  )
}

export function RewardTile({
  label,
  reward,
  claimed,
  canClaim,
  busy,
  onClaim,
  size,
}: {
  label: string
  reward: QuestRewards
  claimed: boolean
  canClaim: boolean
  busy: boolean
  onClaim: () => void
  /** 76 for login days (76x92 box), 72 for weekly tiles (72x72 box). */
  size: 76 | 72
}) {
  return (
    <li aria-label={label} className="flex w-[82px] flex-col items-center gap-[3px]">
      <span className="font-bold">{label}</span>
      <RewardBox reward={reward} className={size === 76 ? 'h-[92px] w-[76px]' : 'size-[72px]'} />
      <GameButton
        className={`h-[24px] !min-w-0 !px-0 ${size === 76 ? 'w-[76px]' : 'w-[72px]'} ${claimed ? 'hue-rotate-[70deg]' : ''}`}
        disabled={claimed || !canClaim || busy}
        onClick={onClaim}
      >
        {claimed ? 'Claimed' : 'Claim'}
      </GameButton>
    </li>
  )
}
