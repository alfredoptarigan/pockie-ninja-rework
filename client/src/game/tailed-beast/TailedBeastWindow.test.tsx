import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TailedBeastView } from '../../../../shared/src/schemas/tailed-beast'
import assets from '../../generated/reborn-assets.json'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import type { Replay } from '../types'
import { beastAtlas, TailedBeastWindow } from './index'

const pools = [750_000_000, 1_000_000_000, 1_250_000_000].map((maxHp, mode) => ({
  mode,
  level: 35 + 25 * mode,
  ticketCost: [1, 3, 5][mode]!,
  hpLeft: mode === 2 ? 0 : maxHp - 1000,
  maxHp,
  killedBy: mode === 2 ? 'Rank_1' : null,
}))
const leaderboard = Array.from({ length: 12 }, (_, i) => ({
  place: i + 1,
  name: `Ninja_${String(i + 1).padStart(2, '0')}`,
  level: 60,
  village: i % 5,
  honor: 5000 - i * 100,
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
  me: { village: 0, honor: 1234, essence: 300, fights: 5, place: 3 },
  boxes: [
    { fights: 5, itemId: 'i500003', claimed: false, ready: true },
    { fights: 10, itemId: 'i500002', claimed: false, ready: false },
    { fights: 20, itemId: 'i500001', claimed: false, ready: false },
  ],
  villages: [0, 1, 2, 3, 4].map((village) => ({ village, honor: village * 10 })),
  leaderboard,
  kages: [{ village: 0, name: 'Ninja_01', isMe: true, claimedItemId: null }],
  kageChoices: ['i100004', 'i159140'],
  shop: [
    { itemId: 'i161007', essence: 80, available: true },
    { itemId: 'i150117', essence: 200, available: false },
    { itemId: 'i540001', essence: 300, available: true },
  ],
}
const ninja = { ...character, level: 60 }
const replay: Replay = { seed: 1, fighters: [], events: [], winner: 'attackers' }
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
const changed = () => json({ tailedBeast: view, character: ninja })
const open = async () => {
  const onClose = vi.fn()
  renderWithProviders(<TailedBeastWindow character={ninja} onClose={onClose} />)
  await screen.findByRole('button', { name: /^Isobu/ })
  return onClose
}

describe('TailedBeastWindow', () => {
  it('uses beast and map art that exists in the asset manifest', () => {
    const urls = new Set(Object.values(assets).map((asset) => asset.url))
    for (let id = 1; id <= 9; id++) {
      expect(urls).toContain(`${beastAtlas(id)}.webp`)
      expect(urls).toContain(`${beastAtlas(id)}.json`)
    }
    expect(urls).toContain('/assets/reborn/scenes/tailedBeast/map.webp')
  })

  it('shows today’s beasts on the map with the Reborn button bar', async () => {
    mockApi(handlers)
    const onClose = await open()
    expect(screen.getByRole('button', { name: /^Son Goku/ })).toBeVisible()
    expect(screen.getByText(/Tickets left today: 2\/10/)).toBeVisible()
    const bar = screen.getByRole('group', { name: 'Tailed Beast menu' })
    expect(
      within(bar)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Kage Ninja', 'Leaderboard', 'Essence Shop', 'Back to Hall'])
    await userEvent.click(within(bar).getByRole('button', { name: 'Back to Hall' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('picks a difficulty in Fight {name} and fights only what the tickets pay', async () => {
    const fetch = mockApi({
      ...handlers,
      'POST /api/game/tailed-beast/fight': () => apiError(400, 'no_tickets', 'Not enough tickets.'),
    })
    await open()
    await userEvent.click(screen.getByRole('button', { name: /^Isobu/ }))
    const window = screen.getByRole('dialog', { name: 'Fight Isobu' })
    expect(within(window).getByText('Choose your difficulty level:')).toBeVisible()
    const cards = within(window).getAllByRole('group')
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Normal',
      'Hard',
      'Rampage',
    ])
    expect(within(cards[0]!).getByText('Lv 35')).toBeVisible()
    expect(within(cards[2]!).getByText('Defeated by Rank_1.')).toBeVisible()
    const fights = within(window).getAllByRole('button', { name: /^Fight/ })
    expect(fights.map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true, true])
    expect(within(window).getByRole('checkbox', { name: 'Auto Fight' })).not.toBeChecked()
    await userEvent.click(fights[0]!)
    expect(requestBody(fetch, 'POST /api/game/tailed-beast/fight')).toEqual({ beast: 3, mode: 0 })
    expect(await within(window).findByText('Not enough tickets.')).toBeVisible()
  })

  it('keeps fighting the chosen difficulty while Auto Fight is on', async () => {
    const fetch = mockApi({
      ...handlers,
      'POST /api/game/tailed-beast/fight': () =>
        json({
          tailedBeast: view,
          character: ninja,
          replay,
          npcIds: [],
          damage: 1000,
          honor: 10,
          killed: false,
        }),
    })
    await open()
    await userEvent.click(screen.getByRole('button', { name: /^Isobu/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Auto Fight' }))
    await userEvent.click(screen.getAllByRole('button', { name: /^Fight/ })[0]!)
    const fights = () => fetch.mock.calls.filter(([, init]) => init?.method === 'POST').length
    await waitFor(() => expect(fights()).toBeGreaterThanOrEqual(2), { timeout: 2000 })
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Auto Fight' }))
  })

  it('lists the five Kages and claims a Kage reward', async () => {
    const fetch = mockApi({ ...handlers, 'POST /api/game/tailed-beast/kage': changed })
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Kage Ninja' }))
    const kages = screen.getByRole('dialog', { name: 'Kage Level Ninja' })
    expect(
      within(kages)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Konoha Hokage', 'Kiri Mizukage', 'Kumo Raikage', 'Suna Kazekage', 'Iwa Tsuchikage'])
    expect(within(kages).getByText('Ninja_01')).toBeVisible()
    expect(within(kages).getAllByText('???')).toHaveLength(4)
    await userEvent.click(within(kages).getByRole('button', { name: 'Kage Rewards' }))
    const rewards = screen.getByRole('dialog', { name: 'Kage Rewards' })
    expect(within(rewards).getByText('Earn the highest honor in your village.')).toBeVisible()
    const claim = within(rewards).getByRole('button', { name: 'Claim' })
    expect(claim).toBeDisabled()
    await userEvent.click(within(rewards).getByRole('button', { name: 'Kage Title' }))
    await userEvent.click(claim)
    expect(requestBody(fetch, 'POST /api/game/tailed-beast/kage')).toEqual({ itemId: 'i159140' })
  })

  it('claims fight boxes in Tailed Beast Rewards', async () => {
    const fetch = mockApi({ ...handlers, 'POST /api/game/tailed-beast/box': changed })
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Kage Ninja' }))
    await userEvent.click(screen.getByRole('button', { name: 'Damage Rewards' }))
    const window = screen.getByRole('dialog', { name: 'Tailed Beast Rewards' })
    expect(within(window).getByText('Fight 20 Tailed Beasts (5/20)')).toBeVisible()
    expect(within(window).getByText('Fight 5 Tailed Beasts (5/5)')).toBeVisible()
    const claims = within(window).getAllByRole('button', { name: 'Claim' })
    expect(claims.map((b) => (b as HTMLButtonElement).disabled)).toEqual([true, true, false])
    await userEvent.click(claims[2]!)
    expect(requestBody(fetch, 'POST /api/game/tailed-beast/box')).toEqual({ fights: 5 })
    await userEvent.click(within(window).getByRole('button', { name: 'Info' }))
    expect(within(window).getByText(/Box C: complete 5 fights/)).toBeVisible()
  })

  it('pages and filters the Tailed Beast Leaderboard by village', async () => {
    mockApi(handlers)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Leaderboard' }))
    const board = screen.getByRole('dialog', { name: 'Tailed Beast Leaderboard' })
    expect(within(board).getByText('Your Rank: #3')).toBeVisible()
    expect(within(board).getByText('Honor: 1,234')).toBeVisible()
    expect(
      within(board)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['All', 'Fire', 'Water', 'Lightning', 'Wind', 'Earth'])
    expect(
      within(board)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Rank', 'Player Name', 'Level', 'Honor', 'Village'])
    // Header row plus 10 rows a page.
    expect(within(board).getAllByRole('row')).toHaveLength(11)
    await userEvent.click(within(board).getByRole('button', { name: 'Next page' }))
    expect(within(board).getByRole('cell', { name: 'Ninja_12' })).toBeVisible()
    await userEvent.click(within(board).getByRole('tab', { name: 'Water' }))
    expect(within(board).getAllByRole('row')).toHaveLength(4)
    expect(within(board).getByText('Your Rank: --')).toBeVisible()
    expect(within(board).getByText('Village Honor: 10')).toBeVisible()
  })

  it('sells for Essence', async () => {
    const fetch = mockApi({ ...handlers, 'POST /api/game/tailed-beast/shop': changed })
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Essence Shop' }))
    const shop = screen.getByRole('dialog', { name: 'Essence Shop' })
    const buys = within(shop).getAllByRole('button', { name: 'Buy' })
    expect(buys.map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true, false])
    expect(within(shop).getByText(/Coming soon/)).toBeVisible()
    await userEvent.click(buys[0]!)
    expect(requestBody(fetch, 'POST /api/game/tailed-beast/shop')).toEqual({
      itemId: 'i161007',
      count: 1,
    })
  })
})
