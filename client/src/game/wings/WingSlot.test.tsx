import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fists } from '../../test/game'
import { json, mockApi, renderWithProviders } from '../../test/utils'
import { Inventory } from '../Inventory'
import { WING_ICONS } from './index'

describe('Inventory Wing slot (decision 22)', () => {
  it('shows the worn wing with its Reborn icon', async () => {
    const wing = {
      ...fists,
      id: 'wing-row',
      itemId: 'i218000',
      nameKey: 'lg_reborn_item_218000',
      equippedSlot: 'Wing',
    }
    mockApi({ 'GET /api/game/inventory': () => json({ items: [wing] }) })
    const { container } = renderWithProviders(<Inventory />)
    const equipment = await screen.findByRole('list', { name: 'Equipment' })
    expect(await within(equipment).findByText(/Wing:/)).toHaveTextContent('Fallen Wings')
    expect(container.querySelector(`img[src="${WING_ICONS.i218000}"]`)).not.toBeNull()
  })

  it('shows an empty Wing slot', async () => {
    mockApi({ 'GET /api/game/inventory': () => json({ items: [] }) })
    renderWithProviders(<Inventory />)
    const equipment = await screen.findByRole('list', { name: 'Equipment' })
    expect(await within(equipment).findByText('Wing: empty')).toBeInTheDocument()
  })
})
