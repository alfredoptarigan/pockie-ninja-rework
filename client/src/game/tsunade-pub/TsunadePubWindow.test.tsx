import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  PubPrizeView,
  PubSpinResult,
  TsunadePubView,
} from '../../../../shared/src/schemas/tsunade-pub'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { TsunadePubWindow } from './index'
import { packPages } from './prizes'
import { slotPosition } from './wheel'

const prize = (itemId: string, extra: Partial<PubPrizeView> = {}): PubPrizeView => ({
  itemId,
  amount: 1,
  rarity: 'common',
  sellValue: 100,
  info: {
    kind: 'use',
    equipSlot: null,
    level: 0,
    sellPrice: null,
    stack: 50,
    w: 1,
    h: 1,
    class: 'DebrisItem',
  },
  ...extra,
})
const board = Array.from({ length: 16 }, (_, i) => prize(i % 2 ? 'i150110' : 'i160010'))
const view: TsunadePubView = {
  board,
  won: [prize('i150110', { bound: true }), prize('i160010', { amount: 5, bound: false })],
  freeAttempts: 5,
  rewardAttempts: 0,
  paidAttempts: 0,
  rollsUntilBonus: 5,
  rollsUntilGuaranteed: 100,
  resetAt: new Date(Date.now() + 3_600_000).toISOString(),
}
const PATH = '/api/game/tsunade-pub'

/** The window refetches after every action, so the GET answers with the latest `pub`. */
async function open(
  data: TsunadePubView = view,
  actions: Record<string, () => { pub: TsunadePubView }> = {},
) {
  let current = data
  const handlers = Object.fromEntries(
    Object.entries(actions).map(([key, result]) => [
      key,
      () => {
        const body = result()
        current = body.pub
        return json(body)
      },
    ]),
  )
  const fetch = mockApi({ [`GET ${PATH}`]: () => json(current), ...handlers })
  renderWithProviders(<TsunadePubWindow onClose={vi.fn()} />)
  await screen.findByRole('list', { name: 'Prize roulette' })
  return fetch
}

describe('Tsunade Pub helpers', () => {
  it('lays the 16 slots clockwise around the square', () => {
    const lefts = Array.from({ length: 16 }, (_, i) => slotPosition(i).left)
    const tops = Array.from({ length: 16 }, (_, i) => slotPosition(i).top)
    expect(lefts).toEqual([0, 58, 116, 174, 232, 232, 232, 232, 232, 174, 116, 58, 0, 0, 0, 0])
    expect(tops).toEqual([0, 0, 0, 0, 0, 58, 116, 174, 232, 232, 232, 232, 232, 174, 116, 58])
  })

  it('packs prizes first-fit into 10x8 pages', () => {
    const big = prize('i290098', { info: { ...prize('x').info, w: 2, h: 2 } })
    const pages = packPages([big, prize('a'), ...Array.from({ length: 80 }, () => prize('b'))])
    expect(pages[0]![0]).toMatchObject({ index: 0, x: 0, y: 0 })
    expect(pages[0]![1]).toMatchObject({ index: 1, x: 2, y: 0 })
    expect(pages).toHaveLength(2)
    expect(pages[1]).toHaveLength(5)
  })
})

describe('TsunadePubWindow', () => {
  it('shows the wheel, the counters and the unclaimed prizes', async () => {
    await open()
    const wheel = screen.getByRole('list', { name: 'Prize roulette' })
    expect(within(wheel).getAllByRole('listitem')).toHaveLength(16)
    expect(screen.getByRole('status', { name: 'Prize: none yet' })).toHaveTextContent('?')
    expect(screen.getByText('Bonus in 5 · Special in 100')).toBeVisible()
    expect(screen.getByText('FREE').nextSibling).toHaveTextContent('5')
    expect(screen.getByText('Unclaimed Prizes (2)')).toBeVisible()
    expect(screen.getByText('Page 1 of 5')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buy 10g' })).toBeEnabled()
  })

  it('spins, highlights its way to the winning slot and shows the prize', async () => {
    const won = prize('i150172', { rarity: 'uncommon', bound: false })
    const result: PubSpinResult = {
      currentBoard: board.map((slot, i) => (i === 3 ? won : slot)),
      winningIndex: 3,
      prize: won,
      extra: null,
      pub: { ...view, won: [...view.won, won], freeAttempts: 4, rollsUntilBonus: 4 },
      character,
    }
    await open(view, { [`POST ${PATH}/spin`]: () => result })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Quick Spin' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spin' }))
    await waitFor(
      () => expect(screen.getByRole('status', { name: /^Prize: / })).not.toHaveTextContent('?'),
      { timeout: 5000 },
    )
    expect(screen.getByText('Unclaimed Prizes (3)')).toBeVisible()
    expect(screen.getByText('Bonus in 4 · Special in 100')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Spin' })).toBeEnabled(), {
      timeout: 3000,
    })
  })

  it('cannot spin without spins and buys one for 10 Gold', async () => {
    const empty = { ...view, freeAttempts: 0 }
    const fetch = await open(empty, {
      [`POST ${PATH}/buy`]: () => ({ pub: { ...empty, paidAttempts: 1 }, character }),
    })
    expect(screen.getByRole('button', { name: 'Spin' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Buy 10g' }))
    expect(requestBody(fetch, `POST ${PATH}/buy`)).toEqual({})
    await waitFor(() => expect(screen.getByRole('button', { name: 'Spin' })).toBeEnabled())
  })

  it('collects one prize from its menu and all of them with Collect All', async () => {
    const fetch = await open(view, {
      [`POST ${PATH}/collect`]: () => ({ pub: view, character, collected: 1 }),
    })
    const page = screen.getByRole('list', { name: 'Prize page 1' })
    await userEvent.click(within(page).getAllByRole('button')[1]!)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Collect Item' }))
    expect(requestBody(fetch, `POST ${PATH}/collect`)).toEqual({ index: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Collect All' }))
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/collect'))).toHaveLength(2)
  })

  it('sells the page after the confirm', async () => {
    const fetch = await open(view, {
      [`POST ${PATH}/sell`]: () => ({ pub: { ...view, won: [] }, character, earned: 245 }),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Sell Page' }))
    const confirm = screen.getByRole('alertdialog')
    expect(confirm).toHaveTextContent('Sell all 2 prize(s) on this page for stones?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetch, `POST ${PATH}/sell`)).toEqual({ indexes: [0, 1] })
    expect(await screen.findByText('Unclaimed Prizes (0)')).toBeVisible()
  })

  it('opens and closes the guide', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Info' }))
    const guide = screen.getByRole('region', { name: "Tsunade's Pub Guide" })
    expect(guide).toHaveTextContent('5 Free spins per day (resets at midnight UTC)')
    expect(guide).toHaveTextContent('Additional spins cost 10 Gold each')
    await userEvent.click(within(guide).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: "Tsunade's Pub Guide" })).toBeNull()
  })
})
