import type { LasNochesView } from '@pockie/shared'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { LasNochesWindow } from './LasNochesWindow'

const view: LasNochesView = {
  bestFloor: 0,
  runsLeft: 3,
  maxRuns: 3,
  options: { first: { floor: 1, stone: 1000 }, half: null },
  run: null,
}
const noop = () => {}
describe('Las Noches auto controls', () => {
  it('shows all prices and sends the chosen run count', async () => {
    const fetch = mockApi({
      'GET /api/game/gates/las-noches': () => json(view),
      'POST /api/game/gates/las-noches/auto': () => json({ lasNoches: view, character }),
    })
    renderWithProviders(<LasNochesWindow character={character} onClose={noop} />)
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Auto run count' }),
      '3',
    )
    expect(screen.getByRole('option', { name: '1 run (28 Gold)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '2 runs (58 Gold)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '3 runs (91 Gold)' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Auto' }))
    expect(requestBody(fetch, 'POST /api/game/gates/las-noches/auto')).toEqual({ runs: 3 })
  })
  it('shows progress and a stop control while running', async () => {
    const running = {
      ...view,
      mode: 1,
      run: { floor: 7, pot: 2400, lives: 1, livesBought: 0, nextNpcId: 'n900007', lifePrice: 6 },
      auto: {
        runsLeft: 2,
        runsBought: 3,
        reachFloor: 50,
        nextTickAt: new Date(Date.now() + 30000).toISOString(),
      },
    }
    const fetch = mockApi({
      'GET /api/game/gates/las-noches': () => json(running),
      'POST /api/game/gates/las-noches/auto-stop': () => json({ lasNoches: running, character }),
    })
    renderWithProviders(<LasNochesWindow character={character} onClose={noop} />)
    expect(await screen.findByText(/Auto runs left: 2/)).toHaveTextContent(
      /Next floor in .* seconds/,
    )
    expect(screen.queryByRole('button', { name: 'Fight Floor 7' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stop Auto' }))
    expect(requestBody(fetch, 'POST /api/game/gates/las-noches/auto-stop')).toEqual({})
  })
})
