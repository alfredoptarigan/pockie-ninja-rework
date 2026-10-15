import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { ChangeVillageOption } from './ChangeVillage'
import type { SceneNpc } from './types'

const elder: SceneNpc = { id: 'n16001', nameKey: 'lg_name_n16001', x: 0, y: 0, scale: 100 }
const inAngelCity = { ...character, sceneId: 161, stone: 60_000 }

function renderOption(who = inAngelCity, npc = elder) {
  const onEnd = vi.fn()
  renderWithProviders(
    <ul>
      <ChangeVillageOption npc={npc} character={who} onEnd={onEnd} />
    </ul>,
  )
  return { onEnd }
}

const options = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-label') !== 'Close')

describe('ChangeVillageOption', () => {
  it('is only offered by the Angel City Elder in Angel City', () => {
    mockApi({})
    renderOption({ ...inAngelCity, sceneId: 111 })
    renderOption(inAngelCity, { ...elder, id: 'n16002' })
    expect(screen.queryByRole('button', { name: 'Change Village' })).not.toBeInTheDocument()
  })

  it("lists Reborn's five villages for 50,000 stones and greys the ninja's own", async () => {
    mockApi({})
    renderOption()
    await userEvent.click(screen.getByRole('button', { name: 'Change Village' }))
    const dialog = screen.getByRole('dialog', { name: 'Village Elder' })
    expect(dialog).toHaveTextContent('Select your new village (50,000 stones)')
    expect(options(dialog).map((button) => button.textContent)).toEqual([
      'Fire Village (your village)',
      'Water Village',
      'Lightning Village',
      'Wind Village',
      'Earth Village',
      'Back',
      'End Conversation',
    ])
    expect(within(dialog).getByRole('button', { name: 'Fire Village (your village)' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Water Village' })).toBeEnabled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('greys every village without 50,000 stones', async () => {
    mockApi({})
    renderOption({ ...inAngelCity, stone: 49_999 })
    await userEvent.click(screen.getByRole('button', { name: 'Change Village' }))
    const dialog = screen.getByRole('dialog', { name: 'Village Elder' })
    for (const name of ['Water Village', 'Lightning Village', 'Wind Village', 'Earth Village']) {
      expect(within(dialog).getByRole('button', { name })).toBeDisabled()
    }
  })

  it('changes village after the confirm and ends the conversation', async () => {
    const fetchMock = mockApi({
      'POST /api/game/change-village': () =>
        json({ character: { ...inAngelCity, nation: 4, stone: 10_000 } }),
    })
    const { onEnd } = renderOption()
    await userEvent.click(screen.getByRole('button', { name: 'Change Village' }))
    const dialog = screen.getByRole('dialog', { name: 'Village Elder' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lightning Village' }))
    expect(dialog).toHaveTextContent('Change to Lightning Village for 50,000 stones?')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lightning Village' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, Change Village' }))
    expect(requestBody(fetchMock, 'POST /api/game/change-village')).toEqual({ village: 131 })
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalled())
  })
})
