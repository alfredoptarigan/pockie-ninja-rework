import type { QuestRewards } from '@pockie/shared'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuestRewardFields, QuestRewardList } from './Rewards'

const none: QuestRewards = { exp: 0, stone: 0, gold: 0, giftCoupon: 0, honor: 0, items: [] }

describe('QuestRewardList', () => {
  it('lists EXP, money and the reward items with icons, names and counts', () => {
    render(
      <QuestRewardList
        rewards={{
          ...none,
          exp: 263,
          stone: 62,
          giftCoupon: 10,
          items: [
            { itemId: 'i160007', count: 5, nameKey: 'lg_HP2_itemname' },
            { itemId: 'i159104', count: 1, nameKey: 'lg_Debris159104_itemname' },
          ],
        }}
      />,
    )
    const rewards = screen.getByRole('group', { name: 'Rewards' })
    expect(rewards).toHaveTextContent('EXP +263, Stone +62, Coupons +10')
    const items = within(rewards).getByRole('list', { name: 'Rewards: items' })
    const [capsules, pack] = within(items).getAllByRole('listitem')
    expect(within(capsules!).getByRole('img', { name: 'Healing Capsule' })).toHaveAttribute(
      'src',
      '/assets/game/items/icon_resume7.webp',
    )
    expect(capsules).toHaveTextContent('Healing Capsule x5')
    expect(pack).toHaveTextContent('Lv.1 Newbie Pack')
    expect(pack).not.toHaveTextContent('x1')
  })

  it('draws the quest window fields and item boxes with count badges', () => {
    render(
      <QuestRewardFields
        rewards={{
          ...none,
          exp: 3060,
          stone: 36000,
          items: [{ itemId: 'i160007', count: 25, nameKey: 'lg_HP2_itemname' }],
        }}
      />,
    )
    expect(screen.getByText('EXP').nextSibling).toHaveTextContent('3060')
    expect(screen.getByText('Gift').nextSibling).toBeEmptyDOMElement()
    expect(screen.getByText('Stones').nextSibling).toHaveTextContent('36000')
    expect(screen.queryByText('Gold')).not.toBeInTheDocument()
    const items = screen.getByRole('list', { name: 'Reward items' })
    expect(within(items).getByRole('img', { name: 'Healing Capsule' })).toBeVisible()
    expect(within(items).getByRole('listitem')).toHaveTextContent('x25')
  })

  it('shows nothing for a quest without rewards', () => {
    const { container } = render(<QuestRewardList rewards={none} />)
    expect(container).toBeEmptyDOMElement()
    render(<QuestRewardList rewards={undefined} />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
