import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MallItemView, MallView } from '../../../../shared/src/schemas/mall'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { MallWindow } from './index'

const PATH = '/api/game/mall'
const info: MallItemView['info'] = {
  kind: 'use',
  equipSlot: null,
  level: 0,
  sellPrice: null,
  stack: 20,
  w: 1,
  h: 1,
  class: 'FoodItem',
}
const row = (index: number, extra: Partial<MallItemView> = {}): MallItemView => ({
  index,
  itemId: 'i120002',
  info,
  price: 18,
  currency: 'gold',
  altCurrency: 'coupons',
  altPrice: 18,
  ...extra,
})
const vipCard = row(50, {
  itemId: 'i150270',
  price: 28,
  altCurrency: undefined,
  altPrice: undefined,
  dailyLimit: 1,
  purchasedToday: 0,
})
const view: MallView = {
  groups: [
    { key: 'hot', label: 'Hot', items: Array.from({ length: 9 }, (_, i) => row(i)) },
    { key: 'vip', label: 'VIP', items: [vipCard] },
  ],
  resetAt: new Date(Date.now() + 3_600_000).toISOString(),
}
const rich = { ...character, gold: 100, giftCoupon: 10 }

async function open(handlers = {}) {
  const fetch = mockApi({ [`GET ${PATH}`]: () => json(view), ...handlers })
  renderWithProviders(<MallWindow character={rich} onClose={vi.fn()} />)
  await screen.findByRole('tabpanel')
  return fetch
}

describe('MallWindow', () => {
  it('shows the tabs, 8 cards a page, both prices and the balances', async () => {
    await open()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Hot', 'VIP'])
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getAllByRole('listitem')).toHaveLength(8)
    expect(within(panel).getByText('1/2')).toBeVisible()
    const card = within(panel).getAllByRole('listitem')[0]!
    // 18 Gold is affordable, 18 Coupons is not (10 held).
    expect(within(card).getByRole('button', { name: /for Gold$/ })).toBeEnabled()
    expect(within(card).getByRole('button', { name: /for Coupons$/ })).toBeDisabled()
    const balances = screen.getByRole('group', { name: 'Balances' })
    const held = (coin: string) => within(balances).getByRole('img', { name: coin }).parentElement
    expect(held('Gold')).toHaveTextContent('100')
    expect(held('Coupons')).toHaveTextContent('10')

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(within(panel).getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows the daily limit on a limited card', async () => {
    await open()
    await userEvent.click(screen.getByRole('tab', { name: 'VIP' }))
    expect(screen.getByText('1/1 remaining')).toHaveAttribute(
      'title',
      'Daily purchases reset at midnight UTC.',
    )
  })

  it('buys a quantity after the confirm and toasts', async () => {
    const fetch = await open({
      [`POST ${PATH}/buy`]: () => json({ mall: view, character: { ...rich, gold: 46 } }),
    })
    const card = within(screen.getByRole('tabpanel')).getAllByRole('listitem')[2]!
    await userEvent.click(within(card).getByRole('button', { name: /for Gold$/ }))
    const prompt = screen.getByRole('alertdialog', { name: 'Buy item' })
    expect(prompt).toHaveTextContent('Price: 18 Gold')
    const quantity = within(prompt).getByRole('spinbutton', { name: 'Quantity' })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, '3')
    expect(prompt).toHaveTextContent('Total: 54 Gold')
    await userEvent.click(within(prompt).getByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(requestBody(fetch, `POST ${PATH}/buy`)).toEqual({
        index: 2,
        quantity: 3,
        currency: 'gold',
      }),
    )
  })

  it('caps the quantity at what the ninja can afford', async () => {
    await open()
    const card = within(screen.getByRole('tabpanel')).getAllByRole('listitem')[0]!
    await userEvent.click(within(card).getByRole('button', { name: /for Gold$/ }))
    const prompt = screen.getByRole('alertdialog', { name: 'Buy item' })
    const quantity = within(prompt).getByRole('spinbutton', { name: 'Quantity' })
    await userEvent.clear(quantity)
    await userEvent.type(quantity, '6')
    expect(within(prompt).getByRole('button', { name: 'Accept' })).toBeDisabled()
  })
})
