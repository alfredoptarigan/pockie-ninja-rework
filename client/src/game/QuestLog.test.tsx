import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newbiePackQuest, villageScene } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { completedNotice, QuestLog } from './QuestLog'

const equipQuest = {
  ...newbiePackQuest,
  taskId: 90002,
  state: 1 as const,
  progress: [1],
  nameKey: 'lg_Task_90002',
  descriptionKey: 'lg_TaskDes_90002',
  steps: [{ descriptionKey: 'lg_SubTaskDes_90003', target: 1 }],
}

function renderLog(quests: object[], onNpc = vi.fn()) {
  mockApi({
    'GET /api/game/quests': () => json({ quests }),
    'GET /api/game/scene': () => json(villageScene),
  })
  renderWithProviders(<QuestLog onNpc={onNpc} />)
}

describe('QuestLog', () => {
  it('lists quests as "Name|State" rows', async () => {
    renderLog([newbiePackQuest, equipQuest])
    const log = await screen.findByRole('list', { name: 'Quest log' })
    const [pack, equip] = within(log).getAllByRole('listitem')
    expect(pack).toHaveTextContent('Newbie Pack|In progress')
    expect(equip).toHaveTextContent('Weapon Equipment|Completed')
  })

  it('opens the quest window with its colored text and step progress', async () => {
    renderLog([newbiePackQuest])
    await userEvent.click(await screen.findByRole('button', { name: 'Details: Newbie Pack' }))

    const detail = screen.getByRole('dialog', { name: 'Newbie Pack' })
    expect(within(detail).getByRole('heading', { level: 3, name: 'Newbie Pack' })).toBeVisible()
    // Markup becomes styled spans, not raw tags.
    expect(detail).not.toHaveTextContent('<font')
    expect(within(detail).getAllByText('Lv.1 Newbie Pack')[0]).toHaveStyle({ color: '#1b6e17' })
    expect(within(detail).getByRole('region', { name: 'Progress' })).toHaveTextContent('0/1')
    // Not finished yet: nothing to turn in.
    expect(within(detail).queryByRole('button', { name: 'Turn In' })).not.toBeInTheDocument()

    const close = within(detail).getAllByRole('button', { name: 'Close' })
    await userEvent.click(close[close.length - 1]!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says so when there are no quests', async () => {
    renderLog([])
    expect(await screen.findByText('No quests right now. Talk to the villagers.')).toBeVisible()
  })

  it('names completed quests', () => {
    expect(completedNotice([90001])).toBe(' Quest complete: Newbie Pack.')
    expect(completedNotice([])).toBe('')
  })
})
