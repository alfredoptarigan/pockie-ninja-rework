import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type {
  FestivalOfferView,
  FestivalShopView,
} from '../../../../shared/src/schemas/festival-shop'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { FestivalShopWindow } from './index'

const PATH = '/api/game/festival-shop'
const offer = (index: number, extra: Partial<FestivalOfferView> = {}): FestivalOfferView => ({
  index,
  itemId: 'i120001',
  info: {
    kind: 'use',
    equipSlot: null,
    level: 21,
    sellPrice: null,
    stack: 20,
    w: 1,
    h: 1,
    class: 'FoodItem',
  },
  amount: 10,
  cost: 5,
  limit: 20,
  purchased: 0,
  ...extra,
})
const view: FestivalShopView = {
  tokens: 12,
  offers: [
    ...Array.from({ length: 8 }, (_, i) => offer(i)),
    offer(8, { itemId: 'i150270', amount: 1, cost: 100, limit: 1 }),
  ],
}
const noop = () => {}

describe('FestivalShopWindow', () => {
  it('shows the tokens and eight wares a page, and redeems after the confirm', async () => {
    let tokens = view.tokens
    const fetchMock = mockApi({
      [`GET ${PATH}`]: () => json({ ...view, tokens }),
      [`POST ${PATH}/buy`]: () => {
        tokens = 7
        return json({ shop: { ...view, tokens }, character })
      },
    })
    renderWithProviders(<FestivalShopWindow onClose={noop} />)
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Balance' })).toHaveTextContent('12 Tokens'),
    )
    const wares = screen.getByRole('list', { name: 'Festival wares' })
    expect(within(wares).getAllByRole('listitem')).toHaveLength(8)
    expect(within(wares).getAllByText('(0/20)')).toHaveLength(8)
    await userEvent.click(within(wares).getAllByRole('button', { name: 'Redeem Sushi' })[0]!)
    expect(screen.getByText('Buy Sushi for 5 Tokens?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(requestBody(fetchMock, `POST ${PATH}/buy`)).toEqual({ index: 0 })
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Balance' })).toHaveTextContent('7 Tokens'),
    )
  })

  it('disables wares that are sold out or cost more than the tokens held', async () => {
    mockApi({
      [`GET ${PATH}`]: () =>
        json({ ...view, offers: [offer(0, { purchased: 20 }), view.offers[8]!] }),
    })
    renderWithProviders(<FestivalShopWindow onClose={noop} />)
    const soldOut = await screen.findByRole('button', { name: 'Redeem Sushi' })
    expect(soldOut).toHaveTextContent('Sold Out')
    expect(soldOut).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redeem 3 Day VIP' })).toBeDisabled()
  })
})
