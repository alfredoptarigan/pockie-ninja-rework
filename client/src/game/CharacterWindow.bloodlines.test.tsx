import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { character, stats } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { CharacterWindow } from './CharacterWindow'
import { OpenWindowProvider } from './windows'

it('opens the Bloodlines window from the character window', async () => {
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
  await userEvent.click(screen.getByRole('button', { name: 'Bloodlines' }))
  expect(open).toHaveBeenCalledWith('bloodlines')
})

it('opens the Wings window from the character window', async () => {
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
  await userEvent.click(screen.getByRole('button', { name: 'Wings' }))
  expect(open).toHaveBeenCalledWith('wings')
})

it('opens the Pet Kennel from the character window', async () => {
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
  await userEvent.click(screen.getByRole('button', { name: 'Pet Kennel' }))
  expect(open).toHaveBeenCalledWith('pets')
})
