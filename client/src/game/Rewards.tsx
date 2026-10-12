// Item lists with the original icons: quest rewards, items a hand-in granted, monster drops.
import type { QuestRewards } from '@pockie/shared'
import { ItemIcon, itemIcon } from './ItemIcon'
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

/** Fields of the quest window (UI_TaskInfo_Xml): EXP and Gift side by side, Stones full width. */
const FIELDS = [
  ['exp', 'EXP', false],
  ['giftCoupon', 'Gift', false],
  ['stone', 'Stones', true],
  ['gold', 'Gold', false],
  ['honor', 'Honor', false],
] as const

/**
 * A quest's rewards as the quest window shows them: labelled fields (EXP, Gift, Stones; Gold and
 * Honor only when paid), then the reward items as 24px icons with a count badge.
 */
export function QuestRewardFields({ rewards }: { rewards: QuestRewards | undefined }) {
  if (!rewards) return <p className="px-[10px]">None.</p>
  const fields = FIELDS.filter(([key], i) => i < 3 || rewards[key] > 0)
  return (
    <>
      <dl className="grid grid-cols-2 gap-[2px] px-[9px]">
        {fields.map(([key, label, wide]) => (
          <div
            key={key}
            className={`game-text-box flex h-[21px] items-center ${wide ? 'col-span-2' : ''}`}
          >
            <dt className="game-reward-label -ml-[3px] flex h-[22px] w-[45px] shrink-0 items-center justify-center font-game text-[12px]">
              {label}
            </dt>
            <dd className="ml-[6px]">{rewards[key] > 0 ? rewards[key] : ''}</dd>
          </div>
        ))}
      </dl>
      {rewards.items.length > 0 && (
        <ul aria-label="Reward items" className="mt-[8px] flex flex-wrap gap-[4px] px-[10px]">
          {rewards.items.map(({ itemId, nameKey, count }, i) => (
            <RewardItem key={`${itemId}-${i}`} itemId={itemId} nameKey={nameKey} count={count} />
          ))}
        </ul>
      )}
    </>
  )
}

/** One reward item: the 24px icon in a light box, the count in a badge at the bottom right. */
function RewardItem({
  itemId,
  nameKey,
  count,
}: {
  itemId: string
  nameKey: string
  count: number
}) {
  const name = plainText(nameKey, 'Unknown item')
  const icon = itemIcon(itemId)
  return (
    <li
      title={name}
      className="relative grid size-[38px] place-items-center rounded-[4px] border border-black/20 bg-black/10"
    >
      {icon ? (
        <img src={icon.file} alt={name} className="size-6 object-contain" />
      ) : (
        <span role="img" aria-label={name} className="font-bold">
          ?
        </span>
      )}
      {count > 1 && (
        <span className="absolute right-[1px] bottom-[1px] h-[11px] min-w-4 bg-black/75 px-px text-center font-game text-[9px] leading-[11px] font-bold text-white">
          <span className="sr-only"> x</span>
          {count}
        </span>
      )}
    </li>
  )
}
