import type { LasNochesView } from '@pockie/shared'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { LasNochesWindow } from './LasNochesWindow'
import { plainText } from '../text'

vi.mock('../art', () => ({ useMonsterPortrait: () => () => '/monster.webp' }))
const view: LasNochesView = {
  bestFloor: 0,
  runsLeft: 3,
  maxRuns: 3,
  options: { first: { floor: 1, stone: 1000 }, half: null },
  run: null,
  preview: {
    npcId: 'n900001',
    nameKey: 'lg_name_n900001',
    level: 1,
    hp: 124,
    chakra: 124,
    minAttack: 20,
    maxAttack: 25,
    defense: 0,
    hit: 0,
    pierce: 0,
    break: 0,
    constitution: 0,
    speed: 1257,
    block: 0,
    skills: [],
    exp: 355,
  },
}
const running: LasNochesView = {
  ...view,
  run: { floor: 7, pot: 2400, lives: 2, livesBought: 0, nextNpcId: 'n900007', lifePrice: 6 },
}
const noop = () => {}
function loadArt() {
  for (const image of document.querySelectorAll('img')) fireEvent.load(image)
}

describe('Las Noches', () => {
  it('exports all 170 opponent names, including boss names', () => {
    for (let floor = 1; floor <= 170; floor++)
      expect(plainText(`lg_name_n${900000 + floor}`)).not.toBe('')
    expect(plainText('lg_name_n900001')).toBe('Rudobon')
    expect(plainText('lg_name_n900020')).toBe('Aaroniero')
  })
  it('opens the tower without charging, then starts a run on Begin Challenge', async () => {
    const onClose = vi.fn()
    const fetch = mockApi({
      'GET /api/game/gates/las-noches': () => json(view),
      'POST /api/game/gates/las-noches/start': () => json({ lasNoches: running, character }),
    })
    renderWithProviders(<LasNochesWindow character={character} onClose={onClose} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }))
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/start'))).toBe(false)
    expect(screen.getByRole('status', { name: 'Loading area' })).toBeVisible()
    loadArt()
    expect(screen.queryByRole('status', { name: 'Loading area' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Rudobon' })).toBeVisible()
    expect(screen.getByText('Next Floor Enemy - Floor 1 - Lv.1')).toBeVisible()
    expect(screen.getByTitle('HP: 124')).toBeVisible()
    expect(screen.getByText('Ready to Begin')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Begin Challenge' }))
    expect(requestBody(fetch, 'POST /api/game/gates/las-noches/start')).toEqual({ mode: 'first' })
    await userEvent.click(screen.getByRole('button', { name: 'Leave Tower' }))
    expect(onClose).toHaveBeenCalled()
  })
  it('shows the bank, lives and server-owned next enemy', async () => {
    mockApi({ 'GET /api/game/gates/las-noches': () => json(running) })
    renderWithProviders(<LasNochesWindow character={character} onClose={noop} />)
    expect(await screen.findByRole('button', { name: 'Next Floor' })).toBeEnabled()
    loadArt()
    expect(screen.getByText('2,400')).toBeVisible()
    expect(screen.getByText('Lives Remaining').nextElementSibling).toHaveTextContent('2')
    expect(screen.getByRole('progressbar', { name: 'Floor 6 / Highest Floor None' })).toBeVisible()
    expect(screen.getByRole('note')).toHaveTextContent(
      'Losing this floor halves your EXP: 2,400 → 1,200',
    )
    expect(screen.getByRole('button', { name: 'Claim' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Buy a Life/ })).toBeNull()
  })
  it('blocks fighting and auto after the final loss but allows Claim', async () => {
    const fetch = mockApi({
      'GET /api/game/gates/las-noches': () =>
        json({ ...running, run: { ...running.run, lives: 0, pot: 0 } }),
      'POST /api/game/gates/las-noches/withdraw': () =>
        json({ lasNoches: view, character, potPaid: 0 }),
    })
    renderWithProviders(<LasNochesWindow character={character} onClose={noop} />)
    expect(await screen.findByRole('button', { name: 'Next Floor' })).toBeDisabled()
    loadArt()
    expect(screen.getByRole('button', { name: 'Auto Battle' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(requestBody(fetch, 'POST /api/game/gates/las-noches/withdraw')).toEqual({})
  })
  it('auto requests a real battle after three seconds and stops on an error', async () => {
    const fetch = mockApi({
      'GET /api/game/gates/las-noches': () => json(running),
      'POST /api/game/gates/las-noches/fight': () =>
        apiError(400, 'fight_refused', 'Fight unavailable'),
    })
    renderWithProviders(<LasNochesWindow character={character} onClose={noop} />)
    await screen.findByRole('button', { name: 'Auto Battle' })
    loadArt()
    await userEvent.click(screen.getByRole('button', { name: 'Auto Battle' }))
    expect(screen.getByRole('button', { name: 'Auto Stop' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await screen.findByText('Fight unavailable', {}, { timeout: 4500 })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Auto Battle' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(requestBody(fetch, 'POST /api/game/gates/las-noches/fight')).toEqual({})
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/auto'))).toBe(false)
  }, 8000)
  it('tears the Garganta open before the floor fight starts', async () => {
    mockApi({
      'GET /api/game/gates/las-noches': () => json(running),
      'POST /api/game/gates/las-noches/fight': () =>
        apiError(400, 'fight_refused', 'Fight unavailable'),
    })
    renderWithProviders(<LasNochesWindow character={character} onClose={noop} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Next Floor' }))
    expect(screen.getByTestId('las-noches-garganta')).toBeInTheDocument()
    expect(await screen.findByText('Fight unavailable')).toBeVisible()
  })
  it('retains a stop control for previously purchased auto runs', async () => {
    const data = {
      ...running,
      mode: 1,
      auto: { runsLeft: 2, runsBought: 3, reachFloor: 50, nextTickAt: null },
    }
    const fetch = mockApi({
      'GET /api/game/gates/las-noches': () => json(data),
      'POST /api/game/gates/las-noches/auto-stop': () =>
        json({ lasNoches: { ...data, mode: 2 }, character }),
    })
    renderWithProviders(<LasNochesWindow character={character} onClose={noop} />)
    await screen.findByRole('button', { name: 'Stop Auto' })
    loadArt()
    await userEvent.click(screen.getByRole('button', { name: 'Stop Auto' }))
    expect(requestBody(fetch, 'POST /api/game/gates/las-noches/auto-stop')).toEqual({})
  })
})
