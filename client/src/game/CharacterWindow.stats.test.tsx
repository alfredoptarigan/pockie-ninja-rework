import { screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { character, stats } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { CharacterWindow } from './CharacterWindow'

const render = (tier = 2) => {
  mockApi({
    'GET /api/game/character': () => json({ character, stats }),
    'GET /api/game/buffs': () => json({ buffs: [], titles: [] }),
    'GET /api/game/arena': () => json({ tier }),
  })
  renderWithProviders(<CharacterWindow character={character} onClose={() => {}} />)
}

it('shows Reborn rows: the first word of the village and the arena rank', async () => {
  render(2)
  const profile = await screen.findByRole('region', { name: 'Profile' })
  expect(within(profile).getByText('Fire')).toBeVisible()
  expect(await within(profile).findByText('Prep III')).toBeVisible()
  expect(screen.getByText('No title')).toBeVisible()
})

it('gives stats Reborn hover texts and the hint footer', async () => {
  render()
  const combat = await screen.findByRole('region', { name: 'Combat stats' })
  expect(await within(combat).findByTitle('10.21% damage reduction')).toHaveTextContent('154')
  expect(within(combat).getByTitle('0.13% chance to block attacks')).toHaveTextContent('2')
  expect(within(combat).getByTitle('0.00% critical chance, +30.00% critical damage')).toBeVisible()
  expect(within(combat).getByTitle('Speed: 1000 (5.00s between turns)')).toHaveTextContent('1.00')
  expect(within(combat).getByText('Hover over stats for details')).toBeVisible()
})

it('has no extras the original window lacks', async () => {
  render()
  await screen.findByRole('region', { name: 'Combat stats' })
  expect(screen.queryByRole('region', { name: 'Refill pouches' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Training' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Avatar preview' })).not.toBeInTheDocument()
})
