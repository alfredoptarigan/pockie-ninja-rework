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

const elderQuest = {
  ...newbiePackQuest,
  taskId: 90000,
  state: 1 as const,
  progress: [1],
  nameKey: 'lg_Task_90000',
  descriptionKey: 'lg_TaskDes_90000',
  steps: [{ descriptionKey: 'lg_SubTaskDes_90000', target: 1 }],
  rewards,
}

function renderNavigation(onNpc = vi.fn()) {
  mockApi({
    'GET /api/game/quests': () => json({ quests: [elderQuest] }),
    'GET /api/game/quests/available': () =>
      json({
        available: [{ ...equipOffer, rewards: { ...rewards, items: [], exp: 10 } }],
        completed: [],
      }),
    'GET /api/game/scene': () => json(villageScene),
  })
  renderWithProviders(
    <QuestNavigation
      open
      onClose={vi.fn()}
      character={character}
      scene={villageScene}
      onNpc={onNpc}
      onOpenBag={vi.fn()}
    />,
  )
  return screen.getByRole('region', { name: 'Quest Navigation' })
}

describe('QuestNavigation', () => {
  it('shows "Name|State" and the NPC to talk to on each row', async () => {
    const nav = renderNavigation()
    const list = await within(nav).findByRole('list', { name: 'Accepted quests' })
    const [row] = await within(list).findAllByRole('listitem')
    expect(row).toHaveTextContent('Visit the Village Elder|Completed')
    expect(row).toHaveTextContent('Talk to Fire Village Elder in the Hall')
    expect(within(row!).getByText('Completed')).toHaveClass('text-[#1b6e17]')
  })

  it('opens the quest window from Details, with progress, reward fields and Turn In', async () => {
    const onNpc = vi.fn()
    const nav = renderNavigation(onNpc)
    await userEvent.click(
      await within(nav).findByRole('button', { name: 'Details: Visit the Village Elder' }),
    )
    const detail = screen.getByRole('dialog', { name: 'Visit the Village Elder' })
    expect(within(detail).getByRole('region', { name: 'Progress' })).toHaveTextContent('1/1')
    const fields = within(detail).getByRole('region', { name: 'Rewards' })
    expect(fields).toHaveTextContent('EXP5')
    expect(fields).toHaveTextContent('Gift10')
    expect(fields).toHaveTextContent('Stones100')
    expect(within(fields).getByRole('img', { name: 'Lv.1 Newbie Pack' })).toBeVisible()

    // The Elder is in this scene: Turn In talks to him (which hands the quest in).
    await userEvent.click(await within(detail).findByRole('button', { name: 'Turn In' }))
    expect(onNpc).toHaveBeenCalledWith(villageScene.npcs[0])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows available quests with their rewards and no Turn In', async () => {
    const nav = renderNavigation()
    await userEvent.click(within(nav).getByRole('tab', { name: 'Available' }))
    const list = within(nav).getByRole('list', { name: 'Available quests' })
    expect(await within(list).findByText('Available')).toBeVisible()
    await userEvent.click(within(list).getByRole('button', { name: 'Details: Weapon Equipment' }))

    const detail = screen.getByRole('dialog', { name: 'Weapon Equipment' })
    expect(within(detail).getByRole('region', { name: 'Rewards' })).toHaveTextContent('EXP10')
    expect(within(detail).queryByRole('region', { name: 'Progress' })).not.toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: 'Turn In' })).not.toBeInTheDocument()
  })
})
