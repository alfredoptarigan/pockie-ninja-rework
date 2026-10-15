import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ToastHost } from '../toast'
import { MerchantWindow, PouchRefillDialog, ShopWindow } from './index'

const powder = {
  slot: 0,
  itemId: 'i160006',
  priceStone: 38,
  priceGold: 0,
  priceGiftCoupon: 0,
  bound: true,
  appraised: false,
  identifyCount: 0,
}

const shop = {
  tabs: [1, 3, 2].map((shopType) => ({
    shopType,
    stock: [powder],
    refreshAt: new Date(Date.now() + 1800000).toISOString(),
    freeRestocks: 1,
    restockCosts: { stone: 50 },
  })),
  wholesale: { boxId: 1001, stock: [{ itemId: 'i160006', priceStone: 38, maxStack: 100 }] },
  sellable: [{ inventoryId: 'bag1', itemId: 'i160006', count: 2, price: 16, confirm: true }],
}

function renderShop(props: Partial<Parameters<typeof ShopWindow>[0]> = {}) {
  renderWithProviders(
    <>
      <ShopWindow character={character} onClose={vi.fn()} {...props} />
      <ToastHost />
    </>,
  )
}

const merchantItem = {
  slot: 0,
  itemId: 'i160006',
  price: 40,
  bound: true,
  left: 2,
  maxCount: 2,
  limit: 2,
  purchased: 0,
  useLevel: 1,
}
const merchant = (overrides: object = {}) => ({
  available: true,
  spawnId: 'spawn1',
  sceneId: 2601,
  endsAt: new Date(Date.now() + 600000).toISOString(),
  vipAvailable: false,
  stock: [merchantItem],
  vipStock: [],
  ...overrides,
})

function renderMerchant(who = { ...character, gold: 200 }) {
  renderWithProviders(
    <>
      <MerchantWindow character={who} onClose={vi.fn()} />
      <ToastHost />
    </>,
  )
}

describe('shop window (Reborn shop cards)', () => {
  it('shows the tabs, the balance and one 105x190 card per item', async () => {
    mockApi({ 'GET /api/game/shop/open': () => json(shop) })
    renderShop()
    const list = await screen.findByRole('list', { name: 'Shop stock' })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Item Shop',
      'Dark Shop',
      'Mystery Shop',
      'Wholesale',
      'Sell',
    ])
    expect(screen.getByRole('group', { name: 'Balance' })).toHaveTextContent('100 Stone')
    const card = within(list).getByRole('listitem')
    expect(card).toHaveClass('h-[190px]', 'w-[105px]')
    expect(card).toHaveTextContent('Healing Powder')
    expect(card).toHaveTextContent('38 Stone')
    expect(screen.getByText(/Restock in/)).toBeVisible()
  })

  it('pages the stock eight cards at a time', async () => {
    const stock = Array.from({ length: 9 }, (_, slot) => ({ ...powder, slot }))
    mockApi({
      'GET /api/game/shop/open': () =>
        json({ ...shop, tabs: shop.tabs.map((tab) => ({ ...tab, stock })) }),
    })
    renderShop()
    const list = await screen.findByRole('list', { name: 'Shop stock' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(8)
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  })

  it('confirms a Wholesale quantity in the prompt and toasts Purchase successful!', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/open': () => json(shop),
      'POST /api/game/shop/wholesale/buy': () => json({ character }),
    })
    renderShop()
    await userEvent.click(await screen.findByRole('tab', { name: 'Wholesale' }))
    await userEvent.click(screen.getByRole('button', { name: 'Buy Healing Powder' }))
    const prompt = screen.getByRole('alertdialog', { name: 'Buy Healing Powder' })
    expect(within(prompt).getByText('Maximum: 2')).toBeVisible()
    await userEvent.clear(within(prompt).getByLabelText('Quantity'))
    await userEvent.type(within(prompt).getByLabelText('Quantity'), '2')
    expect(prompt).toHaveTextContent('Buy Healing Powder x2?')
    expect(prompt).toHaveTextContent('Cost: 76 Stone')
    await userEvent.click(within(prompt).getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('Purchase successful!')).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/shop/wholesale/buy')).toEqual({
      itemId: 'i160006',
      count: 2,
    })
  })

  it('reports a failed purchase as a failure toast and Deny posts nothing', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/open': () => json(shop),
      'POST /api/game/shop/buy': () => apiError(400, 'money', 'Not enough Stone.'),
    })
    renderShop()
    await userEvent.click(await screen.findByRole('button', { name: 'Buy Healing Powder' }))
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(requestBody(fetch, 'POST /api/game/shop/buy')).toBeUndefined()

    await userEvent.click(screen.getByRole('button', { name: 'Buy Healing Powder' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Buy Healing Powder?')
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('Not enough Stone.')).toHaveAttribute('role', 'alert')
    expect(requestBody(fetch, 'POST /api/game/shop/buy')).toEqual({
      shopType: 1,
      slot: 0,
      currency: 'stone',
    })
  })

  it('sells from the Sell tab after the Reborn confirm', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/open': () => json(shop),
      'POST /api/game/shop/sell': () => json({ character }),
    })
    renderShop()
    await userEvent.click(await screen.findByRole('tab', { name: 'Sell' }))
    const card = within(screen.getByRole('list', { name: 'Bag items' })).getByRole('listitem')
    expect(card).toHaveTextContent('x2')
    await userEvent.click(within(card).getByRole('button', { name: 'Sell Healing Powder' }))
    const prompt = screen.getByRole('alertdialog', { name: 'Sell Healing Powder' })
    expect(prompt).toHaveTextContent('Sell 1 Healing Powder for 16 Stone?')
    expect(prompt).toHaveTextContent('Review this valuable item carefully. Selling is final.')
    await userEvent.clear(within(prompt).getByLabelText('Quantity'))
    await userEvent.type(within(prompt).getByLabelText('Quantity'), '2')
    expect(prompt).toHaveTextContent('Sell 2 Healing Powder for 32 Stone?')
    await userEvent.click(within(prompt).getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('Sale complete.')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/sell')).toEqual({
      inventoryId: 'bag1',
      count: 2,
    })
  })

  it('sells everything only after the Sell all prompt', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/open': () => json(shop),
      'POST /api/game/shop/sell-all': () => json({ character }),
    })
    renderShop()
    await userEvent.click(await screen.findByRole('tab', { name: 'Sell' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sell all' }))
    const prompt = screen.getByRole('alertdialog', { name: 'Sell all' })
    expect(prompt).toHaveTextContent('Sell all 1 items for 32 Stone? Selling is final.')
    expect(requestBody(fetch, 'POST /api/game/shop/sell-all')).toBeUndefined()
    await userEvent.click(within(prompt).getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('Sale complete.')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/sell-all')).toEqual({ inventoryIds: ['bag1'] })
  })

  it('confirms the complete buy-all price before posting', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/open': () => json(shop),
      'POST /api/game/shop/buy-all': () => json({ character }),
    })
    renderShop()
    await userEvent.click(await screen.findByRole('button', { name: 'Buy all' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Buy all 1 items for 38 Stone?')
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('Purchase successful!')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/buy-all')).toEqual({ shopType: 1 })
  })

  it('uses the selected Gift Coupon currency for a paid restock', async () => {
    const view = {
      ...shop,
      tabs: shop.tabs.map((tab) => ({
        ...tab,
        freeRestocks: 0,
        restockCosts: { gold: 8, giftCoupon: 8 },
      })),
    }
    const fetch = mockApi({
      'GET /api/game/shop/open': () => json(view),
      'POST /api/game/shop/refresh': () => json({ character }),
    })
    renderShop({ initialTab: 2 })
    await userEvent.click(await screen.findByRole('button', { name: 'Restock' }))
    const prompt = screen.getByRole('alertdialog')
    expect(prompt).toHaveTextContent('Restock for 8 Gold, 8 Gift Coupons?')
    await userEvent.selectOptions(within(prompt).getByLabelText('Pay with'), 'giftCoupon')
    await userEvent.click(within(prompt).getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('Shop restocked.')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/refresh')).toEqual({
      shopType: 2,
      mode: 'instant',
      currency: 'giftCoupon',
    })
  })

  it('posts a countdown restock when the server expiry is reached', async () => {
    let expired = true
    const fetch = mockApi({
      'GET /api/game/shop/open': () =>
        json({
          ...shop,
          tabs: shop.tabs.map((tab) => ({
            ...tab,
            refreshAt: new Date(Date.now() + (expired ? -1000 : 1800000)).toISOString(),
          })),
        }),
      'POST /api/game/shop/refresh': () => {
        expired = false
        return json({ character })
      },
    })
    renderShop()
    await screen.findByText(/Restock in 00:(29|30):/)
    expect(requestBody(fetch, 'POST /api/game/shop/refresh')).toEqual({
      shopType: 1,
      mode: 'countdown',
      currency: 'stone',
    })
  })

  it('refills using Gift Coupons and supports fill amounts', async () => {
    const fetch = mockApi({ 'POST /api/game/shop/pouches/refill': () => json({ character }) })
    renderWithProviders(<PouchRefillDialog character={character} onClose={vi.fn()} />)
    await userEvent.selectOptions(screen.getByLabelText('Pay with'), 'giftCoupon')
    await userEvent.click(screen.getByRole('button', { name: 'Fill both' }))
    await userEvent.click(screen.getByRole('button', { name: 'Refill pouches' }))
    expect(await screen.findByText('Pouches refilled.')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/pouches/refill')).toEqual({
      currency: 'giftCoupon',
      hp: -1,
      mp: -1,
    })
  })
})

describe('Mysterious Merchant (Reborn Festival Shop cards)', () => {
  it('shows the price, (purchased/limit), binding and Sold Out', async () => {
    mockApi({
      'GET /api/game/shop/merchant': () =>
        json(merchant({ stock: [{ ...merchantItem, limit: 1, purchased: 1 }] })),
    })
    renderMerchant()
    const card = within(await screen.findByRole('list', { name: 'Merchant stock' })).getByRole(
      'listitem',
    )
    expect(card).toHaveClass('h-[190px]', 'w-[105px]')
    expect(card).toHaveTextContent('40 Gold (1/1)')
    expect(card).toHaveTextContent('Bound')
    const buy = within(card).getByRole('button', { name: 'Buy Healing Powder' })
    expect(buy).toHaveTextContent('Sold Out')
    expect(buy).toBeDisabled()
    expect(screen.getByRole('group', { name: 'Balance' })).toHaveTextContent('200 Gold')
  })

  it('marks an item above your level and keeps it closed', async () => {
    mockApi({
      'GET /api/game/shop/merchant': () =>
        json(merchant({ stock: [{ ...merchantItem, useLevel: 30 }] })),
    })
    renderMerchant()
    expect(await screen.findByText('Lv 30')).toHaveClass('text-[#c00]')
    expect(screen.getByRole('button', { name: 'Buy Healing Powder' })).toBeDisabled()
  })

  it('shows an unavailable merchant and closes through the skin button', async () => {
    const close = vi.fn()
    mockApi({ 'GET /api/game/shop/merchant': () => json({ available: false }) })
    renderWithProviders(<MerchantWindow character={character} onClose={close} />)
    expect(await screen.findByText(/The merchant is away/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('confirms a quantity and posts the spawn and stock slot', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/merchant': () => json(merchant()),
      'POST /api/game/shop/merchant/buy': () => json({ character }),
    })
    renderMerchant()
    await userEvent.click(await screen.findByRole('button', { name: 'Buy Healing Powder' }))
    const prompt = screen.getByRole('alertdialog', { name: 'Buy Healing Powder' })
    await userEvent.clear(within(prompt).getByLabelText('Quantity'))
    await userEvent.type(within(prompt).getByLabelText('Quantity'), '2')
    expect(prompt).toHaveTextContent('Cost: 80 Gold')
    await userEvent.click(within(prompt).getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('Purchase successful!')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/merchant/buy')).toEqual({
      spawnId: 'spawn1',
      tab: 'gold',
      slot: 0,
      count: 2,
    })
  })

  it('lets a VIP buy from the VIP tab, which has no stock limit', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/merchant': () =>
        json(
          merchant({
            vipAvailable: true,
            stock: [],
            vipStock: [{ ...merchantItem, price: 35, left: null }],
          }),
        ),
      'POST /api/game/shop/merchant/buy': () => json({ character }),
    })
    renderMerchant()
    await userEvent.click(await screen.findByRole('tab', { name: 'VIP' }))
    expect(screen.queryByText('VIP membership is required.')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Buy Healing Powder' }))
    await userEvent.clear(screen.getByLabelText('Quantity'))
    await userEvent.type(screen.getByLabelText('Quantity'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('Purchase successful!')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/merchant/buy')).toEqual({
      spawnId: 'spawn1',
      tab: 'vip',
      slot: 0,
      count: 2,
    })
  })
})
