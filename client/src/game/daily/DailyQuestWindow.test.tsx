import type { DailyView } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { DailyQuestWindow, TaskBoard, useOpenDaily } from './index'

const quest = (taskId: number, state: number): DailyView['quests'][number] => ({
  taskId,
  nameKey: 'missing',
  grade: 3,
  state,
  progress: [state >= 2 ? 12 : 4],
  steps: [{ descriptionKey: 'missing', target: 12 }],
  rewards: { exp: 1800, stone: 0, gold: 0, giftCoupon: 0, honor: 0, items: [] },
})
const view = (quests: DailyView['quests']): DailyView => ({
  day: '2026-10-12',
  resetAt: new Date(Date.now() + 60000).toISOString(),
  refreshAt: new Date(Date.now() + 1800000).toISOString(),
  accepted: 1,
  completed: 0,
  limit: 20,
  inProgressLimit: 5,
  quests,
})

describe('Task Board', () => {
  it('lists available and in-progress tasks and accepts one from its details', async () => {
    let board = view([quest(2160102, 0), quest(2160103, 1)])
    const accept = vi.fn(() => {
      board = view([quest(2160102, 1), quest(2160103, 1)])
      return json(board)
    })
    mockApi({
      'GET /api/game/daily': () => json(board),
      'POST /api/game/daily/2160102/accept': accept,
    })
    renderWithProviders(<TaskBoard />)
    const available = await screen.findByRole('list', { name: 'Available Tasks' })
    expect(screen.getByText('In Progress (1/5)')).toBeInTheDocument()
    expect(screen.getByText('Select a task to view details')).toBeInTheDocument()
    expect(screen.getByText('Offers refresh in')).toBeInTheDocument()
    expect(screen.getByText('Completed today: 0/20')).toBeInTheDocument()

    await userEvent.click(within(available).getByRole('button', { name: /Quest 2160102/ }))
    const details = screen.getByRole('region', { name: 'Quest 2160102' })
    expect(within(details).getByText('Grade C')).toBeInTheDocument()
    expect(within(details).getByText('Steps')).toBeInTheDocument()
    expect(within(details).getByText('4/12')).toBeInTheDocument()
    await userEvent.click(within(details).getByRole('button', { name: 'Accept Task' }))
    expect(accept).toHaveBeenCalledOnce()
    expect(await screen.findByText('No tasks available')).toBeInTheDocument()
    expect(screen.getByText('In Progress (2/5)')).toBeInTheDocument()
  })

  it('shows progress of a task in progress without a Turn In button', async () => {
    mockApi({ 'GET /api/game/daily': () => json(view([quest(2160103, 1)])) })
    renderWithProviders(<TaskBoard />)
    const progress = await screen.findByRole('list', { name: 'In Progress' })
    expect(screen.getByText('No tasks available')).toBeInTheDocument()
    await userEvent.click(within(progress).getByRole('button', { name: /Quest 2160103/ }))
    expect(screen.getByText('Current Progress')).toBeInTheDocument()
    expect(screen.getByText('All Steps')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn In' })).not.toBeInTheDocument()
  })

  it('turns in a completed task with the chosen EXP reward', async () => {
    let board = view([quest(2160102, 2)])
    const fetch = mockApi({
      'GET /api/game/daily': () => json(board),
      'POST /api/game/daily/2160102/hand-in': () => {
        board = view([])
        return json(board)
      },
    })
    renderWithProviders(<TaskBoard />)
    const progress = await screen.findByRole('list', { name: 'In Progress' })
    await userEvent.click(within(progress).getByRole('button', { name: /Quest 2160102/ }))
    expect(screen.getByText('Task Completed! Click Turn In to claim rewards.')).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'EXP reward for 2160102' }),
      '1',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Turn In' }))
    expect(requestBody(fetch, 'POST /api/game/daily/2160102/hand-in')).toEqual({ selectType: 1 })
    expect(await screen.findByText('No tasks in progress')).toBeInTheDocument()
    expect(screen.getByText('Select a task to view details')).toBeInTheDocument()
  })

  it('displays a server refusal', async () => {
    mockApi({
      'GET /api/game/daily': () =>
        json(
          {
            error: {
              code: 'outside_neutral',
              message: 'Daily quests are only available in neutral fields.',
            },
          },
          400,
        ),
    })
    renderWithProviders(<TaskBoard />)
    expect(
      await screen.findByText('Daily quests are only available in neutral fields.'),
    ).toBeVisible()
  })

  it('opens as the Task Board window and closes through the exported hook', async () => {
    mockApi({ 'GET /api/game/daily': () => json(view([])) })
    function Harness() {
      const daily = useOpenDaily()
      return (
        <>
          <button onClick={daily.open}>Open daily quests</button>
          {daily.isOpen && <DailyQuestWindow onClose={daily.close} />}
        </>
      )
    }
    renderWithProviders(<Harness />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open daily quests' }))
    expect(screen.getByRole('dialog', { name: 'Task Board' })).toBeInTheDocument()
    expect(await screen.findByText('No tasks in progress')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
