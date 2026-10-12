import type { QuestRewards } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character, equipOffer, newbiePackQuest, villageScene } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { QuestNavigation } from './QuestNavigation'

const rewards: QuestRewards = {
  exp: 5,
  stone: 100,
  gold: 0,
  giftCoupon: 10,
  honor: 0,
  items: [{ itemId: 'i159104', count: 1, nameKey: 'lg_Debris159104_itemname' }],
}

describe('QuestNavigation rewards', () => {
  it('shows the rewards of held and available quests in their details', async () => {
    mockApi({
      'GET /api/game/quests': () => json({ quests: [{ ...newbiePackQuest, rewards }] }),
      'GET /api/game/quests/available': () =>
        json({
          available: [{ ...equipOffer, rewards: { ...rewards, items: [], exp: 10 } }],
          completed: [],
        }),
    })
    renderWithProviders(
      <QuestNavigation
        character={character}
        scene={villageScene}
        onNpc={vi.fn()}
        onOpenBag={vi.fn()}
      />,
    )
    const nav = screen.getByRole('region', { name: 'Quest Navigation' })

    await userEvent.click(await within(nav).findByRole('button', { name: /^Details:/ }))
    const held = within(nav).getByRole('group', { name: 'Rewards' })
    expect(held).toHaveTextContent('EXP +5, Stone +100, Coupons +10')
    expect(within(held).getByRole('img', { name: 'Lv.1 Newbie Pack' })).toBeVisible()

    await userEvent.click(within(nav).getByRole('tab', { name: 'Available' }))
    await userEvent.click(within(nav).getByRole('button', { name: /^Details:/ }))
    expect(within(nav).getByRole('group', { name: 'Rewards' })).toHaveTextContent(
      'EXP +10, Stone +100, Coupons +10',
    )
  })
})
