import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { MerchantWindow, PouchRefillDialog, ShopWindow } from './index'

export const shop = {
  tabs: [1, 3, 2].map((shopType) => ({
    shopType,
    stock: [
      {
        slot: 0,
        itemId: 'i160006',
        priceStone: 38,
        priceGold: 0,
        priceGiftCoupon: 0,
        bound: true,
        appraised: false,
        identifyCount: 0,
      },
    ],
    refreshAt: new Date(Date.now() + 1800000).toISOString(),
    freeRestocks: 1,
    restockCosts: { stone: 50 },
  })),
  wholesale: { boxId: 1001, stock: [{ itemId: 'i160006', priceStone: 38, maxStack: 100 }] },
  sellable: [{ inventoryId: 'bag1', itemId: 'i160006', count: 2, price: 16, confirm: true }],
}

describe('shop windows', () => {
  it('shows four tabs, countdown and confirms a Wholesale quantity purchase', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/open': () => json(shop),
      'POST /api/game/shop/wholesale/buy': () => json({ character }),
    })
    renderWithProviders(<ShopWindow character={character} onClose={vi.fn()} />)
    await screen.findByRole('tab', { name: 'Wholesale' })
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.getByText(/Restock in/)).toBeVisible()
    await userEvent.click(screen.getByRole('tab', { name: 'Wholesale' }))
    await userEvent.click(screen.getByRole('button', { name: 'Buy Healing Powder' }))
    await userEvent.clear(screen.getByLabelText('Quantity'))
    await userEvent.type(screen.getByLabelText('Quantity'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }))
    expect(await screen.findByText('Purchase complete.')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/wholesale/buy')).toEqual({
      itemId: 'i160006',
      count: 2,
    })
  })

  it('keeps failed purchases visible and reports server errors', async () => {
    mockApi({
      'GET /api/game/shop/open': () => json(shop),
      'POST /api/game/shop/buy': () => apiError(400, 'money', 'Not enough Stone.'),
    })
    renderWithProviders(<ShopWindow character={character} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Buy Healing Powder' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough Stone.')
  })

  it('lists the items and proceeds only after sell-all confirmation', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/open': () => json(shop),
      'POST /api/game/shop/sell-all': () => json({ character }),
    })
    renderWithProviders(<ShopWindow character={character} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sell all' }))
    expect(screen.getByText('Selling is final.')).toBeVisible()
    expect(screen.getByText('Healing Powder x2 — 32 Stone')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/sell-all')).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm sale' }))
    expect(await screen.findByText('Sale complete.')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/sell-all')).toEqual({ inventoryIds: ['bag1'] })
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

  it('shows merchant stock, binding and purchase limits', async () => {
    mockApi({
      'GET /api/game/shop/merchant': () =>
        json({
          available: true,
          spawnId: 'spawn1',
          sceneId: 2601,
          endsAt: new Date(Date.now() + 600000).toISOString(),
          vipAvailable: false,
          stock: [
            {
              slot: 0,
              itemId: 'i160006',
              price: 40,
              bound: true,
              left: 2,
              maxCount: 2,
              limit: 1,
              purchased: 1,
              useLevel: 1,
            },
          ],
          vipStock: [],
        }),
    })
    renderWithProviders(<MerchantWindow character={character} onClose={vi.fn()} />)
    expect(await screen.findByText('Stock: 2; your remaining limit: 0')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buy Healing Powder' })).toBeDisabled()
    expect(screen.getByText('Bound')).toBeVisible()
  })

  it('confirms the complete buy-all price before posting', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/open': () => json(shop),
      'POST /api/game/shop/buy-all': () => json({ character }),
    })
    renderWithProviders(<ShopWindow character={character} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Buy all' }))
    expect(screen.getByText('Buy all 1 items for 38 Stone?')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('Purchase complete.')).toBeVisible()
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
    renderWithProviders(<ShopWindow character={character} initialTab={2} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Restock now' }))
    await userEvent.selectOptions(screen.getByLabelText('Pay with'), 'giftCoupon')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
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
    renderWithProviders(<ShopWindow character={character} onClose={vi.fn()} />)
    await screen.findByText(/Restock in 00:(29|30):/)
    expect(requestBody(fetch, 'POST /api/game/shop/refresh')).toEqual({
      shopType: 1,
      mode: 'countdown',
      currency: 'stone',
    })
  })

  it('shows an unavailable merchant and closes through the skin button', async () => {
    const close = vi.fn()
    mockApi({ 'GET /api/game/shop/merchant': () => json({ available: false }) })
    renderWithProviders(<MerchantWindow character={character} onClose={close} />)
    expect(await screen.findByText(/The merchant is away/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('merchant purchase dialog', () => {
  it('confirms a quantity and posts the spawn and stock slot', async () => {
    const fetch = mockApi({
      'GET /api/game/shop/merchant': () =>
        json({
          available: true,
          spawnId: 'spawn1',
          sceneId: 2601,
          endsAt: new Date(Date.now() + 600000).toISOString(),
          vipAvailable: false,
          stock: [
            {
              slot: 0,
              itemId: 'i160006',
              price: 40,
              bound: true,
              left: 2,
              maxCount: 2,
              limit: 2,
              purchased: 0,
              useLevel: 1,
            },
          ],
          vipStock: [],
        }),
      'POST /api/game/shop/merchant/buy': () => json({ character }),
    })
    renderWithProviders(<MerchantWindow character={character} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Buy Healing Powder' }))
    await userEvent.clear(screen.getByLabelText('Quantity'))
    await userEvent.type(screen.getByLabelText('Quantity'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }))
    expect(await screen.findByText('Purchase complete.')).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/shop/merchant/buy')).toEqual({
      spawnId: 'spawn1',
      tab: 'gold',
      slot: 0,
      count: 2,
    })
  })
})
