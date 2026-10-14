import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TailedBeastView } from '../../../../shared/src/schemas/tailed-beast'
import assets from '../../generated/reborn-assets.json'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { beastAtlas, TailedBeastWindow } from './index'

const pools = [750_000_000, 1_000_000_000, 1_250_000_000].map((maxHp, mode) => ({
  mode,
  level: 35 + 25 * mode,
  ticketCost: [1, 3, 5][mode]!,
  hpLeft: mode === 2 ? 0 : maxHp - 1000,
  maxHp,
  killedBy: mode === 2 ? 'Rank_1' : null,
}))
const view: TailedBeastView = {
  week: '2026-10-12',
  day: 2,
  resetAt: '2026-10-19T00:00:00.000Z',
  beasts: [
    { id: 3, nameKey: 'reborn_beast_3', pools },
    { id: 4, nameKey: 'reborn_beast_4', pools },
  ],
  tickets: { used: 8, perDay: 10 },
  me: { village: 0, honor: 1234, essence: 300, fights: 5 },
  boxes: [
    { fights: 5, itemId: 'i500003', claimed: false, ready: true },
    { fights: 10, itemId: 'i500002', claimed: false, ready: false },
    { fights: 20, itemId: 'i500001', claimed: false, ready: false },
  ],
  villages: [0, 1, 2, 3, 4].map((village) => ({ village, honor: village * 10 })),
  leaderboard: [{ place: 1, name: 'Ninja_01', level: 60, village: 0, honor: 1234 }],
  kages: [{ village: 0, name: 'Ninja_01', isMe: true, claimedItemId: null }],
  kageChoices: ['i100004', 'i159140'],
  shop: [
    { itemId: 'i161007', essence: 80, available: true },
    { itemId: 'i150117', essence: 200, available: false },
    { itemId: 'i540001', essence: 300, available: true },
  ],
}
const ninja = { ...character, level: 60 }
const atlasFrame = {
  textures: [
    { size: { w: 10, h: 10 }, frames: [{ filename: '1', frame: { x: 0, y: 0, w: 5, h: 5 } }] },
  ],
}
const handlers = {
  'GET /api/game/tailed-beast': () => json(view),
  'GET /assets/reborn/scenes/tailedBeast/beast-3.json': () => json(atlasFrame),
  'GET /assets/reborn/scenes/tailedBeast/beast-4.json': () => json(atlasFrame),
}

describe('TailedBeastWindow', () => {
  it('uses beast art that exists in the asset manifest', () => {
    const urls = new Set(Object.values(assets).map((asset) => asset.url))
    for (let id = 1; id <= 9; id++) {
      expect(urls).toContain(`${beastAtlas(id)}.webp`)
      expect(urls).toContain(`${beastAtlas(id)}.json`)
    }
  })

  it('shows today\u2019s beasts, HP and tickets, and fights only what the tickets pay', async () => {
    const fetch = mockApi({
      ...handlers,
      'POST /api/game/tailed-beast/fight': () => apiError(400, 'no_tickets', 'Not enough tickets.'),
    })
    renderWithProviders(<TailedBeastWindow character={ninja} onClose={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Isobu' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Son Goku' })).toBeVisible()
    expect(screen.getByText(/Tickets left today: 2\/10/)).toBeVisible()
    expect(screen.getAllByText('Defeated by Rank_1.')).toHaveLength(2)
    const fights = screen.getAllByRole('button', { name: /^Fight/ })
    expect(fights.map((b) => (b as HTMLButtonElement).disabled)).toEqual([
      false,
      true,
      true,
      false,
      true,
      true,
    ])
    await userEvent.click(fights[0]!)
    expect(requestBody(fetch, 'POST /api/game/tailed-beast/fight')).toEqual({ beast: 3, mode: 0 })
    expect(await screen.findByText('Not enough tickets.')).toBeVisible()
  })

  it('opens a ready box and picks a Kage reward', async () => {
    const fetch = mockApi({
      ...handlers,
      'POST /api/game/tailed-beast/box': () => json({ tailedBeast: view, character: ninja }),
      'POST /api/game/tailed-beast/kage': () => json({ tailedBeast: view, character: ninja }),
    })
    renderWithProviders(<TailedBeastWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Rewards' }))
    const opens = screen.getAllByRole('button', { name: 'Open' })
    expect(opens.map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true, true])
    await userEvent.click(opens[0]!)
    expect(requestBody(fetch, 'POST /api/game/tailed-beast/box')).toEqual({ fights: 5 })
    expect(await screen.findByText('You received Tailed Beast Reward Box C.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Kage Title' }))
    expect(requestBody(fetch, 'POST /api/game/tailed-beast/kage')).toEqual({ itemId: 'i159140' })
  })

  it('sells for Essence and lists the ranking', async () => {
    const fetch = mockApi({
      ...handlers,
      'POST /api/game/tailed-beast/shop': () => json({ tailedBeast: view, character: ninja }),
    })
    renderWithProviders(<TailedBeastWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Essence Shop' }))
    const buys = screen.getAllByRole('button', { name: 'Buy' })
    expect(buys.map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true, false])
    expect(screen.getByText(/Coming soon/)).toBeVisible()
    await userEvent.click(buys[0]!)
    expect(requestBody(fetch, 'POST /api/game/tailed-beast/shop')).toEqual({
      itemId: 'i161007',
      count: 1,
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Ranking' }))
    expect(screen.getByRole('cell', { name: 'Ninja_01' })).toBeVisible()
    expect(screen.getByText(/Village Honor: Fire 0, Water 10/)).toBeVisible()
  })
})
