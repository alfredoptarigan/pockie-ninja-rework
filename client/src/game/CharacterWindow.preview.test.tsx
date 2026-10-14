import { screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { character, stats } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { CharacterWindow } from './CharacterWindow'

const wing = {
  id: '00000000-0000-7000-8000-000000000009',
  itemId: 'i218000',
  count: 1,
  bound: true,
  equippedSlot: 'Wing',
  nameKey: 'lg_i218000',
}

it('previews the avatar with the equipped wing', async () => {
  mockApi({
    'GET /api/game/character': () => json({ character, stats }),
    'GET /api/game/buffs': () => json({ buffs: [], titles: [] }),
    'GET /api/game/inventory': () => json({ items: [wing] }),
  })
  renderWithProviders(<CharacterWindow character={character} onClose={() => {}} />)
  expect(await screen.findByRole('region', { name: 'Avatar preview' })).toBeInTheDocument()
})

it('shows no preview without a wing or aura', async () => {
  mockApi({
    'GET /api/game/character': () => json({ character, stats }),
    'GET /api/game/buffs': () => json({ buffs: [], titles: [] }),
    'GET /api/game/inventory': () => json({ items: [{ ...wing, equippedSlot: null }] }),
  })
  renderWithProviders(<CharacterWindow character={character} onClose={() => {}} />)
  expect(await screen.findByText('Stats')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Avatar preview' })).not.toBeInTheDocument()
})
