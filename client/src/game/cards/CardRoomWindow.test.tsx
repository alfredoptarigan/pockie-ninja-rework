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

  it('shows 10 collection pages with progress and refuses an incomplete claim', async () => {
    mockApi({ 'GET /api/game/cards': () => json(view()) })
    renderWithProviders(<CardRoomWindow onClose={vi.fn()} />)
    const nav = await screen.findByRole('navigation', { name: 'Collections' })
    expect(within(nav).getAllByRole('button')).toHaveLength(10)
    expect(screen.getByText(/Konoha Village - Green - 1\/7 cards/)).toBeVisible()
    expect(screen.getByText('x2')).toBeVisible()
    expect(screen.getAllByText('Missing')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Claim prize' })).toBeDisabled()
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
    await userEvent.click(await screen.findByRole('button', { name: /Seretei Reapers/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Claim prize' }))
    expect(
      await screen.findByText(
        'Prize claimed: 2 x Plume Shard [Second Grade], Talisman of Luck [D].',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Prize claimed' })).toBeDisabled()
  })

  it('shows a full bag refusal', async () => {
    mockApi({
      'GET /api/game/cards': () => json(view()),
      'POST /api/game/cards/collections/4/claim': () =>
        apiError(400, 'bag_full', 'Your bag is full.'),
    })
    renderWithProviders(<CardRoomWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /Seretei Reapers/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Claim prize' }))
    expect(await screen.findByText('Your bag is full.')).toBeVisible()
  })
})
