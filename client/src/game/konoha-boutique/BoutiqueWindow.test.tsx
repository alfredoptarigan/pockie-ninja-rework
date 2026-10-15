import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BoutiqueSpinResult,
  BoutiqueView,
} from '../../../../shared/src/schemas/konoha-boutique'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { KonohaBoutiqueWindow } from './index'

const info = {
  kind: 'use',
  equipSlot: null,
  level: 0,
  sellPrice: null,
  stack: 50,
  w: 1,
  h: 1,
  class: 'PharmacyItem',
} as BoutiqueView['rewards'][number]['info']
const view: BoutiqueView = {
  coins: 1_000,
  level: 2,
  currentExp: 1_500,
  levels: { 1: [0, 1, 5], 2: [1_000, 2, 9], 3: [5_000, 3, 13] },
  bonusChance: 0,
  bonusPicks: [],
  doubleChance: 0,
  doubleChanceCoins: 0,
  doubleChanceNumber: 0,
  doubleChanceOperator: 'higher',
  lastCoinWon: 0,
  nextFreeCoinTime: new Date(Date.now() - 1000).toISOString(),
  freeCoinsClaimed: 1,
  freeCoinsPerDay: 5,
  rewards: [
    { id: 'hp-potion', itemId: 'i160010', amount: 10, price: 500, info },
    { id: 'big', itemId: 'i160020', amount: 1, price: 5_000, info },
  ],
  buyTiers: { gold: [[10, 1_000]], stone: [[100_000, 1_000]], giftCoupon: [[100, 1_000]] },
}
const PATH = '/api/game/konoha-boutique'

beforeEach(() => localStorage.clear())

/** The GET answers with the latest view an action returned. */
async function open(data: BoutiqueView = view, actions: Record<string, () => object> = {}) {
  let current = data
  const handlers = Object.fromEntries(
    Object.entries(actions).map(([key, result]) => [
      key,
      () => {
        const body = result() as { boutique?: BoutiqueView }
        if (body.boutique) current = body.boutique
        return json(body)
      },
    ]),
  )
  const fetch = mockApi({ [`GET ${PATH}`]: () => json(current), ...handlers })
  renderWithProviders(<KonohaBoutiqueWindow character={character} onClose={vi.fn()} />)
  await screen.findByRole('group', { name: 'Slot machine' })
  return fetch
}

describe('KonohaBoutiqueWindow', () => {
  it('shows the coins, the level, the bet and the free-coin line', async () => {
    await open()
    expect(screen.getByLabelText('Boutique Coins')).toHaveTextContent('1,000')
    expect(screen.getByRole('progressbar', { name: 'Boutique level' })).toHaveTextContent('Lv.2')
    expect(screen.getByRole('status', { name: 'Bet' })).toHaveTextContent('1')
    expect(screen.getByText('Free coins claimed: 1/5')).toBeVisible()
    expect(screen.getAllByRole('img', { name: /bonus card slot/ })).toHaveLength(4)
  })

  it('caps the steppers at the level and spins with them', async () => {
    const result: BoutiqueSpinResult = {
      pieces: ['j', 'j', 'j', 'q', 'k', ...Array<'a'>(10).fill('a')],
      winningLines: [0],
      winningPieces: [0, 1, 2],
      coinsGained: 60,
      boutique: { ...view, coins: 1_042, lastCoinWon: 60 },
    }
    const fetch = await open(view, { [`POST ${PATH}/spin`]: () => result })
    await userEvent.click(screen.getByRole('button', { name: 'More Multiplier' }))
    expect(screen.getByRole('button', { name: 'More Multiplier' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'More Lines' }))
    expect(screen.getByRole('img', { name: 'Win lines' })).toBeVisible()
    expect(screen.getByRole('status', { name: 'Bet' })).toHaveTextContent('4')
    await userEvent.click(screen.getByRole('button', { name: 'Try Your Luck' }))
    expect(requestBody(fetch, `POST ${PATH}/spin`)).toEqual({ multiplier: 2, lines: 2 })
    await waitFor(
      () => expect(screen.getByLabelText('Boutique Coins')).toHaveTextContent('1,042'),
      { timeout: 4000 },
    )
    expect(await screen.findByRole('img', { name: 'You won' })).toBeVisible()
    expect(screen.getByRole('status', { name: 'Coins won last time' })).toHaveTextContent('60')
    expect(JSON.parse(localStorage.getItem('boutique-multiplier')!)).toBe(2)
  })

  it('claims free coins', async () => {
    const fetch = await open(view, {
      [`POST ${PATH}/free-coins`]: () => ({
        boutique: { ...view, coins: 1_500, freeCoinsClaimed: 2 },
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Free Coins' }))
    expect(requestBody(fetch, `POST ${PATH}/free-coins`)).toEqual({})
    expect(await screen.findByText(/Free coins claimed: 2\/5|Next free coins in/)).toBeVisible()
  })

  it('blocks spins while a Bonus Round waits and picks its chests', async () => {
    const waiting = { ...view, bonusChance: 1 }
    const fetch = await open(waiting, {
      [`POST ${PATH}/chest`]: () => ({ index: 2, coinsWon: 20, boutique: waiting }),
    })
    expect(screen.getByRole('button', { name: 'Try Your Luck' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Claim Bonus' }))
    const round = screen.getByRole('dialog', { name: 'Bonus Round' })
    expect(within(round).getByRole('button', { name: 'OK' })).toBeDisabled()
    await userEvent.click(within(round).getByRole('button', { name: 'Chest 3' }))
    expect(requestBody(fetch, `POST ${PATH}/chest`)).toEqual({ index: 2 })
    expect(await within(round).findByRole('button', { name: 'Chest 3: 20 coins' })).toBeVisible()
  })

  it('reveals the Double Chance boxes', async () => {
    const waiting: BoutiqueView = {
      ...view,
      doubleChance: 1,
      doubleChanceCoins: 50,
      doubleChanceNumber: 4,
    }
    await open(waiting, {
      [`POST ${PATH}/double`]: () => ({
        won: true,
        boxes: [7, 1, 2, 3, 5, 9],
        index: 0,
        picked: 7,
        operator: 'higher',
        target: 4,
        boutique: { ...view, coins: 1_100 },
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Double Chance' }))
    const round = screen.getByRole('dialog', { name: 'Double Chance' })
    expect(round).toHaveTextContent('Coins at Stake: 50')
    expect(round).toHaveTextContent('Pick Higher')
    await userEvent.click(within(round).getByRole('button', { name: 'Box 1' }))
    expect(await within(round).findByRole('status')).toHaveTextContent('Double — Won!')
    expect(within(round).getByRole('button', { name: 'Box 6: 9' })).toBeVisible()
  })

  it('previews and buys a reward after the confirm', async () => {
    const fetch = await open(view, {
      [`POST ${PATH}/exchange`]: () => ({ boutique: { ...view, coins: 500 }, character }),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Buy Items' }))
    const shop = screen.getByRole('dialog', { name: 'Exchange Rewards' })
    const [potion, big] = within(shop).getAllByRole('listitem')
    await userEvent.hover(potion!)
    expect(screen.getByRole('tooltip')).toBeVisible()
    expect(within(big!).getByRole('button', { name: /^Purchase/ })).toBeDisabled()
    await userEvent.click(within(potion!).getByRole('button', { name: /^Purchase/ }))
    const confirm = screen.getByRole('dialog', { name: 'Confirm Purchase' })
    expect(confirm).toHaveTextContent('500 Coins')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }))
    expect(requestBody(fetch, `POST ${PATH}/exchange`)).toEqual({ rewardId: 'hp-potion' })
  })

  it('buys coins with a currency the ninja can afford', async () => {
    const rich = { ...character, giftCoupon: 100 }
    const fetch = mockApi({
      [`GET ${PATH}`]: () => json(view),
      [`POST ${PATH}/buy-coins`]: () => json({ boutique: { ...view, coins: 2_000 }, character }),
    })
    renderWithProviders(<KonohaBoutiqueWindow character={rich} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Buy Coins' }))
    const shop = screen.getByRole('dialog', { name: 'Buy Boutique Coins' })
    expect(within(shop).getByRole('button', { name: /10 Gold → 1,000 Coins/ })).toBeDisabled()
    await userEvent.click(within(shop).getByRole('tab', { name: 'Gift Cert' }))
    expect(shop).toHaveTextContent('Your Gift Cert: 100')
    await userEvent.click(within(shop).getByRole('button', { name: /100 Gift Cert → 1,000 Coins/ }))
    expect(requestBody(fetch, `POST ${PATH}/buy-coins`)).toEqual({
      currency: 'giftCoupon',
      tier: 0,
    })
  })

  it('shows the level table in the guide', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Info' }))
    const guide = screen.getByRole('dialog', { name: 'Guide' })
    expect(guide).toHaveTextContent('Cost per Spin = Multiplier × Lines')
    expect(within(guide).getAllByRole('row')).toHaveLength(4)
    expect(guide).toHaveTextContent('5 Match → ×50')
  })
})
