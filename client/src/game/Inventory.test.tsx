import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character, fists, outfitStats, potion, stats } from '../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { bloodlinesView } from './bloodlines/test-data'
import { Inventory } from './Inventory'
import { onItemLinkRequest } from './social'
import { ToastHost } from './toast'
import type { BagHighlight, InventoryItem } from './types'

type Handlers = Parameters<typeof mockApi>[0]

const club: InventoryItem = {
  ...fists,
  id: '00000000-0000-7000-8000-000000000009',
  itemId: 'i250101',
  nameKey: 'lg_Equip_Blunt1',
  slot: 4,
}

/** The worn creation outfit (clothing 3, Ggio Vega), an item in set I's Outfit slot. */
const outfit: InventoryItem = {
  ...fists,
  id: '00000000-0000-7000-8000-0000000000a1',
  itemId: 'i290003',
  nameKey: 'lg_avatar3',
  equippedSlot: 'Outfit',
  equippedSet: 1,
  page: null,
  slot: null,
  info: {
    kind: 'equip',
    equipSlot: 'Outfit',
    level: 0,
    sellPrice: 1000,
    stack: 1,
    w: 2,
    h: 2,
    class: 'AvatarItem',
    outfit: { ...outfitStats, clothing: 3, plus: 1 },
  },
}

/** Renders the bag; `bag.items` is what GET /api/game/inventory answers (tests may replace it). */
function renderBag(
  items: InventoryItem[],
  handlers: (bag: { items: InventoryItem[] }) => Handlers = () => ({}),
  { highlight, hero = character }: { highlight?: BagHighlight; hero?: typeof character } = {},
) {
  const bag = { items }
  const fetchMock = mockApi({
    'GET /api/game/inventory': () => json({ items: bag.items }),
    'GET /api/game/character': () => json({ character: hero }),
    ...handlers(bag),
  })
  renderWithProviders(
    <>
      <Inventory highlight={highlight} />
      <ToastHost />
    </>,
  )
  return { fetchMock, bag }
}

/** A bag action's answer: the character and the whole bag. */
const reply = (bag: { items: InventoryItem[] }, items: InventoryItem[]) => {
  bag.items = items
  return json({ character, items })
}

const bagList = () => screen.getByRole('list', { name: 'Bag' })
const bagItem = (name: string) => within(bagList()).getByRole('button', { name })
const cell = (name: string) => bagItem(name).closest('li')!
const equipment = () => screen.getByRole('list', { name: 'Equipment' })
const posted = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

async function rightClickMenu(name: string) {
  fireEvent.contextMenu(
    await within(await screen.findByRole('list', { name: 'Bag' })).findByRole('button', { name }),
  )
  return screen.getByRole('menu', { name })
}

afterEach(() => vi.restoreAllMocks())

describe('Inventory bag grid', () => {
  it('draws each item at its server tile, sized by its footprint, on its tab', async () => {
    const scroll = { ...potion, id: 's1', nameKey: 'lg_x', page: 1, slot: 15 }
    renderBag([fists, potion, scroll])

    await screen.findByRole('button', { name: 'Healing Powder' })
    expect(cell('Newbie Swiping Fists').style).toMatchObject({
      left: '0px',
      top: '0px',
      width: '51px',
      height: '78px',
    })
    expect(cell('Healing Powder').style).toMatchObject({ left: '54px', top: '0px', width: '24px' })
    expect(cell('Healing Powder')).toHaveTextContent('x2')
    expect(screen.queryByRole('button', { name: 'Unknown item' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'II' }))
    expect(screen.getByRole('tabpanel', { name: 'Bag II' })).toBeVisible()
    expect(cell('Unknown item').style).toMatchObject({ left: '135px', top: '27px' })
  })

  it('shows each item with its original icon, or a placeholder', async () => {
    const unknown = { ...potion, id: 'u3', itemId: 'i0000000', nameKey: 'lg_missing', slot: 9 }
    renderBag([potion, fists, unknown])

    expect(await screen.findByRole('img', { name: 'Healing Powder' })).toHaveAttribute(
      'src',
      '/assets/game/items/icon_resume6.webp',
    )
    expect(screen.getByRole('img', { name: 'Unknown item' })).not.toHaveAttribute('src')
  })

  it('marks gear above your level and locked items', async () => {
    const heavy = { ...fists, locked: true, info: { ...fists.info!, level: 30 } }
    renderBag([heavy])
    expect(await screen.findByText('Lv:30')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock Newbie Swiping Fists' })).toBeVisible()
  })

  it('says when the bag is empty', async () => {
    renderBag([])
    expect(await screen.findByText('Your bag is empty.')).toBeVisible()
  })

  it('marks the tutorial item and opens its tab', async () => {
    const pack = { ...potion, id: 'pack', itemId: 'i159104', nameKey: 'lg_x', page: 1, slot: 0 }
    renderBag([fists, pack], undefined, { highlight: { itemId: 'i159104' } })

    expect(await screen.findByRole('tabpanel', { name: 'Bag II' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'II' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Next step').closest('li')).toHaveTextContent('Unknown item')
  })
})

describe('Inventory click model', () => {
  it('picks an item up with a click and drops it on an empty tile', async () => {
    const { fetchMock } = renderBag([fists, potion], (bag) => ({
      [`POST /api/game/items/${potion.id}/move`]: () =>
        reply(bag, [fists, { ...potion, slot: 12 }]),
    }))

    await userEvent.click(await screen.findByRole('button', { name: 'Healing Powder' }))
    expect(cell('Healing Powder')).toHaveClass('opacity-0')
    await userEvent.click(screen.getByRole('button', { name: 'Tile 13' }))

    expect(requestBody(fetchMock, `POST /api/game/items/${potion.id}/move`)).toEqual({
      page: 0,
      slot: 12,
    })
    await waitFor(() => expect(cell('Healing Powder').style).toMatchObject({ top: '27px' }))
    expect(cell('Healing Powder')).not.toHaveClass('opacity-0')
    expect(screen.queryByRole('button', { name: 'Tile 13' })).not.toBeInTheDocument()
  })

  it('swaps the held item with the clicked one', async () => {
    const { fetchMock } = renderBag([fists, potion], (bag) => ({
      [`POST /api/game/items/${potion.id}/swap`]: () => reply(bag, [fists, potion]),
    }))
    await userEvent.click(await screen.findByRole('button', { name: 'Healing Powder' }))
    await userEvent.click(bagItem('Newbie Swiping Fists'))
    expect(requestBody(fetchMock, `POST /api/game/items/${potion.id}/swap`)).toEqual({
      targetId: fists.id,
    })
  })

  it('equips the held item on a fitting slot and refuses other slots', async () => {
    const { fetchMock } = renderBag([fists], (bag) => ({
      [`POST /api/game/items/${fists.id}/equip`]: () =>
        reply(bag, [{ ...fists, equippedSlot: 'Weapon', page: null, slot: null }]),
    }))
    await userEvent.click(await screen.findByRole('button', { name: 'Newbie Swiping Fists' }))

    const weapon = within(equipment()).getByRole('button', { name: 'Weapon slot' })
    expect(weapon.closest('li')).toHaveAttribute('data-fit', 'good')
    await userEvent.click(within(equipment()).getByRole('button', { name: 'Hat slot' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid Swap')
    expect(posted(fetchMock)).toHaveLength(0)

    await userEvent.click(weapon)
    expect(await within(equipment()).findByText(/Weapon:/)).toHaveTextContent(
      'Newbie Swiping Fists Equipped',
    )
    expect(screen.getByText('Your bag is empty.')).toBeVisible()
  })

  it('marks a slot red when the held gear is above your level', async () => {
    renderBag([{ ...fists, info: { ...fists.info!, level: 20 } }])
    await userEvent.click(await screen.findByRole('button', { name: 'Newbie Swiping Fists' }))
    expect(
      within(equipment()).getByRole('button', { name: 'Weapon slot' }).closest('li'),
    ).toHaveAttribute('data-fit', 'bad')
  })

  it('unequips a worn item onto the clicked tile', async () => {
    const worn = { ...fists, equippedSlot: 'Weapon', page: null, slot: null }
    const { fetchMock } = renderBag([worn], (bag) => ({
      [`POST /api/game/items/${fists.id}/unequip`]: () => reply(bag, [{ ...fists, slot: 20 }]),
    }))
    await userEvent.click(
      await within(await screen.findByRole('list', { name: 'Equipment' })).findByRole('button', {
        name: 'Newbie Swiping Fists',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Tile 21' }))

    expect(requestBody(fetchMock, `POST /api/game/items/${fists.id}/unequip`)).toEqual({
      page: 0,
      slot: 20,
    })
    expect(await within(equipment()).findByText(/Weapon:/)).toHaveTextContent('empty')
  })

  it('puts the held item back on a second click, Escape or a right click', async () => {
    renderBag([potion])
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    await userEvent.click(await screen.findByRole('button', { name: 'Healing Powder' }))
    now.mockReturnValue(2_000)
    await userEvent.click(bagItem('Healing Powder'))
    expect(cell('Healing Powder')).not.toHaveClass('opacity-0')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    now.mockReturnValue(3_000)
    await userEvent.click(bagItem('Healing Powder'))
    await userEvent.keyboard('{Escape}')
    expect(cell('Healing Powder')).not.toHaveClass('opacity-0')

    now.mockReturnValue(4_000)
    await userEvent.click(bagItem('Healing Powder'))
    fireEvent.contextMenu(bagItem('Healing Powder'))
    expect(cell('Healing Powder')).not.toHaveClass('opacity-0')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows a failed move as a red toast', async () => {
    renderBag([potion], () => ({
      [`POST /api/game/items/${potion.id}/move`]: () =>
        apiError(400, 'no_room', 'There is no room there.'),
    }))
    await userEvent.click(await screen.findByRole('button', { name: 'Healing Powder' }))
    await userEvent.click(screen.getByRole('button', { name: 'Tile 60' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('There is no room there.')
  })
})

describe('Inventory context menu', () => {
  it('opens on a double click with the entries in Reborn order', async () => {
    renderBag([{ ...potion, count: 5 }])
    await userEvent.dblClick(await screen.findByRole('button', { name: 'Healing Powder' }))

    const menu = screen.getByRole('menu', { name: 'Healing Powder' })
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((entry) => entry.textContent),
    ).toEqual(['Use', 'Use Multiple', 'Split', 'Sell', 'Lock', 'Link in Chat'])
    expect(cell('Healing Powder')).not.toHaveClass('opacity-0')
  })

  it('opens on a right click or Enter and closes with Escape; worn items have none', async () => {
    renderBag([potion, { ...club, equippedSlot: 'Weapon', page: null, slot: null }])
    const menu = await rightClickMenu('Healing Powder')
    expect(within(menu).getByRole('menuitem', { name: 'Use Healing Powder' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    bagItem('Healing Powder').focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menu', { name: 'Healing Powder' })).toBeVisible()
    await userEvent.keyboard('{Escape}')

    fireEvent.contextMenu(within(equipment()).getByRole('button', { name: 'Dogsmasher' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('uses an item and reports finished quests in a toast', async () => {
    const { fetchMock } = renderBag([potion], (bag) => ({
      [`POST /api/game/items/${potion.id}/use`]: () => {
        bag.items = [{ ...potion, count: 1 }]
        return json({ completed: [90002], character: { ...character, hp: 160 } })
      },
    }))
    const menu = await rightClickMenu('Healing Powder')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Use Healing Powder' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Quest complete: Weapon Equipment.')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(cell('Healing Powder')).not.toHaveTextContent('x2'))
    expect(posted(fetchMock)[0]?.[0]).toBe(`/api/game/items/${potion.id}/use`)
  })

  it('names the card a card box gave', async () => {
    renderBag([potion], () => ({
      [`POST /api/game/items/${potion.id}/use`]: () =>
        json({ completed: [], card: { cardId: 1, nameKey: 'reborn_card_1' }, character }),
    }))
    const menu = await rightClickMenu('Healing Powder')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Use Healing Powder' }))
    expect(await screen.findByRole('status')).toHaveTextContent('You found Hidden Land.')
  })

  it('uses several at once from the Use Multiple dialog', async () => {
    const stack = { ...potion, count: 5 }
    const { fetchMock } = renderBag([stack], (bag) => ({
      [`POST /api/game/items/${potion.id}/use-multiple`]: () =>
        json({ character, items: (bag.items = []), used: 5, completed: [] }),
    }))
    const menu = await rightClickMenu('Healing Powder')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Use Multiple Healing Powder' }),
    )

    const dialog = screen.getByRole('dialog', { name: 'Use Multiple Items' })
    expect(dialog).toHaveTextContent('Available: 5')
    const amount = within(dialog).getByRole('spinbutton', { name: 'Amount' })
    expect(amount).toHaveValue(1)
    await userEvent.click(within(dialog).getByRole('button', { name: 'MAX' }))
    expect(amount).toHaveValue(5)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use' }))

    expect(requestBody(fetchMock, `POST /api/game/items/${potion.id}/use-multiple`)).toEqual({
      amount: 5,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('splits two off a stack', async () => {
    const { fetchMock } = renderBag([{ ...potion, count: 5 }], (bag) => ({
      [`POST /api/game/items/${potion.id}/split`]: () => reply(bag, bag.items),
    }))
    const menu = await rightClickMenu('Healing Powder')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Split Healing Powder' }))
    expect(requestBody(fetchMock, `POST /api/game/items/${potion.id}/split`)).toEqual({ count: 2 })
  })

  it('sells a stack after the confirm prompt', async () => {
    const { fetchMock } = renderBag([potion], (bag) => ({
      'POST /api/game/items/sell': () => json({ character, items: (bag.items = []), earned: 10 }),
    }))
    let menu = await rightClickMenu('Healing Powder')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sell Healing Powder' }))
    const prompt = screen.getByRole('alertdialog', { name: 'Sell 2 Healing Powder for 10?' })
    await userEvent.click(within(prompt).getByRole('button', { name: 'Deny' }))
    expect(posted(fetchMock)).toHaveLength(0)

    menu = await rightClickMenu('Healing Powder')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sell Healing Powder' }))
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetchMock, 'POST /api/game/items/sell')).toEqual({
      inventoryIds: [potion.id],
    })
    expect(await screen.findByText('Your bag is empty.')).toBeVisible()
  })

  it('locks an item, which hides Sell; the lock icon unlocks it', async () => {
    const { fetchMock } = renderBag([potion], (bag) => ({
      [`POST /api/game/items/${potion.id}/lock`]: () => {
        const locked = !bag.items[0]!.locked
        return json({ character, items: (bag.items = [{ ...potion, locked }]), locked })
      },
    }))
    let menu = await rightClickMenu('Healing Powder')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Lock Healing Powder' }))
    const icon = await screen.findByRole('button', { name: 'Unlock Healing Powder' })

    menu = await rightClickMenu('Healing Powder')
    expect(within(menu).queryByRole('menuitem', { name: 'Sell Healing Powder' })).toBeNull()
    expect(within(menu).getByRole('menuitem', { name: 'Unlock Healing Powder' })).toBeEnabled()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(icon)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Unlock Healing Powder' })).toBeNull(),
    )
    expect(posted(fetchMock)).toHaveLength(2)
  })

  it('links an item in chat', async () => {
    const linked: string[] = []
    const stop = onItemLinkRequest((name) => linked.push(name))
    renderBag([potion])
    const menu = await rightClickMenu('Healing Powder')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Link Healing Powder in chat' }),
    )
    expect(linked).toEqual(['Healing Powder'])
    stop()
  })

  it('equips from the menu, disabled with a reason when the outfit cannot use it', async () => {
    const { fetchMock } = renderBag([fists, { ...club, fitsOutfit: false }], (bag) => ({
      [`POST /api/game/items/${fists.id}/equip`]: () => {
        bag.items = [{ ...fists, equippedSlot: 'Weapon', page: null, slot: null }]
        return json({ completed: [], character, items: bag.items })
      },
    }))
    let menu = await rightClickMenu('Dogsmasher')
    const equipClub = within(menu).getByRole('menuitem', { name: 'Equip Dogsmasher' })
    expect(equipClub).toBeDisabled()
    expect(equipClub).toHaveAccessibleDescription("Your outfit can't use this weapon.")
    await userEvent.keyboard('{Escape}')

    menu = await rightClickMenu('Newbie Swiping Fists')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Equip Newbie Swiping Fists' }),
    )
    expect(await within(equipment()).findByText(/Weapon:/)).toHaveTextContent('Equipped')
    expect(posted(fetchMock)).toHaveLength(1)
  })

  it('shows a failed equip as a red toast', async () => {
    renderBag([fists], () => ({
      [`POST /api/game/items/${fists.id}/equip`]: () =>
        apiError(400, 'wrong_class', 'Your outfit cannot use this kind of weapon.'),
    }))
    const menu = await rightClickMenu('Newbie Swiping Fists')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Equip Newbie Swiping Fists' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your outfit cannot use this kind of weapon.',
    )
  })

  it('appraises and repairs gear from the context menu', async () => {
    renderBag([fists], () => ({
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
              special: [],
              enhanceLevel: 0,
              enhanceMax: 0,
              inscribeLevel: 0,
              baseType: 1,
              level: 1,
              equipType: 'Weapon',
              attack: { min: 1, max: 2 },
              defense: 0,
              maxHp: 0,
              enhanceAttack: { min: 0, max: 0 },
              durability: 5,
              maxDurability: 10,
              sockets: [],
              maxSockets: 0,
            },
          },
        }),
      'POST /api/game/forge/appraise': () => json({ character }),
    }))
    const menu = await waitFor(async () => {
      const opened = await rightClickMenu('Newbie Swiping Fists')
      within(opened).getByRole('menuitem', { name: 'Repair Newbie Swiping Fists for 4 Stone' })
      return opened
    })
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Appraise Newbie Swiping Fists for 15 Stone' }),
    )
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})

describe('Inventory tooltip', () => {
  it('compares a bag item with the different one worn in its slot', async () => {
    renderBag([fists, { ...club, equippedSlot: 'Weapon', page: null, slot: null }, potion])
    await userEvent.hover(await screen.findByRole('button', { name: 'Newbie Swiping Fists' }))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Equipped Item')
    expect(tooltip).toHaveTextContent('Inventory Item')
    expect(tooltip).toHaveTextContent('Dogsmasher')

    await userEvent.unhover(bagItem('Newbie Swiping Fists'))
    await userEvent.hover(bagItem('Healing Powder'))
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('Inventory Item')

    // Holding an item hides tooltips.
    await userEvent.click(bagItem('Healing Powder'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

describe('Inventory equipment sets', () => {
  const setBar = () => screen.getByRole('group', { name: 'Equipment sets' })
  const setButton = (name: string) => within(setBar()).getByRole('button', { name })
  const wornClub = { ...club, equippedSlot: 'Weapon', equippedSet: 1, page: null, slot: null }

  it('marks the worn set, empty sets and the VIP sets, with their status tooltips', async () => {
    renderBag([wornClub])
    await within(await screen.findByRole('list', { name: 'Equipment' })).findByText(/Dogsmasher/)
    expect(setButton('I')).toHaveAttribute('aria-pressed', 'true')
    expect(setButton('I')).toHaveAttribute('data-state', 'active')
    expect(setButton('II')).toHaveAttribute('aria-pressed', 'false')
    expect(setButton('II')).toHaveAttribute('data-state', 'empty')
    for (const name of ['IV', 'V']) {
      expect(setButton(name)).toHaveAttribute('aria-disabled', 'true')
      expect(setButton(name)).toHaveAttribute('data-state', 'vip')
    }

    await userEvent.hover(setButton('I'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Set Status')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Has Equipment')
    await userEvent.hover(setButton('II'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Empty')
    await userEvent.hover(setButton('IV'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('VIP required for equipment sets')
    await userEvent.unhover(setButton('IV'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('switches sets through the server and shows the new set in the slots', async () => {
    const sword = { ...fists, equippedSlot: 'Weapon', equippedSet: 2, page: null, slot: null }
    const { fetchMock } = renderBag([wornClub, sword], (bag) => ({
      'POST /api/game/sets/active': () => {
        bag.items = [wornClub, sword]
        return json({ character: { ...character, activeSet: 2 }, items: bag.items })
      },
    }))
    expect(
      await within(await screen.findByRole('list', { name: 'Equipment' })).findByText(/Weapon:/),
    ).toHaveTextContent('Dogsmasher Equipped')

    await userEvent.click(setButton('I'))
    await userEvent.click(setButton('IV'))
    expect(posted(fetchMock)).toHaveLength(0)

    await userEvent.click(setButton('II'))
    expect(requestBody(fetchMock, 'POST /api/game/sets/active')).toEqual({ set: 2 })
    await waitFor(() => expect(setButton('II')).toHaveAttribute('aria-pressed', 'true'))
    expect(within(equipment()).getByText(/Weapon:/)).toHaveTextContent(
      'Newbie Swiping Fists Equipped',
    )
    // Items worn in another set stay out of the bag.
    expect(screen.getByText('Your bag is empty.')).toBeVisible()
  })

  it('opens sets IV and V to VIPs', async () => {
    renderBag([], undefined, { hero: { ...character, vipUntil: '2999-01-01T00:00:00Z' } })
    await waitFor(() => expect(setButton('IV')).not.toHaveAttribute('aria-disabled'))
    expect(setButton('V')).toHaveAttribute('data-state', 'empty')
  })

  it('compares a bag item only with what the worn set wears', async () => {
    renderBag([fists, { ...wornClub, equippedSet: 2 }])
    await userEvent.hover(await screen.findByRole('button', { name: 'Newbie Swiping Fists' }))
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('Equipped Item')
  })
})

describe('Inventory equipment', () => {
  it('shows every equipment slot, the outfit as an item', async () => {
    const ring = {
      ...fists,
      id: 'r1',
      itemId: 'i0000001',
      nameKey: 'lg_ring',
      equippedSlot: 'Ring',
    }
    renderBag([outfit, ring])
    await within(await screen.findByRole('list', { name: 'Equipment' })).findByText(/Ggio Vega/)
    expect(
      within(equipment())
        .getAllByRole('listitem')
        .map((slot) => slot.textContent),
    ).toEqual([
      '+1Outfit: Ggio Vega +1',
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

  it('draws the weapon slot for the outfit weapon class', async () => {
    renderBag([], undefined, { hero: { ...character, weaponClass: 2 } })
    const weapon = await within(await screen.findByRole('list', { name: 'Equipment' })).findByText(
      'Weapon: empty',
    )
    await waitFor(() =>
      expect(weapon.closest('li')!.getAttribute('style')).toContain('--ui-slot-weapon-sharp'),
    )
  })

  it('opens Manage Outfit from the outfit slot, whose click does nothing', async () => {
    renderBag([potion, outfit])
    const slot = await within(await screen.findByRole('list', { name: 'Equipment' })).findByRole(
      'button',
      { name: 'Ggio Vega +1' },
    )
    await userEvent.click(slot)
    expect(screen.queryByRole('button', { name: 'Tile 1' })).not.toBeInTheDocument()
    await userEvent.hover(slot)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Item Type:Outfit')

    fireEvent.contextMenu(slot)
    const menu = screen.getByRole('menu', { name: 'Ggio Vega +1' })
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Manage' }))
    const dialog = screen.getByRole('dialog', { name: 'Manage Outfit' })
    expect(dialog).toHaveTextContent('Stat Outfit')
    expect(dialog).toHaveTextContent('Ggio Vega +1')
    expect(dialog).toHaveTextContent('Visual Outfit')
    expect(dialog).toHaveTextContent('Changing the visual outfit costs 250 gold.')
    expect(within(dialog).getByRole('button', { name: 'Choose Visual Outfit' })).toBeEnabled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the Reborn side buttons', async () => {
    renderBag([])
    for (const name of ['Compose', 'Multi Sell', 'Collection', 'Wardrobe', 'Reroll', 'Sort'])
      expect(await screen.findByRole('button', { name })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Talent' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Blood Limit' })).toBeEnabled()
    const hide = screen.getByRole('checkbox', { name: 'Hide' })
    expect(hide.closest('label')).toHaveAttribute('title', 'Click to hide detailed stats')
  })

  it('Hide sets the stats privacy and shows it checked', async () => {
    const { fetchMock } = renderBag([], () => ({
      'POST /api/game/character/privacy': () =>
        json({ character: { ...character, hideStats: true } }),
    }))
    const hide = await screen.findByRole('checkbox', { name: 'Hide' })
    await waitFor(() => expect(hide).toBeEnabled())
    expect(hide).not.toBeChecked()
    await userEvent.click(hide)
    expect(requestBody(fetchMock, 'POST /api/game/character/privacy')).toEqual({
      hideStats: true,
    })
    await waitFor(() => expect(hide).toBeChecked())
  })

  it('draws the outfit pose, and drops it when the outfit has none', async () => {
    renderBag([])
    const pose = await waitFor(() => {
      const img = document.querySelector('img[src^="/assets/reborn/poses/"]')
      expect(img).not.toBeNull()
      return img!
    })
    expect(pose).toHaveAttribute('src', `/assets/reborn/poses/${character.clothing}.webp`)
    fireEvent.error(pose)
    expect(document.querySelector('img[src^="/assets/reborn/poses/"]')).toBeNull()
  })

  it('rotates the slot 1 bloodline art behind the pose', async () => {
    renderBag([], () => ({
      'GET /api/game/bloodlines': () =>
        json(
          bloodlinesView({
            3: { unlocked: true, active: true, activeSlot: 1 },
            7: { unlocked: true, active: true, activeSlot: 0 },
          }),
        ),
    }))
    const art = await screen.findByTestId('bloodline-background')
    expect(art).toHaveAttribute('src', '/assets/reborn/icons/bloodlines/bg/7.webp')
    expect(art).toHaveClass('bloodline-spin')
    // Drawn before (under) the pose.
    const pose = document.querySelector('img[src^="/assets/reborn/poses/"]')!
    expect(art.compareDocumentPosition(pose) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws no bloodline art while slot 1 is empty', async () => {
    const { fetchMock } = renderBag([], () => ({
      'GET /api/game/bloodlines': () =>
        json(bloodlinesView({ 3: { unlocked: true, active: true, activeSlot: 1 } })),
    }))
    await waitFor(() =>
      expect(document.querySelector('img[src^="/assets/reborn/poses/"]')).not.toBeNull(),
    )
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/game/bloodlines', expect.anything()),
    )
    expect(screen.queryByTestId('bloodline-background')).not.toBeInTheDocument()
  })

  it('shows the Battle Power under the pose, short with the full number on hover', async () => {
    renderBag([], () => ({
      'GET /api/game/character': () =>
        json({ character, stats: { ...stats, battlePower: 31_234 } }),
    }))
    const power = await screen.findByLabelText('Battle Power 31,234')
    expect(power).toHaveTextContent('BP: 31.2K')
    expect(power.parentElement).toHaveAttribute('title', '31,234')
  })
})

describe('Inventory gems', () => {
  const ruby: InventoryItem = {
    ...potion,
    id: '00000000-0000-7000-8000-0000000000b1',
    itemId: 'i110101',
    count: 1,
    nameKey: 'lg_Gem121_itemname',
    slot: 5,
    info: {
      kind: 'other',
      level: 0,
      sellPrice: 100,
      stack: 1,
      w: 1,
      h: 1,
      class: 'JewelItem',
      gem: { name: 'StrengthEquip', value: 1400, level: 1 },
    },
  }
  const socketedGear = (sockets: unknown[]) => ({
    [fists.id]: {
      appraised: true,
      appraiseCost: 15,
      repairCost: 0,
      identifyCount: 0,
      props: [],
      inscription: [],
      special: [],
      enhanceLevel: 0,
      enhanceMax: 12,
      inscribeLevel: 0,
      baseType: 1,
      level: 1,
      equipType: 'Weapon',
      attack: { min: 1, max: 2 },
      defense: 0,
      maxHp: 0,
      enhanceAttack: { min: 0, max: 0 },
      durability: 10,
      maxDurability: 10,
      sockets,
      maxSockets: 3,
    },
  })

  it('sockets a held gem into the clicked gear (Reborn gemInsert)', async () => {
    const { fetchMock } = renderBag([fists, ruby], () => ({
      'POST /api/game/forge/gems/insert': () => json({ character }),
    }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ruby Level 1' }))
    await userEvent.click(bagItem('Newbie Swiping Fists'))
    expect(requestBody(fetchMock, 'POST /api/game/forge/gems/insert')).toEqual({
      itemId: fists.id,
      gemId: ruby.id,
    })
  })

  it('shows the gem’s stat in its tooltip and has no Use entry', async () => {
    renderBag([ruby])
    await userEvent.hover(await screen.findByRole('button', { name: 'Ruby Level 1' }))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Item Type:Gem')
    expect(tooltip).toHaveTextContent('Required Level:1')
    expect(tooltip).toHaveTextContent('Strength+14')
    await userEvent.unhover(bagItem('Ruby Level 1'))
    const menu = await rightClickMenu('Ruby Level 1')
    expect(within(menu).queryByRole('menuitem', { name: /^Use / })).not.toBeInTheDocument()
  })

  it('lists socketed gems in the tooltip and removes them from the menu', async () => {
    const gem = { itemId: 'i110101', nameKey: 'lg_Gem121_itemname', name: 'StrengthEquip' }
    const { fetchMock } = renderBag([fists], () => ({
      'GET /api/game/forge/gear': () =>
        json({ gear: socketedGear([{ ...gem, value: 1400 }, null]) }),
      'POST /api/game/forge/gems/remove': () => json({ character }),
    }))
    const button = await screen.findByRole('button', { name: 'Newbie Swiping Fists' })
    await waitFor(async () => {
      await userEvent.hover(button)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Socketed Gems')
    })
    const sockets = within(screen.getByRole('tooltip')).getByRole('list', {
      name: 'Socketed Gems',
    })
    expect(sockets).toHaveTextContent('Strength+14')
    expect(sockets).toHaveTextContent('Open Socket')
    await userEvent.unhover(button)

    const menu = await rightClickMenu('Newbie Swiping Fists')
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Remove Gems Newbie Swiping Fists' }),
    )
    expect(requestBody(fetchMock, 'POST /api/game/forge/gems/remove')).toEqual({
      itemId: fists.id,
    })
  })
})
