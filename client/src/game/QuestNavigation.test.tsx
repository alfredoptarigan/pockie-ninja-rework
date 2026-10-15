import type { QuestRewards } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character, equipOffer, newbiePackQuest, villageScene } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { QuestNavigation } from './QuestNavigation'
import { OpenWindowProvider } from './windows'

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

const dailyQuest = (state: number, progress = 0) => ({
  taskId: 999,
  nameKey: 'lg_Task_999',
  state,
  progress: [progress],
  steps: [
    {
      descriptionKey: 'lg_SubTaskDes_999',
      target: 3,
      kind: 'kill' as const,
      targetId: 'm1',
      targetNameKey: 'lg_name_n11001',
      sceneId: 111,
    },
  ],
  rewards,
})
const daily = (quests: object[]) => ({
  day: '2026-10-15',
  resetAt: new Date(Date.now() + 3600_000).toISOString(),
  refreshAt: new Date(Date.now() + 3600_000).toISOString(),
  accepted: quests.length,
  completed: 0,
  limit: 10,
  inProgressLimit: 10,
  quests,
})

function renderNavigation({
  onNpc = vi.fn(),
  quests = [elderQuest] as object[],
  available = [{ ...equipOffer, rewards: { ...rewards, items: [], exp: 10 } }] as object[],
  dailyQuests = [] as object[],
} = {}) {
  const openWindow = vi.fn()
  mockApi({
    'GET /api/game/quests': () => json({ quests }),
    'GET /api/game/quests/available': () => json({ available, completed: [] }),
    'GET /api/game/scene': () => json(villageScene),
    'GET /api/game/daily': () => json(daily(dailyQuests)),
  })
  renderWithProviders(
    <OpenWindowProvider value={openWindow}>
      <QuestNavigation
        open
        onClose={vi.fn()}
        character={character}
        scene={villageScene}
        onNpc={onNpc}
        onOpenBag={vi.fn()}
      />
    </OpenWindowProvider>,
  )
  return { nav: screen.getByRole('region', { name: 'Quest Navigation' }), openWindow }
}

describe('QuestNavigation', () => {
  it("is Reborn's 340x160 panel with 55px rows", async () => {
    const { nav } = renderNavigation()
    expect(nav).toHaveClass('h-[160px]', 'w-[340px]', 'bottom-[80px]', 'right-[4px]')
    const list = await within(nav).findByRole('list', { name: 'Accepted quests' })
    expect((await within(list).findAllByRole('listitem'))[0]).toHaveClass('h-[55px]')
    expect(
      within(nav)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Accepted', 'Available', 'Daily'])
  })

  it('shows "[Main]Name|State" and the NPC to talk to on each row', async () => {
    const { nav } = renderNavigation({ quests: [elderQuest, newbiePackQuest] })
    const list = await within(nav).findByRole('list', { name: 'Accepted quests' })
    const [row, held] = await within(list).findAllByRole('listitem')
    expect(row).toHaveTextContent('[Main]Visit the Village Elder|Completed')
    expect(held).toHaveTextContent('|Accepted')
    expect(row).toHaveTextContent('Talk to Fire Village Elder in the Hall')
    expect(within(row!).getByText('Completed')).toHaveClass('text-[#1b6e17]')
  })

  it('opens the quest window from Details, with progress, reward fields and Turn In', async () => {
    const onNpc = vi.fn()
    const { nav } = renderNavigation({ onNpc })
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

  it('opens on Available when nothing is accepted', async () => {
    const { nav } = renderNavigation({ quests: [] })
    expect(await within(nav).findByRole('tab', { name: 'Available', selected: true })).toBeVisible()
  })

  it('opens on Daily when only daily quests are held', async () => {
    const { nav } = renderNavigation({ quests: [], available: [], dailyQuests: [dailyQuest(1)] })
    expect(await within(nav).findByRole('tab', { name: 'Daily', selected: true })).toBeVisible()
  })

  it('lists held daily quests, Turn in at Task Board, and opens the Task Board', async () => {
    const { nav, openWindow } = renderNavigation({
      dailyQuests: [dailyQuest(1, 1), dailyQuest(2, 3), dailyQuest(0)],
    })
    await userEvent.click(within(nav).getByRole('tab', { name: 'Daily' }))
    const list = within(nav).getByRole('list', { name: 'Daily quests' })
    const rows = await within(list).findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('[Daily]Quest 999|Accepted')
    expect(rows[0]).toHaveTextContent(/Defeat .* 1\/3/)
    expect(rows[1]).toHaveTextContent('[Daily]Quest 999|Completed')
    expect(rows[1]).toHaveTextContent('Turn in at Task Board')
    await userEvent.click(within(rows[1]!).getByRole('button', { name: 'Go: Quest 999' }))
    expect(openWindow).toHaveBeenCalledWith('daily')
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Details: Quest 999' }))
    expect(openWindow).toHaveBeenCalledTimes(2)
  })

  it('tells where to find daily quests when none are held', async () => {
    const { nav } = renderNavigation()
    await userEvent.click(within(nav).getByRole('tab', { name: 'Daily' }))
    expect(
      await within(nav).findByText('Accept quests on the Taskboard in Ninja Diary'),
    ).toBeVisible()
  })

  it('shows available quests with their rewards and no Turn In', async () => {
    const { nav } = renderNavigation()
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
