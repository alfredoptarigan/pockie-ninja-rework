import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { character, stats } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { CharacterWindow } from './CharacterWindow'
import { OpenWindowProvider } from './windows'

it('opens the Talents window from the character window', async () => {
  mockApi({
    'GET /api/game/character': () => json({ character, stats }),
    'GET /api/game/buffs': () => json({ buffs: [], titles: [] }),
  })
  const open = vi.fn()
  renderWithProviders(
    <OpenWindowProvider value={open}>
      <CharacterWindow character={character} onClose={() => {}} />
    </OpenWindowProvider>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Talents' }))
  expect(open).toHaveBeenCalledWith('talents')
})
