import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GearView } from '@pockie/shared'
import { describe, expect, it } from 'vitest'
import { character, fists, potion } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { Inventory } from '../Inventory'
import type { InventoryItem } from '../types'

const gearWith = (lines: number) =>
  ({
    baseType: 1,
    level: 1,
    equipType: 'Weapon',
    attack: { min: 1, max: 2 },
    defense: 0,
    special: [],
    inscription: [],
    inscribeLevel: 0,
    enhanceLevel: 0,
    enhanceMax: 0,
    durability: 10,
    maxDurability: 10,
    appraised: true,
    props: Array.from({ length: lines }, (_, index) => ({
      propId: index,
      name: 'Attack',
      value: 1,
      min: 1,
      max: 2,
      tier: 1,
    })),
  }) as unknown as GearView

const sword: InventoryItem = {
  ...fists,
  id: 'sword',
  itemId: 'i250101',
  nameKey: 'lg_Equip_Blunt1',
  slot: 2,
}
const lockedFists: InventoryItem = { ...fists, id: 'locked', slot: 4, locked: true }
const pills: InventoryItem = { ...potion, slot: 6 }

function renderBag(items: InventoryItem[]) {
  const bag = { items }
  const fetchMock = mockApi({
    'GET /api/game/inventory': () => json({ items: bag.items }),
    'GET /api/game/character': () => json({ character }),
    'GET /api/game/forge/gear': () =>
      json({ gear: { [fists.id]: gearWith(0), sword: gearWith(1), locked: gearWith(0) } }),
    'POST /api/game/items/sell': () =>
      json({ character, items: (bag.items = [pills]), earned: 40 }),
    'POST /api/game/items/sort': () => json({ character, items: bag.items }),
  })
  renderWithProviders(<Inventory />)
  return fetchMock
}

describe('Multi Sell', () => {
  it('selects by clicking and by grade filter, then sells after a confirm', async () => {
    const fetchMock = renderBag([fists, sword, lockedFists, pills])
    await userEvent.click(await screen.findByRole('button', { name: 'Multi Sell' }))
    const dialog = screen.getByRole('dialog', { name: 'Multi Sell' })
    const sell = within(dialog).getByRole('button', { name: 'Sell' })
    expect(sell).toBeDisabled()

    // Clicking bag items toggles them (no pick-up); locked items are ignored.
    const bag = screen.getByRole('list', { name: 'Bag' })
    await userEvent.click(within(bag).getByRole('button', { name: 'Healing Powder' }))
    await userEvent.click(within(bag).getAllByRole('button', { name: 'Newbie Swiping Fists' })[1]!)
    expect(within(dialog).getAllByRole('button', { name: /^Deselect/ })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Tile 1' })).not.toBeInTheDocument()

    // Below Gray: unlocked gear without refinement lines (once the gear rows have loaded).
    const filter = within(dialog).getByRole('combobox', { name: 'Select Filter' })
    await waitFor(async () => {
      await userEvent.selectOptions(filter, 'Sell Equipment Below Green')
      await userEvent.selectOptions(filter, 'Sell Equipment Below Gray')
      expect(within(dialog).getAllByRole('button', { name: /^Deselect/ })).toHaveLength(1)
    })
    // Below Green: fewer than two lines.
    await userEvent.selectOptions(filter, 'Sell Equipment Below Green')
    expect(
      within(dialog)
        .getAllByRole('button', { name: /^Deselect/ })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Deselect Newbie Swiping Fists', 'Deselect Dogsmasher'])

    await userEvent.click(sell)
    await userEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Sell these items?' })).getByRole('button', {
        name: 'Accept',
      }),
    )
    expect(requestBody(fetchMock, 'POST /api/game/items/sell')).toEqual({
      inventoryIds: [fists.id, 'sword'],
    })
    await waitFor(() =>
      expect(within(dialog).queryAllByRole('button', { name: /^Deselect/ })).toHaveLength(0),
    )
  })

  it('clears the selection', async () => {
    renderBag([fists, pills])
    await userEvent.click(await screen.findByRole('button', { name: 'Multi Sell' }))
    const dialog = screen.getByRole('dialog', { name: 'Multi Sell' })
    await userEvent.click(
      within(screen.getByRole('list', { name: 'Bag' })).getByRole('button', {
        name: 'Healing Powder',
      }),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear' }))
    expect(within(dialog).queryAllByRole('button', { name: /^Deselect/ })).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Sort Inventory', () => {
  it('sorts the current tab or all tabs, stacking unless unticked', async () => {
    const fetchMock = renderBag([pills])
    await userEvent.click(await screen.findByRole('button', { name: 'Sort' }))
    let dialog = screen.getByRole('dialog', { name: 'Sort Inventory' })
    expect(dialog).toHaveTextContent('How do you want to sort your inventory?')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Current Tab' }))
    expect(requestBody(fetchMock, 'POST /api/game/items/sort')).toEqual({
      scope: 'tab',
      page: 0,
      stack: true,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Sort' }))
    dialog = screen.getByRole('dialog', { name: 'Sort Inventory' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Stack identical items' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'All Tabs' }))
    const sorts = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/items/sort'))
    expect(JSON.parse(String(sorts[1]![1]!.body))).toEqual({ scope: 'all', stack: false })
  })
})

describe('Use Multiple', () => {
  it('caps the amount at 1000', async () => {
    renderBag([{ ...pills, count: 1500 }])
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: await screen.findByRole('button', { name: 'Healing Powder' }),
    })
    await userEvent.click(screen.getByRole('menuitem', { name: 'Use Multiple Healing Powder' }))
    const dialog = screen.getByRole('dialog', { name: 'Use Multiple Items' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'MAX' }))
    expect(within(dialog).getByRole('spinbutton', { name: 'Amount' })).toHaveValue(1000)
    expect(within(dialog).getByRole('spinbutton', { name: 'Amount' })).toHaveAttribute(
      'max',
      '1000',
    )
  })
})
