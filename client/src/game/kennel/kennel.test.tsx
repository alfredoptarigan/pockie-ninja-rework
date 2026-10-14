import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { KennelShopWindow, PetTracingWindow } from './index'

const tracing = {
  boardId: 'c47761b3-81bf-4bac-9da3-971c9b1bca9d',
  cells: [null, 'N', null, null, null, null, null, null, null],
  attemptsLeft: 10,
  canBuy: true,
  feathers: 0,
}
const offer = (itemId: string, extra: object = {}) => ({
  itemId,
  nameKey: itemId,
  price: 1,
  level: 8,
  dailyLimit: 20,
  purchased: 0,
  ...extra,
})
const shop = (offers = [offer('a')], extra: object = {}) => ({
  level: 8,
  feathers: 2,
  offers,
  ...extra,
})

describe('Pet Tracing', () => {
  it('lays out the board and the scoreboard, and flips a card of the current board', async () => {
    const flip = vi.fn(() =>
      json({
        ...tracing,
        attemptsLeft: 9,
        cells: ['E', 'N', null, null, null, null, null, null, null],
        feathers: 1,
        reward: { feathers: 1, petItem: null },
      }),
    )
    const fetchMock = mockApi({
      'GET /api/game/kennel/tracing': () => json(tracing),
      'POST /api/game/kennel/tracing/flip': flip,
    })
    renderWithProviders(<PetTracingWindow onClose={vi.fn()} />)
    const board = await screen.findByRole('list', { name: 'Pet Tracing board' })
    expect(within(board).getAllByRole('listitem')).toHaveLength(9)
    const scoreboard = screen.getByRole('region', { name: 'Scoreboard' })
    expect(scoreboard).toHaveTextContent('Remaining10')
    expect(screen.getByRole('button', { name: 'Cell 2: North' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cell 1: hidden' }))
    expect(await screen.findByRole('status')).toHaveTextContent('You received 1 Feather.')
    expect(flip).toHaveBeenCalledOnce()
    expect(requestBody(fetchMock, 'POST /api/game/kennel/tracing/flip')).toEqual({
      boardId: tracing.boardId,
      cell: 0,
    })
    expect(screen.getByRole('button', { name: 'Cell 1: East' })).toBeDisabled()
    expect(scoreboard).toHaveTextContent('Remaining9')
  })

  it('disables exhausted attempts and an unavailable purchase', async () => {
    mockApi({
      'GET /api/game/kennel/tracing': () => json({ ...tracing, attemptsLeft: 0, canBuy: false }),
    })
    renderWithProviders(<PetTracingWindow onClose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Cell 1: hidden' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Purchase More' })).toBeDisabled()
  })

  it('purchases 10 more attempts for Gold after choosing the payment', async () => {
    const fetchMock = mockApi({
      'GET /api/game/kennel/tracing': () => json({ ...tracing, attemptsLeft: 0 }),
      'POST /api/game/kennel/tracing/buy': () => json({ ...tracing, canBuy: false }),
    })
    renderWithProviders(<PetTracingWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Purchase More' }))
    const payment = screen.getByRole('menu', { name: 'Choose payment:' })
    await userEvent.click(within(payment).getByRole('menuitem', { name: '10 Gold' }))
    const confirm = screen.getByRole('alertdialog')
    expect(confirm).toHaveTextContent('Purchase 10 more attempts for 10 Gold?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetchMock, 'POST /api/game/kennel/tracing/buy')).toEqual({
      currency: 'gold',
    })
    expect(await screen.findByRole('button', { name: 'Purchase More' })).toBeDisabled()
  })

  it('shows full bag refusals without reporting a reward', async () => {
    mockApi({
      'GET /api/game/kennel/tracing': () => json(tracing),
      'POST /api/game/kennel/tracing/flip': () => apiError(400, 'bag_full', 'Your bag is full.'),
    })
    renderWithProviders(<PetTracingWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cell 1: hidden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your bag is full.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Pet Shop', () => {
  it('shows the balance, 8 cards a page and the card states', async () => {
    mockApi({
      'GET /api/game/kennel/shop': () =>
        json(
          shop([
            offer('a'),
            offer('b', { price: 6, level: 23 }),
            offer('c', { price: 6 }),
            offer('d', { price: 100, level: 1, dailyLimit: 1, purchased: 1 }),
            ...['e', 'f', 'g', 'h', 'i'].map((id) => offer(id)),
          ]),
        ),
    })
    renderWithProviders(<KennelShopWindow onClose={vi.fn()} />)
    const grid = await screen.findByRole('list', { name: 'Pet Shop items' })
    expect(within(grid).getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByText('1/2')).toBeVisible()
    expect(screen.getByLabelText('Feathers')).toHaveTextContent('2')
    const card = (id: string) => within(grid).getByRole('listitem', { name: id })
    expect(within(card('a')).getByRole('button', { name: 'Buy' })).toBeEnabled()
    expect(card('a')).toHaveTextContent('0/20')
    expect(card('b')).toHaveTextContent('Lv 23')
    expect(within(card('b')).queryByRole('button', { name: 'Buy' })).toBeNull()
    expect(within(card('c')).getByRole('button', { name: 'Buy' })).toBeDisabled()
    expect(within(card('d')).getByRole('button', { name: 'Sold Out' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1)
  })

  it('confirms the cost and buys the chosen quantity', async () => {
    const fetchMock = mockApi({
      'GET /api/game/kennel/shop': () => json(shop([offer('a')], { feathers: 10 })),
      'POST /api/game/kennel/shop/buy': () =>
        json(shop([offer('a', { purchased: 5 })], { feathers: 5 })),
    })
    renderWithProviders(<KennelShopWindow onClose={vi.fn()} />)
    const card = await screen.findByRole('listitem', { name: 'a' })
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Quantity' }), '5')
    await userEvent.click(within(card).getByRole('button', { name: 'Buy' }))
    const confirm = screen.getByRole('alertdialog')
    expect(confirm).toHaveTextContent('Buy a x5?')
    expect(confirm).toHaveTextContent('Cost: 5 Feathers')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetchMock, 'POST /api/game/kennel/shop/buy')).toEqual({
      itemId: 'a',
      count: 5,
    })
    expect(await within(card).findByText('5/20')).toBeVisible()
  })

  it('shows an empty shop', async () => {
    mockApi({ 'GET /api/game/kennel/shop': () => json(shop([])) })
    renderWithProviders(<KennelShopWindow onClose={vi.fn()} />)
    expect(await screen.findByText('No items available.')).toBeVisible()
  })
})
