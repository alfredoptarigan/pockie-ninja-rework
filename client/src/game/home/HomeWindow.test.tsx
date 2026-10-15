import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { HomeView } from '../../../../shared/src/schemas/home'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ToastHost } from '../toast'
import { HomeWindow } from './HomeWindow'

const seeds = [
  { crop: 'i170001', cost: 500, minutes: 60, yield: 5 },
  { crop: 'i170002', cost: 2_000, minutes: 120, yield: 3 },
]
const NOW = Date.UTC(2026, 9, 15, 12)
const home = (plots: HomeView['plots'] = Array(6).fill(null)): HomeView => ({
  serverNow: NOW,
  plots,
  seeds,
})

describe('HomeWindow', () => {
  it('buys a seed for an empty field', async () => {
    let view = home()
    const fetch = mockApi({
      'GET /api/game/home': () => json(view),
      'POST /api/game/home/plant': () => {
        view = home([{ crop: 'i170001', readyAt: NOW + 3_600_000 }, null, null, null, null, null])
        return json({ home: view, character })
      },
    })
    renderWithProviders(<HomeWindow character={character} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Field 1: empty' }))
    const list = screen.getByRole('dialog', { name: 'Seeds' })
    const grass = within(list).getByRole('listitem', { name: 'Grass' })
    expect(grass).toHaveTextContent('Cost: 500 Stones')
    expect(grass).toHaveTextContent('01:00:00')
    await userEvent.click(within(grass).getByRole('button', { name: 'Buy' }))
    expect(requestBody(fetch, 'POST /api/game/home/plant')).toEqual({ plot: 0, crop: 'i170001' })
    expect(await screen.findByRole('button', { name: /^Field 1: Grass, 0[01]:/ })).toBeVisible()
  })

  it('counts down on the server clock and harvests a ripe field', async () => {
    const fetch = mockApi({
      'GET /api/game/home': () =>
        json(
          home([
            null,
            { crop: 'i170002', readyAt: NOW - 1 },
            { crop: 'i170001', readyAt: NOW + 90 * 60_000 },
            null,
            null,
            null,
          ]),
        ),
      'POST /api/game/home/harvest': () =>
        json({ home: home(), character, harvested: { crop: 'i170002', count: 3 } }),
    })
    renderWithProviders(
      <>
        <HomeWindow character={character} onClose={vi.fn()} />
        <ToastHost />
      </>,
    )
    expect(
      await screen.findByRole('button', { name: /^Field 3: Grass, 01:(29|30):\d\d$/ }),
    ).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Field 2: Eggplant, ready' }))
    expect(requestBody(fetch, 'POST /api/game/home/harvest')).toEqual({ plot: 1 })
    expect(await screen.findByText('Harvested Eggplant x3.')).toBeVisible()
  })

  it('opens Storage from the house', async () => {
    mockApi({
      'GET /api/game/home': () => json(home()),
      'GET /api/game/market/warehouse': () =>
        json({ items: [], capacity: 15, wallet: { stone: 0, gold: 0 } }),
    })
    renderWithProviders(<HomeWindow character={character} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Storage' }))
    expect(screen.getByRole('dialog', { name: 'Storage' })).toBeVisible()
    expect(await screen.findByRole('list', { name: 'Warehouse tiles' })).toBeVisible()
  })
})
