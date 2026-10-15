import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { itemName } from '../explore'
import { ToastHost } from '../toast'
import { MarketWindow } from './index'
import { taxOf, timeLeft } from './parts'
import { ago } from './SalesTabs'
import { itemNameKey } from '../world'

const ninja = { ...character, level: 30, stone: 5_000, gold: 20 }
const FOOD = 'i120001'
const BLADE = 'i250101'
const foodInfo = {
  kind: 'use',
  equipSlot: null,
  level: 1,
  sellPrice: 1,
  stack: 20,
  w: 1,
  h: 1,
  class: 'FoodItem',
}
const bladeInfo = { ...foodInfo, kind: 'equip', equipSlot: 'Weapon', level: 20, w: 2, h: 3 }
const item = {
  inventoryId: 'inv1',
  itemId: FOOD,
  count: 5,
  bound: false,
  enhanceLevel: 0,
  identifyCount: 0,
  props: [],
  info: foodInfo,
}
const HOUR = 3600_000
const listing = (id: number, extra: object = {}) => ({
  ...item,
  id: `00000000-0000-4000-8000-00000000000${id}`,
  sellerName: 'Seller',
  priceStone: 100,
  priceGold: null,
  expiresAt: new Date(Date.now() + 3 * HOUR + 150_000).toISOString(),
  mine: false,
  ...extra,
})
const cheap = listing(1, { priceStone: 80, count: 3 })
const dear = listing(2, { priceStone: 120 })
const mineListing = listing(3, { priceStone: 90, mine: true })
const blade = listing(4, {
  itemId: BLADE,
  info: bladeInfo,
  count: 1,
  priceStone: null,
  priceGold: 7,
})
const board = { listings: [dear, cheap, mineListing, blade] }
const mine = {
  listings: [{ ...mineListing, hours: 8, fee: 150, expired: false }],
  maxListings: 5,
  fees: { '8': 150, '12': 225, '24': 450 },
  sellable: [{ ...item, inventoryId: 'bag1', count: 3, category: '1_0_2' }],
}
const bagItem = (id: string, extra: object) => ({
  id,
  itemId: FOOD,
  count: 1,
  bound: false,
  equippedSlot: null,
  nameKey: itemNameKey(FOOD),
  page: 0,
  slot: 0,
  locked: false,
  info: foodInfo,
  ...extra,
})
const bag = [bagItem('bag1', { count: 3 }), bagItem('bag2', { slot: 1, locked: true })]
const sale = (id: number, extra: object) => ({
  id: `sale${id}`,
  itemId: FOOD,
  count: 2,
  stone: 200,
  gold: 0,
  taxStone: 20,
  taxGold: 0,
  at: new Date(Date.now() - 2 * HOUR - 60_000).toISOString(),
  info: foodInfo,
  ...extra,
})
const warehouse = {
  items: [{ ...item, source: 0, createdAt: new Date().toISOString() }],
  capacity: 15,
  wallet: { stone: 90, gold: 0 },
}
const FOOD_NAME = itemName(FOOD)
/** A warehouse tile is a button that claims the row. */
const CLAIM_TILE = new RegExp(`^Claim ${FOOD_NAME}`)
const base = {
  'GET /api/game/market/board': () => json(board),
  'GET /api/game/market/mine': () => json(mine),
  'GET /api/game/market/warehouse': () => json(warehouse),
  'GET /api/game/market/recent': () =>
    json({ sales: [sale(1, { count: 1, stone: 50, taxStone: 5 }), sale(2, {})] }),
  'GET /api/game/market/history': () =>
    json({ sales: [sale(3, {})], purchases: [sale(4, { stone: 0, gold: 9, taxStone: 0 })] }),
  'GET /api/game/inventory': () => json({ items: bag }),
}

function renderMarket(routes = {}) {
  const fetch = mockApi({ ...base, ...routes })
  renderWithProviders(
    <>
      <MarketWindow character={ninja} onClose={vi.fn()} />
      <ToastHost />
    </>,
  )
  return fetch
}

afterEach(() => vi.unstubAllGlobals())

describe('Market Board window', () => {
  it('shows a notice below level 25', () => {
    mockApi({})
    renderWithProviders(<MarketWindow character={{ ...character, level: 24 }} onClose={vi.fn()} />)
    expect(screen.getByText('The Market opens at level 25.')).toBeVisible()
  })

  it("has Reborn's tabs in a 680px window", () => {
    renderMarket()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Market',
      'Sell Items',
      'Recent',
      'History',
      'Storage',
    ])
    expect(screen.getByRole('tabpanel')).toHaveClass('w-[676px]', 'h-[328px]')
  })

  it('groups listings by item with the count, lowest and average price', async () => {
    renderMarket()
    await screen.findByRole('button', { name: `View ${FOOD_NAME}` })
    const table = screen.getByRole('table', { name: 'Listings' })
    const rows = within(table).getAllByRole('row')
    // The header, then the cheapest group first: the food (Stones) before the blade (Gold).
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveTextContent(FOOD_NAME)
    expect(rows[1]).toHaveTextContent(/3\s*80\s*97/) // 3 listings, lowest 80, avg 97
    expect(rows[2]).toHaveTextContent(itemName(BLADE))

    await userEvent.selectOptions(screen.getByLabelText('Item type'), 'weapon')
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    await userEvent.selectOptions(screen.getByLabelText('Item type'), 'all')
    await userEvent.selectOptions(screen.getByLabelText('Level'), '1') // Lv. 11-20
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(itemName(BLADE))
    await userEvent.selectOptions(screen.getByLabelText('Level'), 'all')
    await userEvent.type(screen.getByLabelText('Search'), 'zzz-nothing')
    expect(screen.getByText('No items for sale.')).toBeVisible()
  })

  it('opens a group and buys part of a listing in Confirm Purchase', async () => {
    const fetch = renderMarket({
      'POST /api/game/market/buy': () => json({ character: ninja }),
    })
    await userEvent.click(await screen.findByRole('button', { name: `View ${FOOD_NAME}` }))
    expect(screen.getByText(/3 Listings · Lowest:/)).toBeVisible()
    const table = screen.getByRole('table', { name: `${FOOD_NAME} listings` })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('80')
    expect(within(rows[0]!).getByText('03:02')).toBeVisible()
    expect(within(rows[1]!).getByRole('button', { name: 'Yours' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Buy Cheapest' }))
    const prompt = screen.getByRole('dialog', { name: 'Confirm Purchase' })
    await userEvent.tripleClick(within(prompt).getByLabelText(/Amount/))
    await userEvent.keyboard('2')
    expect(prompt).toHaveTextContent(/Total: 160/)
    await userEvent.click(within(prompt).getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText(/Claim it in Storage/)).toHaveAttribute('role', 'status')
    expect(requestBody(fetch, 'POST /api/game/market/buy')).toEqual({
      listingId: cheap.id,
      count: 2,
    })
  })

  it('reports a refused purchase as a failure toast', async () => {
    renderMarket({
      'POST /api/game/market/buy': () =>
        apiError(404, 'listing_gone', 'That listing is no longer available.'),
    })
    await userEvent.click(await screen.findByRole('button', { name: `View ${FOOD_NAME}` }))
    await userEvent.click(screen.getByRole('button', { name: 'Buy Cheapest' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer available')
  })

  it('refuses an amount the balance cannot pay for', async () => {
    renderMarket()
    await userEvent.click(await screen.findByRole('button', { name: `View ${itemName(BLADE)}` }))
    await userEvent.click(screen.getByRole('button', { name: 'Buy Cheapest' }))
    const prompt = screen.getByRole('dialog', { name: 'Confirm Purchase' })
    expect(within(prompt).getByRole('button', { name: 'Confirm' })).toBeEnabled()
    await userEvent.tripleClick(within(prompt).getByLabelText(/Amount/))
    await userEvent.keyboard('3') // 21 Gold, more than the stack and the 20 Gold carried
    expect(within(prompt).getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })
})

describe('Sell Items tab', () => {
  it('lists own listings and cancels one into Storage', async () => {
    const fetch = renderMarket({
      'POST /api/game/market/cancel': () => json({ character: ninja }),
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Sell Items' }))
    expect(await screen.findByText('Listings: 1/5')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: `Cancel ${FOOD_NAME}` }))
    expect(await screen.findByText(/The item is in your Storage/)).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/market/cancel')).toEqual({
      listingId: mineListing.id,
    })
  })

  it('picks a bag item and lists it in Gold for 24 hours', async () => {
    const fetch = renderMarket({
      'POST /api/game/market/list': () => json({ character: ninja }),
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Sell Items' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Select an item to sell' }))
    const picker = screen.getByRole('dialog', { name: 'Select an Item' })
    // The locked one is greyed out.
    expect(await within(picker).findByRole('button', { name: FOOD_NAME })).toBeDisabled()
    await userEvent.click(within(picker).getByRole('button', { name: `${FOOD_NAME} x3` }))

    const sell = screen.getByRole('dialog', { name: 'Sell Item' })
    await userEvent.selectOptions(within(sell).getByLabelText('Currency'), 'gold')
    await userEvent.tripleClick(within(sell).getByLabelText('Unit Price'))
    await userEvent.keyboard('40')
    await userEvent.tripleClick(within(sell).getByLabelText('Quantity'))
    await userEvent.keyboard('2')
    await userEvent.selectOptions(within(sell).getByLabelText('Duration'), '24')
    expect(sell).toHaveTextContent(/Total:\s*80/)
    expect(sell).toHaveTextContent(/Tax \(10%\):\s*-8/)
    expect(sell).toHaveTextContent(/You receive:\s*72/)
    expect(sell).toHaveTextContent(/Listing fee:\s*450/)
    await userEvent.click(within(sell).getByRole('button', { name: 'Sell' }))
    expect(await screen.findByText(/is on the Market/)).toBeVisible()
    expect(requestBody(fetch, 'POST /api/game/market/list')).toEqual({
      inventoryId: 'bag1',
      count: 2,
      priceStone: null,
      priceGold: 40,
      hours: 24,
    })
  })
})

describe('Recent and History tabs', () => {
  it('shows the last sales with unit and average prices', async () => {
    renderMarket()
    await userEvent.click(screen.getByRole('tab', { name: 'Recent' }))
    await screen.findAllByText('2h ago')
    const table = screen.getByRole('table', { name: 'Recent sales' })
    expect(screen.getByText('Last 50 Sales')).toBeVisible()
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('2h ago')
    // Unit 50 against an average of 250 / 3 = 83, total 50.
    expect(rows[1]).toHaveTextContent(/50\s*83\s*50/)
  })

  it('shows my sales with the tax, then my purchases', async () => {
    renderMarket()
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(await screen.findByText(/Sold:/)).toHaveTextContent(
      'Sold: 200 | Tax: 20 | Received: 180',
    )
    const sales = screen.getByRole('table', { name: 'My sales' })
    expect(within(sales).getAllByRole('row')[1]).toHaveTextContent(/-20\s*180/)
    await userEvent.click(screen.getByRole('button', { name: 'My Purchases' }))
    expect(screen.getByText(/Total Spent:/)).toHaveTextContent('Total Spent: 9')
    expect(screen.getByRole('table', { name: 'My purchases' })).toHaveTextContent(FOOD_NAME)
  })
})

describe('Storage tab (the 2011 warehouse)', () => {
  it('draws one 10-per-row tile per warehouse row', async () => {
    renderMarket()
    await userEvent.click(screen.getByRole('tab', { name: 'Storage' }))
    const storage = await screen.findByRole('region', { name: 'Warehouse' })
    expect(storage).toHaveClass('w-[290px]')
    const tiles = within(storage).getByRole('list', { name: 'Warehouse tiles' })
    expect(within(tiles).getAllByRole('listitem')).toHaveLength(warehouse.capacity)
    expect(storage).toHaveTextContent('1 / 15')
  })

  it('claims a tile and withdraws the Vault', async () => {
    const fetch = renderMarket({
      'POST /api/game/market/warehouse/claim': () =>
        json({ character: ninja, claimed: 1, left: 0 }),
      'POST /api/game/market/wallet/claim': () => json({ character: ninja }),
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Storage' }))
    const tile = await screen.findByRole('button', { name: CLAIM_TILE })
    expect(tile).toHaveAttribute('title', expect.stringContaining('Bought'))
    await userEvent.click(tile)
    expect(await screen.findByText('Item claimed.')).toHaveAttribute('role', 'status')
    expect(requestBody(fetch, 'POST /api/game/market/warehouse/claim')).toEqual({
      inventoryId: 'inv1',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Vault' }))
    const vault = screen.getByRole('dialog', { name: 'Vault' })
    expect(within(vault).getByRole('row', { name: /Stones/ })).toHaveTextContent('90')
    await userEvent.click(within(vault).getByRole('button', { name: 'Withdraw' }))
    expect(await screen.findByText('Wallet claimed.')).toBeVisible()
  })
})

describe('Market helpers', () => {
  it('formats the time left and the age of a sale', () => {
    const now = Date.parse('2026-10-13T00:00:00Z')
    expect(timeLeft('2026-10-13T01:05:30Z', now)).toBe('01:05')
    expect(timeLeft('2026-10-12T23:00:00Z', now)).toBe('Expired')
    expect(ago('2026-10-12T23:59:30Z', now)).toBe('Just now')
    expect(ago('2026-10-12T23:50:00Z', now)).toBe('10m ago')
    expect(ago('2026-10-11T00:00:00Z', now)).toBe('2d ago')
  })

  it('takes the 10% tax as the server does (the seller keeps at least 1)', () => {
    expect(taxOf(80)).toBe(8)
    expect(taxOf(15)).toBe(2)
    expect(taxOf(1)).toBe(0)
  })
})
