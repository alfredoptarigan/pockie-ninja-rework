// Item lists with the original icons: quest rewards, items a hand-in granted, monster drops.
import type { QuestRewards } from '@pockie/shared'
import { ItemIcon } from './ItemIcon'
import { GameText, plainText } from './text'

/** EXP, money and honor in the order of the original quest window. */
const AMOUNTS = [
  ['exp', 'EXP'],
  ['stone', 'Stone'],
  ['gold', 'Gold'],
  ['giftCoupon', 'Coupons'],
  ['honor', 'Honor'],
] as const

/** Items as icons with their names; `count` (above 1) shows on the icon and after the name. */
export function ItemList({
  items,
  label,
}: {
  items: { itemId: string; nameKey: string; count?: number }[]
  label: string
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-1">
      {items.map(({ itemId, nameKey, count = 1 }, i) => (
        <li key={`${itemId}-${i}`} className="flex items-center gap-2">
          <ItemIcon itemId={itemId} name={plainText(nameKey, 'Unknown item')} className="size-8">
            {count > 1 && (
              <span
                aria-hidden="true"
                className="absolute right-0.5 bottom-0 text-[10px] font-bold"
              >
                {count}
              </span>
            )}
          </ItemIcon>
          <span>
            <GameText k={nameKey} fallback="Unknown item" />
            {count > 1 && ` x${count}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** A quest's rewards like the original quest window: EXP, money and honor, then the items. */
export function QuestRewardList({
  rewards,
  title = 'Rewards',
}: {
  rewards: QuestRewards | undefined
  title?: string
}) {
  const amounts = rewards ? AMOUNTS.filter(([key]) => rewards[key] > 0) : []
  if (!rewards || (amounts.length === 0 && rewards.items.length === 0)) return null
  return (
    <div role="group" aria-label={title} className="mt-1 flex flex-col gap-1 text-xs">
      <p className="font-bold">{title}</p>
      {amounts.length > 0 && (
        <p>{amounts.map(([key, label]) => `${label} +${rewards[key]}`).join(', ')}</p>
      )}
      {rewards.items.length > 0 && <ItemList items={rewards.items} label={`${title}: items`} />}
    </div>
  )
}
