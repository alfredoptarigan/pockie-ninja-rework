import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TradeState, TradeView } from '../../../../shared/src/schemas/trade'
import { character, fists, potion } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { TradeLayer } from './TradeLayer'

const me = { ...character, level: 30, stone: 5_000 }
const BO = { characterId: '00000000-0000-4000-8000-000000000002', name: 'Bo', level: 31 }
const ME = { characterId: me.id, name: me.name, level: 30 }
const request = {
  id: '00000000-0000-4000-8000-0000000000aa',
  from: BO,
  to: ME,
  expiresAt: new Date(Date.now() + 50_000).toISOString(),
}
const blade = {
  inventoryId: '00000000-0000-4000-8000-0000000000b1',
  itemId: potion.itemId,
  count: 2,
  bound: false,
  enhanceLevel: 0,
  identifyCount: 0,
  props: [],
  info: potion.info!,
}
const side = (player: typeof ME, extra: Partial<TradeView['me']> = {}): TradeView['me'] => ({
  ...player,
  items: [],
  currency: { stone: 0, gold: 0, giftCoupon: 0 },
  ready: false,
  confirmed: false,
  ...extra,
})
const trade = (extra: Partial<TradeView> = {}): TradeView => ({
  id: '00000000-0000-4000-8000-0000000000cc',
  version: 4,
  me: side(ME),
  partner: side(BO, { items: [blade], currency: { stone: 1_000, gold: 0, giftCoupon: 0 } }),
  ...extra,
})
const state = (extra: Partial<TradeState>): TradeState => ({
  trade: null,
  incoming: [],
  outgoing: null,
  ...extra,
})

function renderLayer(current: TradeState, level = me.level) {
  const fetch = mockApi({
    'GET /api/game/trade': () => json(current),
    'POST /api/game/trade/accept': () => json(state({ trade: trade() })),
    'POST /api/game/trade/ready': () => json(current),
    'POST /api/game/trade/confirm': () => json(current),
    'POST /api/game/trade/items/add': () => json(current),
    'POST /api/game/trade/currency': () => json(current),
    'POST /api/game/trade/cancel': () => json(state({})),
    'GET /api/game/inventory': () => json({ items: [potion, { ...fists, equippedSlot: null }] }),
    'GET /api/game/forge/gear': () => json({ gear: {} }),
  })
  renderWithProviders(<TradeLayer character={{ ...me, level }} />)
  return fetch
}

afterEach(() => vi.restoreAllMocks())

describe('trade requests', () => {
  it('asks me with See Trade, which opens the trade', async () => {
    const fetch = renderLayer(state({ incoming: [request] }))
    const popup = await screen.findByRole('alertdialog', { name: 'Trade request' })
    expect(popup).toHaveTextContent('Bo wants to trade')
    await userEvent.click(within(popup).getByRole('button', { name: 'See Trade' }))
    expect(requestBody(fetch, 'POST /api/game/trade/accept')).toEqual({ requestId: request.id })
    expect(await screen.findByRole('dialog', { name: 'Trade with Bo' })).toBeVisible()
  })

  it('refuses See Trade under level 30', async () => {
    renderLayer(state({ incoming: [request] }), 29)
    const popup = await screen.findByRole('alertdialog', { name: 'Trade request' })
    expect(popup).toHaveTextContent('Both players must be at least level 30 to trade.')
    expect(within(popup).getByRole('button', { name: 'See Trade' })).toBeDisabled()
  })

  it('shows my waiting request with Cancel', async () => {
    renderLayer(state({ outgoing: { ...request, from: ME, to: BO } }))
    const popup = await screen.findByRole('alertdialog', { name: 'Trade request' })
    expect(popup).toHaveTextContent('Waiting for Bo...')
    expect(within(popup).getByRole('button', { name: 'Cancel' })).toBeVisible()
  })
})

describe('the Trade window', () => {
  it("shows the partner's offer, the fee and readies on the version I saw", async () => {
    const fetch = renderLayer(state({ trade: trade() }))
    const window = await screen.findByRole('dialog', { name: 'Trade with Bo' })
    expect(within(window).getByRole('img', { name: 'Healing Powder x2' })).toBeVisible()
    expect(within(window).getByLabelText('Partner Stones')).toHaveTextContent('1,000')
    expect(window).toHaveTextContent('You receive 900 Stones (−10% fee)')
    await userEvent.click(within(window).getByRole('button', { name: 'Ready for Trade' }))
    expect(requestBody(fetch, 'POST /api/game/trade/ready')).toEqual({ ready: true, version: 4 })
  })

  it('confirms once both are ready and then waits for the partner', async () => {
    const both = trade({ me: side(ME, { ready: true }), partner: side(BO, { ready: true }) })
    const fetch = renderLayer(state({ trade: both }))
    const window = await screen.findByRole('dialog', { name: 'Trade with Bo' })
    expect(within(window).getAllByText('Ready Check')).toHaveLength(2)
    await userEvent.click(within(window).getByRole('button', { name: 'Confirm Trade' }))
    expect(requestBody(fetch, 'POST /api/game/trade/confirm')).toEqual({ version: 4 })
  })

  it('shows Waiting for partner... after my confirmation', async () => {
    const mine = trade({
      me: side(ME, { ready: true, confirmed: true }),
      partner: side(BO, { ready: true }),
    })
    renderLayer(state({ trade: mine }))
    const window = await screen.findByRole('dialog', { name: 'Trade with Bo' })
    expect(within(window).getByRole('button', { name: 'Waiting for partner...' })).toBeDisabled()
  })

  it('offers a bag item from the picker; bound items are refused', async () => {
    const fetch = renderLayer(state({ trade: trade() }))
    const window = await screen.findByRole('dialog', { name: 'Trade with Bo' })
    await userEvent.click(within(window).getByRole('button', { name: 'Offer an item (slot 1)' }))
    const picker = within(window).getByRole('region', { name: 'Choose an item to offer' })
    expect(within(picker).getByRole('button', { name: /^Offer .*Fists/ })).toBeDisabled()
    await userEvent.click(within(picker).getByRole('button', { name: 'Offer Healing Powder x2' }))
    expect(requestBody(fetch, 'POST /api/game/trade/items/add')).toEqual({
      inventoryId: potion.id,
    })
  })

  it('sets a currency on Enter, clamped to what I own', async () => {
    const fetch = renderLayer(state({ trade: trade() }))
    const window = await screen.findByRole('dialog', { name: 'Trade with Bo' })
    expect(window).toHaveTextContent('(5,000)')
    await userEvent.type(within(window).getByLabelText('Your Stones'), '9999{Enter}')
    expect(requestBody(fetch, 'POST /api/game/trade/currency')).toEqual({
      currency: 'stone',
      amount: 5_000,
    })
  })

  it('reads Level 30 required under level 30, and closing cancels the trade', async () => {
    const fetch = renderLayer(state({ trade: trade() }), 29)
    const window = await screen.findByRole('dialog', { name: 'Trade with Bo' })
    expect(within(window).getByRole('button', { name: 'Level 30 required' })).toBeDisabled()
    await userEvent.click(within(window).getByRole('button', { name: 'Close' }))
    expect(fetch).toHaveBeenCalledWith('/api/game/trade/cancel', expect.anything())
  })
})
