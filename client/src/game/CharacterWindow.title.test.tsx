import { screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { character, stats } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { CharacterWindow } from './CharacterWindow'
it('displays the equipped title in English on the character plate', async () => {
  mockApi({
    'GET /api/game/character': () => json({ character, stats }),
    'GET /api/game/buffs': () =>
      json({
        buffs: [],
        titles: [{ titleId: 12, nameKey: 'lg_EffortTitle12', active: true, expiresAt: null }],
      }),
  })
  renderWithProviders(<CharacterWindow character={character} onClose={() => {}} />)
  expect(await screen.findByText('Legendary Fat Sheep')).toBeVisible()
  expect(screen.queryByText('No title')).not.toBeInTheDocument()
})
