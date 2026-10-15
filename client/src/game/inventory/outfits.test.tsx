// Outfits as items in the Inventory: the Outfit slot, bag outfits ("+N", Equip), Manage Outfit's
// Visual Outfit and the Wardrobe.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { Inventory } from '../Inventory'
import { ToastHost } from '../toast'
import type { InventoryItem } from '../types'

const outfitInfo = (clothing: number, plus: number, level = 0) => ({
  kind: 'equip' as const,
  equipSlot: 'Outfit',
  level,
  sellPrice: 1000,
  stack: 1,
  w: 2,
  h: 2,
  class: 'AvatarItem',
  outfit: { clothing, plus },
})
/** The worn creation outfit (clothing 3, "Ggio Vega"). */
const worn: InventoryItem = {
  id: '00000000-0000-7000-8000-0000000000a1',
  itemId: 'i290003',
  count: 1,
  bound: true,
  equippedSlot: 'Outfit',
  equippedSet: 1,
  nameKey: 'lg_avatar3',
  page: null,
  slot: null,
  locked: false,
  info: outfitInfo(3, 1),
}
/** A spare outfit in the bag (clothing 17, "Kiba Inuzuka" +2). */
const spare: InventoryItem = {
  ...worn,
  id: '00000000-0000-7000-8000-0000000000a2',
  itemId: 'i290117',
  nameKey: 'lg_avatar117',
  bound: false,
  equippedSlot: null,
  equippedSet: null,
  page: 0,
  slot: 0,
  info: outfitInfo(17, 2),
}

function renderBag(
  items: InventoryItem[],
  handlers: Parameters<typeof mockApi>[0] = {},
  hero = character,
) {
  const fetchMock = mockApi({
    'GET /api/game/inventory': () => json({ items }),
    'GET /api/game/character': () => json({ character: hero }),
    'GET /api/game/wardrobe': () => json({ items: [] }),
    ...handlers,
  })
  renderWithProviders(
    <>
      <Inventory />
      <ToastHost />
    </>,
  )
  return fetchMock
}

const equipment = () => screen.findByRole('list', { name: 'Equipment' })
const bagButton = async (name: string) =>
  within(await screen.findByRole('list', { name: 'Bag' })).findByRole('button', { name })

afterEach(() => vi.restoreAllMocks())

describe('the Outfit slot', () => {
  it('shows the worn outfit item with "+N", red under its required level', async () => {
    renderBag([worn])
    const slot = (await within(await equipment()).findByText('Outfit: Ggio Vega +1')).closest('li')!
    expect(slot.querySelector('img')).toHaveAttribute(
      'src',
      '/assets/reborn/icons/items/avatars/3.webp',
    )
    expect(within(slot).getByText('+1')).not.toHaveClass('text-[#ff1a1a]')
  })

  it("falls back to set I's outfit when the active set wears none", async () => {
    renderBag([worn], {}, { ...character, activeSet: 2 })
    expect(await within(await equipment()).findByText('Outfit: Ggio Vega +1')).toBeInTheDocument()
  })

  it('equips a held bag outfit on click and shows the outfit tooltip', async () => {
    const fetchMock = renderBag([worn, spare], {
      'POST /api/game/items/00000000-0000-7000-8000-0000000000a2/equip': () =>
        json({ character, items: [worn, spare] }),
    })
    const outfit = await within(await equipment()).findByRole('button', { name: 'Ggio Vega +1' })
    await userEvent.hover(outfit)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ggio Vega +1')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Item Type:Outfit')

    await userEvent.click(await bagButton('Kiba Inuzuka +2'))
    await userEvent.click(outfit)
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/game/items/00000000-0000-7000-8000-0000000000a2/equip',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })
})

describe('bag outfits', () => {
  it('show "+N" (red when the level is too low) and offer Equip', async () => {
    renderBag([worn, { ...spare, info: outfitInfo(17, 2, 20) }])
    const cell = (await bagButton('Kiba Inuzuka +2')).closest('li')!
    expect(within(cell).getByText('+2')).toHaveClass('text-[#ff1a1a]')
    expect(cell.querySelector('img')).toHaveAttribute(
      'src',
      '/assets/reborn/icons/items/avatars/17.webp',
    )
    fireEvent.contextMenu(await bagButton('Kiba Inuzuka +2'))
    const menu = screen.getByRole('menu', { name: 'Kiba Inuzuka +2' })
    expect(within(menu).getByRole('menuitem', { name: 'Equip Kiba Inuzuka +2' })).toBeEnabled()
  })
})

describe('Manage Outfit', () => {
  async function openManage() {
    fireEvent.contextMenu(
      await within(await equipment()).findByRole('button', { name: 'Ggio Vega +1' }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Manage' }))
    return screen.getByRole('dialog', { name: 'Manage Outfit' })
  }

  it('chooses a bag outfit as the Visual Outfit for 250 gold', async () => {
    const fetchMock = renderBag([worn, spare], {
      'POST /api/game/outfit/visual': () =>
        json({
          character: { ...character, visualClothing: 17 },
          items: [worn, spare],
          wardrobe: [],
        }),
    })
    const dialog = await openManage()
    expect(dialog).toHaveTextContent('Stat Outfit')
    expect(dialog).toHaveTextContent(
      'Changing the visual outfit costs 250 gold. Removing it is free.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose Visual Outfit' }))

    const picker = screen.getByRole('dialog', { name: 'Choose an outfit to show visually' })
    expect(within(picker).queryByRole('button', { name: 'Ggio Vega +1' })).toBeNull()
    await userEvent.click(within(picker).getByRole('button', { name: 'Kiba Inuzuka +2' }))
    const confirm = screen.getByRole('alertdialog')
    expect(confirm).toHaveTextContent('Cost: 250 gold')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(requestBody(fetchMock, 'POST /api/game/outfit/visual')).toEqual({
        inventoryId: spare.id,
      }),
    )
    // Back on the main view, which now offers Remove.
    expect(await screen.findByRole('button', { name: 'Remove' })).toBeVisible()
  })

  it('removes a Visual Outfit for free and draws the pose with it', async () => {
    const fetchMock = renderBag(
      [worn],
      {
        'POST /api/game/outfit/visual/clear': () =>
          json({ character, items: [worn], wardrobe: [] }),
      },
      { ...character, visualClothing: 17 },
    )
    await waitFor(() =>
      expect(document.querySelector('img[src^="/assets/reborn/poses/"]')).toHaveAttribute(
        'src',
        '/assets/reborn/poses/17.webp',
      ),
    )
    const dialog = await openManage()
    expect(within(dialog).getByRole('img', { name: 'Visual Outfit: Kiba Inuzuka' })).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/game/outfit/visual/clear',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })
})

describe('Wardrobe', () => {
  it('stores a held outfit in a slot and takes a stored one out', async () => {
    const stored = { ...spare, page: null, slot: null, wardrobeSlot: 6 }
    const fetchMock = renderBag([worn, spare], {
      'GET /api/game/wardrobe': () => json({ items: [stored] }),
      'POST /api/game/wardrobe/store': () => json({ character, items: [worn], wardrobe: [stored] }),
      'POST /api/game/wardrobe/take': () => json({ character, items: [worn, spare], wardrobe: [] }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Wardrobe' }))
    const wardrobe = screen.getByRole('dialog', { name: 'Wardrobe' })
    expect(within(wardrobe).getByText('1/4')).toBeInTheDocument()
    expect(within(wardrobe).getAllByRole('listitem')).toHaveLength(5)

    await userEvent.click(await bagButton('Kiba Inuzuka +2'))
    await userEvent.click(within(wardrobe).getByRole('button', { name: 'Store in slot 1' }))
    await waitFor(() =>
      expect(requestBody(fetchMock, 'POST /api/game/wardrobe/store')).toEqual({
        inventoryId: spare.id,
        slot: 0,
      }),
    )

    await userEvent.click(within(wardrobe).getByRole('button', { name: 'Next page' }))
    expect(within(wardrobe).getByText('2/4')).toBeInTheDocument()
    const row = within(wardrobe).getByText('Kiba Inuzuka +2').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Take Out' }))
    await waitFor(() =>
      expect(requestBody(fetchMock, 'POST /api/game/wardrobe/take')).toEqual({ slot: 6 }),
    )
  })
})
