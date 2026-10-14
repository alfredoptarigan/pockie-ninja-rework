import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character, fists, potion } from '../test/game'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { Inventory } from './Inventory'
import type { InventoryItem } from './types'

const openMenu = async (name: string) => {
  await userEvent.click(await screen.findByRole('button', { name }))
  return screen.getByRole('menu', { name })
}

describe('Inventory', () => {
  it('uses a potion from its context menu', async () => {
    let items = [potion, fists]
    const fetchMock = mockApi({
      'GET /api/game/inventory': () => json({ items }),
      [`POST /api/game/items/${potion.id}/use`]: () => {
        items = [{ ...potion, count: 1 }, fists]
        return json({ completed: [], character: { ...character, hp: 160 } })
      },
    })
    renderWithProviders(<Inventory />)

    expect(await screen.findByText(/x2/)).toBeInTheDocument()
    const menu = await openMenu('Healing Powder')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Use Healing Powder' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Used Healing Powder.')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByText(/x2/)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/game/items/${potion.id}/use`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('opens the menu on right click and closes it with Escape', async () => {
    mockApi({ 'GET /api/game/inventory': () => json({ items: [potion] }) })
    renderWithProviders(<Inventory />)

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Healing Powder' }))
    const menu = screen.getByRole('menu', { name: 'Healing Powder' })
    expect(within(menu).getByRole('menuitem', { name: 'Use Healing Powder' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('names the card a card box gave', async () => {
    mockApi({
      'GET /api/game/inventory': () => json({ items: [potion] }),
      [`POST /api/game/items/${potion.id}/use`]: () =>
        json({ completed: [], card: { cardId: 1, nameKey: 'reborn_card_1' }, character }),
    })
    renderWithProviders(<Inventory />)
    const menu = await openMenu('Healing Powder')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Use Healing Powder' }))
    expect(await screen.findByRole('status')).toHaveTextContent('You found Hidden Land.')
  })

  it('equips the class weapon and reports finished quests', async () => {
    let items = [fists]
    mockApi({
      'GET /api/game/inventory': () => json({ items }),
      [`POST /api/game/items/${fists.id}/equip`]: () => {
        items = [{ ...fists, equippedSlot: 'Weapon' }]
        return json({ completed: [90002], character })
      },
    })
    renderWithProviders(<Inventory />)

    const menu = await openMenu('Newbie Swiping Fists')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Equip Newbie Swiping Fists' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Equipped Newbie Swiping Fists. Quest complete:',
    )
    // It leaves the bag for the weapon slot.
    const equipment = screen.getByRole('list', { name: 'Equipment' })
    expect(await within(equipment).findByText('Equipped')).toBeInTheDocument()
    expect(within(equipment).getByText(/Weapon:/)).toHaveTextContent('Newbie Swiping Fists')
    expect(screen.getByText('Your bag is empty.')).toBeVisible()
  })

  it('unequips a worn item back into the bag', async () => {
    let items: InventoryItem[] = [{ ...fists, equippedSlot: 'Weapon' }]
    const fetchMock = mockApi({
      'GET /api/game/inventory': () => json({ items }),
      [`POST /api/game/items/${fists.id}/unequip`]: () => {
        items = [fists]
        return json({ character })
      },
    })
    renderWithProviders(<Inventory />)

    const equipment = await screen.findByRole('list', { name: 'Equipment' })
    await userEvent.click(within(equipment).getByRole('button', { name: 'Newbie Swiping Fists' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unequip Newbie Swiping Fists' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Unequipped Newbie Swiping Fists.')
    expect(await within(equipment).findByText(/Weapon:/)).toHaveTextContent('empty')
    expect(
      within(screen.getByRole('list', { name: 'Bag' })).getByRole('button', {
        name: 'Newbie Swiping Fists',
      }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/game/items/${fists.id}/unequip`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('disables Equip with a reason on weapons the outfit cannot use', async () => {
    const club = {
      ...fists,
      id: '00000000-0000-7000-8000-000000000009',
      itemId: 'i250101',
      nameKey: 'lg_Equip_Blunt1',
      fitsOutfit: false,
    }
    const fetchMock = mockApi({
      'GET /api/game/inventory': () => json({ items: [{ ...fists, fitsOutfit: true }, club] }),
    })
    renderWithProviders(<Inventory />)

    const menu = await openMenu('Dogsmasher')
    const equipClub = within(menu).getByRole('menuitem', { name: 'Equip Dogsmasher' })
    expect(equipClub).toBeDisabled()
    expect(equipClub).toHaveAccessibleDescription("Your outfit can't use this weapon.")
    await userEvent.click(screen.getByRole('button', { name: 'Newbie Swiping Fists' }))
    expect(screen.getByRole('menuitem', { name: 'Equip Newbie Swiping Fists' })).toBeEnabled()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('shows why an action failed', async () => {
    mockApi({
      'GET /api/game/inventory': () => json({ items: [fists] }),
      [`POST /api/game/items/${fists.id}/equip`]: () =>
        apiError(400, 'wrong_class', 'Your outfit cannot use this kind of weapon.'),
    })
    renderWithProviders(<Inventory />)

    const menu = await openMenu('Newbie Swiping Fists')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Equip Newbie Swiping Fists' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your outfit cannot use this kind of weapon.',
    )
  })

  it('appraises and repairs gear from the context menu', async () => {
    mockApi({
      'GET /api/game/inventory': () => json({ items: [fists] }),
      'GET /api/game/forge/gear': () =>
        json({
          gear: {
            [fists.id]: {
              appraised: false,
              appraiseCost: 15,
              repairCost: 4,
              identifyCount: 2,
              props: [],
              inscription: [],
              enhanceLevel: 0,
              inscribeLevel: 0,
              baseType: 1,
              attack: { min: 1, max: 2 },
              defense: 0,
              maxHp: 0,
              durability: 5,
              maxDurability: 10,
              set: null,
            },
          },
        }),
      'POST /api/game/forge/appraise': () => json({ character }),
    })
    renderWithProviders(<Inventory />)

    await screen.findByRole('button', { name: 'Newbie Swiping Fists' })
    // The gear row loads after the bag; wait for it so the menu lists the forge actions.
    const menu = await waitFor(async () => {
      const opened = await openMenu('Newbie Swiping Fists')
      within(opened).getByRole('menuitem', { name: 'Repair Newbie Swiping Fists for 4 Stone' })
      return opened
    })
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Appraise Newbie Swiping Fists for 15 Stone' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Appraised Newbie Swiping Fists.')
  })

  it('lays items over the 27px tiles their icons cover', async () => {
    const pack = {
      ...potion,
      id: 'p1',
      itemId: 'i171001',
      nameKey: 'lg_reborn_item_171001',
      count: 50,
    }
    mockApi({ 'GET /api/game/inventory': () => json({ items: [fists, potion, pack] }) })
    renderWithProviders(<Inventory />)

    const cell = (name: string) => screen.getByRole('button', { name }).closest('li')!
    await screen.findByRole('button', { name: 'Green Card Pack' })
    // Fists (a 51x78 weapon, 2x3) in the corner, then the 24px potion and card pack, one tile each.
    expect(cell('Newbie Swiping Fists').style).toMatchObject({ left: '0px', top: '0px' })
    expect(cell('Healing Powder').style).toMatchObject({ left: '54px', top: '0px' })
    expect(cell('Green Card Pack').style).toMatchObject({ left: '81px', top: '0px' })
    expect(screen.getByRole('img', { name: 'Green Card Pack' })).toHaveAttribute(
      'src',
      '/assets/reborn/icons/items/cards/item/1.webp',
    )
  })

  it('sorts the bag with the Sort button', async () => {
    const hat = { ...fists, id: 'h1', itemId: 'i220102', nameKey: 'lg_x' }
    mockApi({ 'GET /api/game/inventory': () => json({ items: [fists, hat] }) })
    renderWithProviders(<Inventory />)

    const first = () => within(screen.getByRole('list', { name: 'Bag' })).getAllByRole('button')[0]
    expect(await screen.findByRole('button', { name: 'Newbie Swiping Fists' })).toBe(first())
    await userEvent.click(screen.getByRole('button', { name: 'Sort' }))
    expect(screen.getByRole('button', { name: 'Sort' })).toHaveAttribute('aria-pressed', 'true')
    expect(first()).toHaveAccessibleName('Unknown item')
  })

  it('shows the Reborn side buttons, those without a feature disabled', async () => {
    mockApi({ 'GET /api/game/inventory': () => json({ items: [] }) })
    renderWithProviders(<Inventory />)

    for (const name of ['Compose', 'Collection', 'Sort'])
      expect(await screen.findByRole('button', { name })).toBeEnabled()
    for (const name of ['Multi Sell', 'Wardrobe', 'Reroll'])
      expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Talent' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Blood Limit' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Hide' })).not.toBeChecked()
  })

  it('shows each item with its original icon, or a placeholder', async () => {
    const unknown = { ...potion, id: 'u3', itemId: 'i0000000', nameKey: 'lg_missing', count: 1 }
    mockApi({ 'GET /api/game/inventory': () => json({ items: [potion, fists, unknown] }) })
    renderWithProviders(<Inventory />)

    expect(await screen.findByRole('img', { name: 'Healing Powder' })).toHaveAttribute(
      'src',
      '/assets/game/items/icon_resume6.webp',
    )
    expect(screen.getByRole('img', { name: 'Newbie Swiping Fists' })).toHaveAttribute(
      'src',
      '/assets/game/items/icon_weapon_gloves1.webp',
    )
    expect(screen.getByRole('img', { name: 'Unknown item' })).not.toHaveAttribute('src')
  })

  it('says when the bag is empty', async () => {
    mockApi({ 'GET /api/game/inventory': () => json({ items: [] }) })
    renderWithProviders(<Inventory />)
    expect(await screen.findByText('Your bag is empty.')).toBeVisible()
  })

  it('marks the tutorial item and opens its page', async () => {
    // Ten fists (2x3 weapons) fill page I, so the pack lands on page II.
    const filler = Array.from({ length: 10 }, (_, i) => ({ ...fists, id: `f${i}` }))
    const pack = { ...potion, id: 'pack', itemId: 'i159104', nameKey: 'lg_x', count: 1 }
    mockApi({ 'GET /api/game/inventory': () => json({ items: [...filler, pack] }) })
    renderWithProviders(<Inventory highlight={{ itemId: 'i159104' }} />)

    expect(await screen.findByRole('tabpanel', { name: 'Bag II' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'II' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Next step').closest('li')).toHaveTextContent('Unknown item')
    const menu = await openMenu('Unknown item')
    expect(within(menu).getByRole('menuitem', { name: 'Use item' })).toBeEnabled()

    await userEvent.click(screen.getByRole('tab', { name: 'I' }))
    expect(screen.getAllByRole('button', { name: 'Newbie Swiping Fists' })).toHaveLength(10)
  })

  it('shows every equipment slot, empty or worn', async () => {
    const ring = {
      ...fists,
      id: 'r1',
      itemId: 'i0000001',
      nameKey: 'lg_ring',
      equippedSlot: 'Ring',
    }
    mockApi({ 'GET /api/game/inventory': () => json({ items: [ring] }) })
    renderWithProviders(<Inventory />)

    const slots = within(await screen.findByRole('list', { name: 'Equipment' })).getAllByRole(
      'listitem',
    )
    expect(slots.map((slot) => slot.textContent)).toEqual([
      'Outfit: empty',
      'Weapon: empty',
      'Gloves: empty',
      'Pet: empty',
      'Ring: Unknown item Equipped',
      'Amulet: empty',
      'Hat: empty',
      'Armour: empty',
      'Belt: empty',
      'Shoes: empty',
      'Wing: empty',
    ])
  })

  it('draws the outfit pose, and drops it when the outfit has none', async () => {
    mockApi({
      'GET /api/game/character': () => json({ character }),
      'GET /api/game/inventory': () => json({ items: [] }),
    })
    const { container } = renderWithProviders(<Inventory />)
    const pose = await waitFor(() => {
      const img = container.querySelector('img[src^="/assets/reborn/poses/"]')
      expect(img).not.toBeNull()
      return img!
    })
    expect(pose).toHaveAttribute('src', `/assets/reborn/poses/${character.clothing}.webp`)
    fireEvent.error(pose)
    expect(container.querySelector('img[src^="/assets/reborn/poses/"]')).toBeNull()
  })

  it('shows the title on the plate, which opens buffs and titles', async () => {
    mockApi({
      'GET /api/game/character': () => json({ character }),
      'GET /api/game/inventory': () => json({ items: [] }),
      'GET /api/game/buffs': () => json({ buffs: [], titles: [] }),
    })
    renderWithProviders(<Inventory />)
    const plate = await screen.findByRole('button', { name: 'Buffs and titles' })
    expect(plate).toHaveTextContent('No title')
    await userEvent.click(plate)
    expect(await screen.findByRole('dialog', { name: 'Buffs and titles' })).toBeVisible()
  }, 15_000)
})
