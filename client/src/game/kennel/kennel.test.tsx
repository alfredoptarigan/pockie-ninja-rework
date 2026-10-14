import { screen } from '@testing-library/react'
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

describe('Kennel windows', () => {
  it('sends the current board identity and refuses to flip an open cell', async () => {
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
    expect(await screen.findByRole('button', { name: 'Cell 2: North' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cell 1: hidden' }))
    expect(await screen.findByRole('status')).toHaveTextContent('You received 1 Feather.')
    expect(flip).toHaveBeenCalledOnce()
    expect(requestBody(fetchMock, 'POST /api/game/kennel/tracing/flip')).toEqual({
      boardId: tracing.boardId,
      cell: 0,
    })
    expect(screen.getByRole('button', { name: 'Cell 1: East' })).toBeDisabled()
  })

  it('disables exhausted attempts and an unavailable daily refill', async () => {
    mockApi({
      'GET /api/game/kennel/tracing': () => json({ ...tracing, attemptsLeft: 0, canBuy: false }),
    })
    renderWithProviders(<PetTracingWindow onClose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Cell 1: hidden' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Buy 10 attempts (10 Gold)' })).toBeDisabled()
  })

  it('buys the daily refill with Gold and applies the returned attempts', async () => {
    const fetchMock = mockApi({
      'GET /api/game/kennel/tracing': () => json({ ...tracing, attemptsLeft: 0 }),
      'POST /api/game/kennel/tracing/buy': () => json({ ...tracing, canBuy: false }),
    })
    renderWithProviders(<PetTracingWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Buy 10 attempts (10 Gold)' }))
    expect(await screen.findByText('Attempts left today: 10. Feathers: 0.')).toBeInTheDocument()
    expect(requestBody(fetchMock, 'POST /api/game/kennel/tracing/buy')).toEqual({
      currency: 'gold',
    })
    expect(screen.getByRole('button', { name: 'Buy 10 attempts (10 Gold)' })).toBeDisabled()
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

  it('blocks purchases at level, Feather balance, and daily limits', async () => {
    mockApi({
      'GET /api/game/kennel/shop': () =>
        json({
          level: 8,
          feathers: 2,
          offers: [
            { itemId: 'a', nameKey: 'Meatball', price: 1, level: 8, dailyLimit: 20, purchased: 0 },
            { itemId: 'b', nameKey: 'Lobster', price: 6, level: 23, dailyLimit: 20, purchased: 0 },
            { itemId: 'c', nameKey: 'Milk', price: 6, level: 8, dailyLimit: 20, purchased: 0 },
            {
              itemId: 'd',
              nameKey: 'Pet Skill Lock',
              price: 100,
              level: 1,
              dailyLimit: 1,
              purchased: 1,
            },
          ],
        }),
    })
    renderWithProviders(<KennelShopWindow onClose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Buy a (1 Feather)' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Requires level 23' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Buy c (6 Feathers)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Daily limit reached' })).toBeDisabled()
  })
})
