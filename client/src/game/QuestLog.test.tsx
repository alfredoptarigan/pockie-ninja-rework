import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newbiePackQuest } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { completedNotice, QuestLog, QuestTracker } from './QuestLog'

const equipQuest = {
  ...newbiePackQuest,
  taskId: 90002,
  state: 1 as const,
  progress: [1],
  nameKey: 'lg_Task_90002',
  descriptionKey: 'lg_TaskDes_90002',
  steps: [{ descriptionKey: 'lg_SubTaskDes_90003', target: 1 }],
}

describe('QuestLog', () => {
  it('lists quests with their colored text and step progress', async () => {
    mockApi({ 'GET /api/game/quests': () => json({ quests: [newbiePackQuest, equipQuest] }) })
    renderWithProviders(<QuestLog />)

    const log = await screen.findByRole('list', { name: 'Quest log' })
    const [pack, equip] = within(log)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement === log)
    expect(within(pack!).getByRole('heading')).toHaveTextContent('Newbie Pack')
    expect(pack).toHaveTextContent('In progress')
    expect(pack).toHaveTextContent('0/1')
    // Markup becomes styled spans, not raw tags.
    expect(pack).not.toHaveTextContent('<font')
    expect(within(pack!).getAllByText('Lv.1 Newbie Pack')[0]).toHaveStyle({ color: '#1b6e17' })
    expect(equip).toHaveTextContent('Ready to hand in')
    expect(equip).toHaveTextContent('1/1')
  })

  it('says so when there are no quests', async () => {
    mockApi({ 'GET /api/game/quests': () => json({ quests: [] }) })
    renderWithProviders(<QuestLog />)
    expect(await screen.findByText('No quests right now. Talk to the villagers.')).toBeVisible()
  })

  it('tracks current quests in a compact list', async () => {
    mockApi({ 'GET /api/game/quests': () => json({ quests: [equipQuest] }) })
    renderWithProviders(<QuestTracker />)

    const tracker = await screen.findByRole('region', { name: 'Quest tracker' })
    expect(tracker).toHaveTextContent('(ready)')
    expect(tracker).toHaveTextContent('1/1')
  })

  it('names completed quests', () => {
    expect(completedNotice([90001])).toBe(' Quest complete: Newbie Pack.')
    expect(completedNotice([])).toBe('')
  })
})
