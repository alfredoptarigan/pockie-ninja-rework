import type { GateExchange, GatesView } from '@pockie/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { DungeonShopWindow } from './DungeonShop'

const info: GateExchange['destInfo'] = {
  kind: 'use',
  equipSlot: null,
  level: 0,
  sellPrice: null,
  stack: 1,
  w: 1,
  h: 1,
  class: 'JewelItem',
}
const row = (id: number, srcItemId: string, tier: number, destItemId: string): GateExchange => ({
  id,
  srcItemId,
  srcCount: 50,
  commonItemId: 'i152015',
  destItemId,
  destCount: 1,
  destInfo: info,
  tier,
})
const view: GatesView = {
  triesLeft: 3,
  maxTries: 3,
  gates: [],
  run: null,
  exchanges: [
    row(1, 'i152010', 56, 'i491001'),
    row(2, 'i152010', 56, 'i491006'),
    row(21, 'i152011', 66, 'i491002'),
  ],
  crystals: { i152010: 20, i152011: 0, i152015: 35 },
}
const ninja = { ...character, level: 60, sceneId: 171 }
const noop = () => {}

describe('DungeonShopWindow', () => {
  it('shows the crystal balance and the Level 56 wares, and exchanges after the confirm', async () => {
    const fetchMock = mockApi({
      'GET /api/game/gates': () => json(view),
      'POST /api/game/gates/exchange': () => json({ items: [], character: ninja }),
    })
    renderWithProviders(<DungeonShopWindow character={ninja} onClose={noop} />)
    const tabs = screen.getByRole('tablist', { name: 'Dungeon Shop levels' })
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Level 56', 'Level 66', 'Level 76', 'Level 86', 'Level 96'])
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Balance' })).toHaveTextContent('35'),
    )
    const wares = screen.getByRole('list', { name: 'Level 56 wares' })
    expect(within(wares).getAllByRole('listitem')).toHaveLength(2)
    // 20 Level 56 crystals and 35 common ones cover the 50.
    await userEvent.click(
      screen.getByRole('button', { name: 'Exchange for Common Dragon Egg Stone' }),
    )
    expect(
      screen.getByText('Exchange for Common Dragon Egg Stone? Cost: 50 Common Valhalla Crystals', {
        normalizer: (text) => text.replace(/\s+/g, ' ').trim(),
      }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetchMock, 'POST /api/game/gates/exchange')).toEqual({ exchangeId: 1 })
  })

  it('locks wares above the ninja level and wares it cannot pay for', async () => {
    mockApi({ 'GET /api/game/gates': () => json(view) })
    renderWithProviders(<DungeonShopWindow character={{ ...ninja, level: 60 }} onClose={noop} />)
    await screen.findByRole('button', { name: 'Exchange for Common Dragon Egg Stone' })
    await userEvent.click(screen.getByRole('tab', { name: 'Level 66' }))
    const button = screen.getByRole('button', { name: 'Exchange for Refined Dragon Egg Stone' })
    expect(button).toHaveTextContent('Lv 66+')
    expect(button).toBeDisabled()
    await userEvent.click(screen.getByRole('tab', { name: 'Level 96' }))
    expect(screen.getByText('No wares at this level.')).toBeInTheDocument()
  })
})
