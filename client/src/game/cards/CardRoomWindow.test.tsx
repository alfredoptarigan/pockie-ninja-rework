import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import collectionsData from '../../generated/reborn-cards.json'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders } from '../../test/utils'
import { CardRoomWindow, cardArt } from './index'

const view = (claimed = false) => ({
  collections: collectionsData.map((c) => ({
    id: c.id,
    nameKey: `reborn_card_collection_${c.id}`,
    rarity: c.rarity,
    cards: c.cards.map((card) => ({
      id: card.id,
      nameKey: `reborn_card_${card.id}`,
      count: c.id === 4 || card.id === 1 ? 2 : 0,
    })),
    owned: c.id === 4 ? c.cards.length : c.id === 1 ? 1 : 0,
    total: c.cards.length,
    prize:
      c.id === 4
        ? [
            { itemId: 'i218022', count: 2 },
            { itemId: 'i218050', count: 1 },
          ]
        : [{ itemId: 'i218021', count: 3 }],
    claimed: c.id === 4 && claimed,
  })),
})

describe('CardRoomWindow', () => {
  it('has art on disk for all 74 cards', () => {
    for (let id = 1; id <= 74; id++) {
      const url = cardArt(id)
      expect(url).toBeDefined()
      expect(existsSync(join(__dirname, '../../../public', url!))).toBe(true)
    }
  })

  it('lists the 10 collections and shows a page with its cards and rewards', async () => {
    mockApi({ 'GET /api/game/cards': () => json(view()) })
    renderWithProviders(<CardRoomWindow onClose={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Collections' })
    expect(within(list).getAllByRole('button')).toHaveLength(10)
    expect(screen.getByText('Collections 9/74')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Konoha Village' })).toBeVisible()
    const cards = screen.getByRole('list', { name: 'Cards' })
    expect(within(cards).getAllByTitle('Not Owned')).toHaveLength(6)
    expect(within(cards).getByTitle('Owned')).toHaveTextContent('x2')
    expect(screen.getByRole('region', { name: 'Konoha Village Rewards' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Claim' })).toBeDisabled()
  })

  it('claims a complete collection once', async () => {
    let claimed = false
    mockApi({
      'GET /api/game/cards': () => json(view(claimed)),
      'POST /api/game/cards/collections/4/claim': () => {
        claimed = true
        return json({ ...view(true), character })
      },
    })
    renderWithProviders(<CardRoomWindow onClose={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Collections' })
    await userEvent.click(within(list).getByRole('button', { name: /Seireitei Reapers/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(await screen.findByRole('button', { name: 'Claimed' })).toBeDisabled()
  })

  it('shows a full bag refusal', async () => {
    mockApi({
      'GET /api/game/cards': () => json(view()),
      'POST /api/game/cards/collections/4/claim': () =>
        apiError(400, 'bag_full', 'Your bag is full.'),
    })
    renderWithProviders(<CardRoomWindow onClose={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Collections' })
    await userEvent.click(within(list).getByRole('button', { name: /Seireitei Reapers/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(await screen.findByText('Your bag is full.')).toBeVisible()
  })

  it('lists owned cards in My Card Box with a search', async () => {
    mockApi({ 'GET /api/game/cards': () => json(view()) })
    renderWithProviders(<CardRoomWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'My Card Box' }))
    expect(screen.getByText('My Card Box (9/9)')).toBeVisible()
    const box = screen.getByRole('list', { name: 'My cards' })
    expect(within(box).getAllByRole('listitem')).toHaveLength(9)
    await userEvent.click(screen.getByRole('button', { name: /^Konoha Village/ }))
    expect(screen.getByText('My Card Box (1/9)')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'All Cards' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz')
    expect(screen.getByText('My Card Box (0/9)')).toBeVisible()
  })
})
