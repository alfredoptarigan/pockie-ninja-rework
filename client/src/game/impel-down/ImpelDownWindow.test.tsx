import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ImpelDownView } from '../../../../shared/src/schemas/impel-down'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import type { Replay } from '../types'
import { autoUnlocked, ImpelDownWindow } from './ImpelDownWindow'
import { impelArt } from './Tower'

const ninja = { ...character, level: 61 }
const view: ImpelDownView = {
  gate: 0,
  floor: 4,
  maxFloor: 4,
  intersection: false,
  lives: 3,
  maxLives: 3,
  refreshes: 0,
  refreshCost: 1000,
  nextGateLevel: 67,
  exp: 9000,
  drops: [
    [480001, 26.67],
    [480031, 26.67],
    [480061, 26.67],
    [480011, 6.67],
  ],
  resetAt: new Date(Date.now() + 3_600_000).toISOString(),
}
const replay: Replay = {
  seed: 1,
  fighters: [
    {
      index: 0,
      side: 'attackers',
      name: 'Ninja_01',
      level: 61,
      maxHp: 1,
      startHp: 1,
      hp: 1,
      maxMp: 1,
      startMp: 1,
      mp: 1,
    },
    {
      index: 1,
      side: 'defenders',
      name: 'Hollowified Ichigo',
      level: 62,
      maxHp: 1,
      startHp: 1,
      hp: 0,
      maxMp: 1,
      startMp: 1,
      mp: 1,
    },
  ],
  events: [],
  winner: 'attackers',
}

const open = async (data: ImpelDownView = view) => {
  const fetch = mockApi({
    'GET /api/game/impel-down': () => json(data),
    'POST /api/game/impel-down/fight': () =>
      json({
        replay,
        won: true,
        look: { clothing: 5 },
        exp: 9000,
        crystal: { iid: 480001, sold: false, coins: 0 },
        impelDown: { ...data, floor: 5, maxFloor: 5 },
        character: ninja,
      }),
    'POST /api/game/impel-down/next-gate': () =>
      json({ ...data, gate: 1, floor: 0, intersection: false }),
    'POST /api/game/impel-down/refresh': () =>
      json({ ...data, floor: 0, intersection: false, refreshes: 1 }),
  })
  renderWithProviders(<ImpelDownWindow character={ninja} onClose={vi.fn()} />)
  await screen.findByRole('region', { name: 'Impel Down status' })
  return fetch
}

describe('ImpelDownWindow', () => {
  it('has the tower art exported', () => {
    const file = (url: string) => join(__dirname, '../../../public', url)
    const names = [
      'floor',
      'prisonfloor',
      'prisonfloorknock',
      'prisonbridgeleft',
      'prisonbridgeright',
    ]
    for (let gate = 0; gate < 6; gate++) names.push(`gate${gate}`, `floor${gate}`)
    for (const name of names) expect(existsSync(file(impelArt(name)))).toBe(true)
  })

  it('shows the floor, lives and the floor’s rewards with a crystal tooltip', async () => {
    await open()
    expect(screen.getByLabelText('Current')).toHaveTextContent('Gate 1, Floor 5')
    expect(screen.getByLabelText('Lives')).toHaveTextContent('3')
    const rewards = screen.getByRole('region', { name: 'Rewards' })
    expect(rewards).toHaveTextContent('EXP: 9,000')
    const purple = within(rewards).getByText('Sharp Purple Crystal I')
    expect(purple).toHaveStyle({ color: '#CA47AE' })
    await userEvent.hover(purple)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Purple Crystal · Sharp')
    expect(tip).toHaveTextContent('Drop chance: 6.67%')
    expect(tip).toHaveTextContent('Stats are randomized on drop')
  })

  it('only the current floor can be clicked; it fights with the Auto Sell tier', async () => {
    const fetch = await open()
    expect(screen.getByRole('button', { name: 'Floor 4' })).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Auto Sell'))
    await userEvent.selectOptions(screen.getByLabelText('Auto Sell tier'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Floor 5' }))
    expect(requestBody(fetch, 'POST /api/game/impel-down/fight')).toEqual({ autoSell: 2 })
    const result = await screen.findByRole('dialog', { name: 'Victory' })
    expect(result).toHaveTextContent('You defeated Hollowified Ichigo.')
    expect(result).toHaveTextContent('Sharp Blue Crystal I went to your spirit inventory.')
    expect(result).toHaveTextContent('Lives left: 3/3.')
  })

  it('offers the next gate at the intersection and refreshes for coupons', async () => {
    const fetch = await open({ ...view, floor: 25, maxFloor: 25, intersection: true, drops: [] })
    expect(screen.getByLabelText('Current')).toHaveTextContent('Gate 1, Next Gate')
    expect(screen.getByRole('button', { name: 'Auto' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await userEvent.click(
      within(
        screen.getByRole('alertdialog', {
          name: /spend 1,000 coupons to restart from floor 1/,
        }),
      ).getByRole('button', { name: 'Accept' }),
    )
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/impel-down/refresh'))).toBe(true)
    await waitFor(() =>
      expect(screen.getByLabelText('Current')).toHaveTextContent('Gate 1, Floor 1'),
    )
  })

  it('proceeds to the next gate from the intersection', async () => {
    const fetch = await open({ ...view, floor: 25, maxFloor: 25, intersection: true, drops: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Next Gate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/impel-down/next-gate'))).toBe(
      true,
    )
  })

  it('keeps Auto and Refresh off until allowed, and no fights without lives', async () => {
    expect(autoUnlocked({ ...view, maxFloor: 24 })).toBe(false)
    expect(autoUnlocked({ ...view, maxFloor: 25 })).toBe(true)
    expect(autoUnlocked({ ...view, gate: 1, maxFloor: 30 })).toBe(false)
    const fetch = await open({ ...view, lives: 0 })
    expect(screen.getByRole('button', { name: 'Auto' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Floor 5' })).toBeDisabled()
    expect(requestBody(fetch, 'POST /api/game/impel-down/fight')).toBeUndefined()
  })

  it('opens the Info window', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Info' }))
    const info = await screen.findByRole('dialog', { name: 'Impel Down - Info' })
    expect(info).toHaveTextContent('You get 3 attempts per day. Losing a fight costs 1 life.')
  })
})
