import type { LasNochesView } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
describe('Las Noches Tower lobby', () => {
  it('welcomes, starts at floor 1 and leaves', async () => {
    const onClose = vi.fn()
    const fetch = mockApi({
      'GET /api/game/gates/las-noches': () => json(view),
      'POST /api/game/gates/las-noches/start': () => json({ lasNoches: view, character }),
    })
    renderWithProviders(<LasNochesWindow character={character} onClose={onClose} />)
    const tower = await screen.findByRole('dialog', { name: 'Las Noches Tower' })
    expect(await within(tower).findByText('Runs left today: 3/3')).toBeVisible()
    expect(
      within(tower).getByText('Welcome to Las Noches! Defeat enemies to climb higher floors.'),
    ).toBeVisible()
    expect(
      within(tower).getByText('Challenge powerful enemies as you climb the tower.'),
    ).toBeVisible()
    expect(within(tower).getByText('Runs left today: 3/3')).toBeVisible()
    const express = within(tower).getByRole('button', { name: /^Express/ })
    expect(express).toBeDisabled()
    expect(express).toHaveAttribute('title', 'Highest Floor: 0')
    await userEvent.click(within(tower).getByRole('button', { name: 'Start (1k Stones)' }))
    expect(requestBody(fetch, 'POST /api/game/gates/las-noches/start')).toEqual({ mode: 'first' })
    await userEvent.click(within(tower).getByRole('button', { name: 'Leave' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('confirms the Express Route before starting halfway', async () => {
    const best = {
      ...view,
      bestFloor: 60,
      options: { ...view.options, half: { floor: 30, stone: 1783 } },
    }
    const fetch = mockApi({
      'GET /api/game/gates/las-noches': () => json(best),
      'POST /api/game/gates/las-noches/start': () => json({ lasNoches: best, character }),
    })
    renderWithProviders(<LasNochesWindow character={character} onClose={noop} />)
    const express = await screen.findByRole('button', { name: 'Express (1.8k Stones) - Floor 30' })
    expect(express).toHaveAttribute('title', 'Highest Floor: 60')
    await userEvent.click(express)
    const route = screen.getByRole('dialog', { name: 'Express Route' })
    expect(within(route).getByText('Floor 30')).toBeVisible()
    await userEvent.click(within(route).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Express Route' })).not.toBeInTheDocument()
    await userEvent.click(express)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(requestBody(fetch, 'POST /api/game/gates/las-noches/start')).toEqual({ mode: 'half' })
  })

  it('shows the floor, pot and lives with the run controls during a run', async () => {
    const running = {
      ...view,
      run: { floor: 7, pot: 2400, lives: 1, livesBought: 0, nextNpcId: 'n900007', lifePrice: 6 },
    }
    mockApi({ 'GET /api/game/gates/las-noches': () => json(running) })
    renderWithProviders(<LasNochesWindow character={character} onClose={noop} />)
    expect(await screen.findByRole('button', { name: 'Fight Floor 7' })).toBeEnabled()
    expect(screen.getByText('EXP pot: 2,400')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buy a Life (6 Gold)' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Claim EXP and End Current Run' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument()
  })
})

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
