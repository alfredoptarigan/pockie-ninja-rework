import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { searchItemIds } from './api'
import { MarketWindow } from './index'
import { timeLeft } from './parts'

const ninja = { ...character, level: 30, stone: 5_000, gold: 20 }
const item = {
  inventoryId: 'inv1',
  itemId: 'i120001',
  count: 5,
  bound: false,
  enhanceLevel: 0,
  identifyCount: 0,
  props: [],
}
const listing = {
  ...item,
  id: '00000000-0000-4000-8000-000000000001',
  sellerName: 'Seller',
  priceStone: 100,
  priceGold: 2,
  expiresAt: new Date(Date.now() + 3 * 3600_000 + 150_000).toISOString(),
  mine: false,
}
const categories = [
  {
    Name: 1,
    Des: '',
    Path: '1',
    children: [{ Name: 'Common_YaoPin', Des: 'x', Path: '1_0', children: [] }],
  },
]
const browse = { listings: [listing], page: 1, pages: 1, total: 1 }
const mine = {
  listings: [{ ...listing, mine: true, hours: 8, fee: 150, expired: false }],
  maxListings: 5,
  fees: { '8': 150, '12': 225, '24': 450 },
  sellable: [{ ...item, inventoryId: 'bag1', count: 3, category: '1_0_2' }],
}
const warehouse = {
  items: [{ ...item, source: 0, createdAt: new Date().toISOString() }],
  capacity: 15,
  wallet: { stone: 90, gold: 0 },
}
const base = {
  'GET /api/game/market/categories': () => json({ categories }),
  'GET /api/game/market/browse': () => json(browse),
  'GET /api/game/market/mine': () => json(mine),
  'GET /api/game/market/warehouse': () => json(warehouse),
}

describe('Market window', () => {
  it('shows a notice below level 25', () => {
    mockApi({})
    renderWithProviders(<MarketWindow character={{ ...character, level: 24 }} onClose={vi.fn()} />)
    expect(screen.getByText('The Market opens at level 25.')).toBeVisible()
  })

  it('browses a category and buys part of a listing', async () => {
    const fetch = mockApi({
      ...base,
      'POST /api/game/market/buy': () => json({ character: ninja }),
    })
    renderWithProviders(<MarketWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Items' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Medicine' }))
    const lastBrowse = fetch.mock.calls
      .map(([url]) => String(url))
      .filter((u) => u.includes('browse'))
    expect(lastBrowse.at(-1)).toContain('category=1_0')
    const row = (await screen.findAllByRole('listitem')).find((li) =>
      li.textContent?.includes('Seller'),
    )!
    expect(within(row).getByText('03:02')).toBeVisible()
    await userEvent.click(within(row).getByRole('button', { name: /^Buy / }))
    await userEvent.tripleClick(screen.getByLabelText('Quantity'))
    await userEvent.keyboard('2')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }))
    expect(await screen.findByText(/Purchase complete/)).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/market/buy')).toEqual({
      listingId: listing.id,
      count: 2,
    })
  })

  it('shows server errors from a purchase', async () => {
    mockApi({
      ...base,
      'POST /api/game/market/buy': () =>
        apiError(400, 'warehouse_full', 'Your Market warehouse is full. Claim some items first.'),
    })
    renderWithProviders(<MarketWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /^Buy / }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('warehouse is full')
  })

  it('lists a bag item with prices, a duration and the fee preview', async () => {
    const fetch = mockApi({
      ...base,
      'POST /api/game/market/list': () => json({ character: ninja }),
    })
    renderWithProviders(<MarketWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Sell' }))
    await userEvent.click(await screen.findByRole('button', { pressed: false }))
    await userEvent.click(screen.getByLabelText('Gold'))
    // An emptied price snaps back to 1, so replace the selected value.
    await userEvent.tripleClick(screen.getByLabelText('Gold per unit'))
    await userEvent.keyboard('4')
    await userEvent.click(screen.getByLabelText('24 hours'))
    expect(screen.getByText(/Listing fee/)).toHaveTextContent('450')
    await userEvent.click(screen.getByRole('button', { name: 'List item' }))
    expect(await screen.findByText(/is on the Market/)).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/market/list')).toEqual({
      inventoryId: 'bag1',
      count: 3,
      priceStone: 100,
      priceGold: 4,
      hours: 24,
    })
  })

  it('takes a listing down and claims the warehouse and the wallet', async () => {
    const fetch = mockApi({
      ...base,
      'POST /api/game/market/cancel': () => json({ character: ninja }),
      'POST /api/game/market/warehouse/claim': () =>
        json({ character: ninja, claimed: 1, left: 0 }),
      'POST /api/game/market/wallet/claim': () => json({ character: ninja }),
    })
    renderWithProviders(<MarketWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: 'My Listings' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Take down/ }))
    expect(await screen.findByText(/Listing taken down/)).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/market/cancel')).toEqual({ listingId: listing.id })

    await userEvent.click(screen.getByRole('tab', { name: 'Warehouse' }))
    expect(await screen.findByText('Bought')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Claim all' }))
    expect(await screen.findByText('Claimed 1.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Claim wallet' }))
    expect(await screen.findByText('Wallet claimed.')).toBeVisible()
  })
})

describe('Market helpers', () => {
  it('turns a name search into item ids and refuses vague searches', () => {
    expect(searchItemIds('')).toEqual([])
    expect(searchItemIds('zzzz-no-such-item')).toEqual([])
    const ids = searchItemIds('Dogsmasher')
    expect(ids).toContain('i250101')
    // Items only the Market knows by name (food, materials) are found too.
    expect(searchItemIds('Strawberry')).toContain('i120010')
  })
  it('formats the time left', () => {
    const now = Date.parse('2026-10-13T00:00:00Z')
    expect(timeLeft('2026-10-13T01:05:30Z', now)).toBe('01:05')
    expect(timeLeft('2026-10-12T23:00:00Z', now)).toBe('Expired')
  })
})
