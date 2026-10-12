import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { DailyQuestWindow, useOpenDaily } from './index'
const quest = {
  taskId: 2160102,
  nameKey: 'missing',
  state: 0,
  progress: [0],
  steps: [{ descriptionKey: 'missing', target: 12 }],
  rewards: { exp: 1800, stone: 0, gold: 0, giftCoupon: 0, honor: 0, items: [] },
}
const view = {
  day: '2026-10-12',
  resetAt: new Date(Date.now() + 60000).toISOString(),
  refreshAt: new Date(Date.now() + 1800000).toISOString(),
  accepted: 0,
  completed: 0,
  limit: 20,
  quests: [quest],
}
describe('DailyQuestWindow', () => {
  it('lists offers, countdown and accepts a quest', async () => {
    const accept = vi.fn(() => json({ ...view, quests: [{ ...quest, state: 1 }] }))
    mockApi({
      'GET /api/game/daily': () => json(view),
      'POST /api/game/daily/2160102/accept': accept,
    })
    const close = vi.fn()
    renderWithProviders(<DailyQuestWindow onClose={close} />)
    expect(await screen.findByText('Quest 2160102')).toBeVisible()
    expect(screen.getByText(/Reset in/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(accept).toHaveBeenCalledOnce()
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!)
    expect(close).toHaveBeenCalledOnce()
  })
  it('shows progress and hands in a ready quest', async () => {
    const handIn = vi.fn(() => json({ ...view, quests: [] }))
    mockApi({
      'GET /api/game/daily': () =>
        json({ ...view, quests: [{ ...quest, state: 2, progress: [12] }] }),
      'POST /api/game/daily/2160102/hand-in': handIn,
    })
    renderWithProviders(<DailyQuestWindow onClose={vi.fn()} />)
    expect(await screen.findByText('12/12')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Turn In' }))
    expect(handIn).toHaveBeenCalledOnce()
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
    renderWithProviders(<DailyQuestWindow onClose={vi.fn()} />)
    expect(
      await screen.findByText('Daily quests are only available in neutral fields.'),
    ).toBeVisible()
  })
  it('sends the selected reward price and opens and closes through the exported hook', async () => {
    const fetch = mockApi({
      'GET /api/game/daily': () =>
        json({ ...view, quests: [{ ...quest, grade: 3, state: 2, progress: [12] }] }),
      'POST /api/game/daily/2160102/hand-in': () => json({ ...view, quests: [] }),
    })
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
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'EXP reward for 2160102' }),
      '1',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Turn In' }))
    expect(requestBody(fetch, 'POST /api/game/daily/2160102/hand-in')).toEqual({ selectType: 1 })
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
