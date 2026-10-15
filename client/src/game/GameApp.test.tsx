import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  character,
  equipOffer,
  fists,
  newbiePackQuest,
  potion,
  stats,
  villageScene,
} from '../test/game'
import { createFakeSocket, type FakeSocket } from '../test/socket'
import { json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import GameApp from './GameApp'
import { mountPicture } from './phaser'
import type { Quest } from './types'

let socket: FakeSocket
vi.mock('../lib/socket', () => ({ createGameSocket: () => socket }))
beforeEach(() => {
  socket = createFakeSocket()
})

const field = {
  ...villageScene,
  sceneId: 2101,
  nameKey: 'lg_Scene_BackGround_2101',
  npcs: [{ id: 'n21001', nameKey: 'lg_name_n21001', x: 660, y: 906, scale: 100 }],
}

function renderGame(handlers: Parameters<typeof mockApi>[0] = {}, player = character) {
  const fetchMock = mockApi({
    'GET /api/game/character': () => json({ character: player, stats }),
    'GET /api/game/buffs': () => json({ buffs: [], titles: [] }),
    'GET /api/game/scene': () => json(player.sceneId === 111 ? villageScene : field),
    'GET /api/game/quests': () => json({ quests: [] }),
    'GET /api/game/quests/available': () => json({ available: [], completed: [] }),
    'GET /api/game/daily': () =>
      json({
        day: '2026-10-15',
        resetAt: new Date(Date.now() + 3600_000).toISOString(),
        refreshAt: new Date(Date.now() + 3600_000).toISOString(),
        accepted: 0,
        completed: 0,
        limit: 10,
        inProgressLimit: 10,
        quests: [],
      }),
    'GET /api/game/inventory': () => json({ items: [{ ...fists, equippedSlot: 'Weapon' }] }),
    'GET /api/health': () => json({ ok: true }),
    ...handlers,
  })
  renderWithProviders(<GameApp view="game" />, { route: '/play', path: '/play' })
  return fetchMock
}

const emptyKennel = {
  pets: [],
  petSlots: 1,
  maxSlots: 5,
  slotPrice: 100,
  digestPrice: 8,
  evolve: { level: 30, feathers: 50 },
  feathers: 0,
  lockItem: { itemId: 'i150406', nameKey: 'lg_x', count: 0 },
  removeItem: { itemId: 'i152027', nameKey: 'lg_y', count: 0 },
  foods: [],
  books: [],
}

describe('GameScreen', () => {
  it('opens the Skills window from the HUD and closes it', async () => {
    renderGame({
      'GET /api/game/skills': () =>
        json({
          learned: [],
          catalog: [],
          learnedThrough: 1,
          activeTree: 0,
          freeResets: 0,
          resetCost: 8,
          scrolls: [],
          trees: Array.from({ length: 5 }, () =>
            Array.from({ length: 6 }, (_, slot) => ({ slot, skillId: null, level: 0 })),
          ),
        }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Skills' }))
    const dialog = await screen.findByRole('dialog', { name: 'Skills' })
    expect(await within(dialog).findByRole('button', { name: 'Preset 1' })).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Skills' })).not.toBeInTheDocument()
  })

  it('lays the HUD over the scene', async () => {
    renderGame()

    expect(await screen.findByRole('heading', { name: 'Ninja_01' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'HP' })).toHaveAttribute('aria-valuenow', '120')
    expect(screen.getByRole('meter', { name: 'MP' })).toHaveAttribute('aria-valuenow', '30')
    expect(screen.getByRole('progressbar', { name: 'EXP' })).toHaveAttribute(
      'title',
      expect.stringMatching(/^5 \//),
    )
    expect(screen.getByTitle('100 stones')).toHaveTextContent('100')
    expect(screen.getByTitle('10 gift coupons')).toHaveTextContent('10')
    const location = screen.getByRole('region', { name: 'Location' })
    expect(await within(location).findByRole('heading', { name: 'Fire Village' })).toBeVisible()
    expect(within(location).getByRole('button', { name: 'Leave' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Quest Navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skills' })).not.toHaveAttribute('aria-disabled')
  }, 15_000)

  it('opens windows from the menu icons and closes them with Escape or X', async () => {
    renderGame({
      'GET /api/game/inventory': () => json({ items: [potion] }),
      'GET /api/game/quests': () => json({ quests: [newbiePackQuest] }),
    })
    const menu = await screen.findByRole('navigation', { name: 'Menu' })

    await userEvent.click(within(menu).getByRole('button', { name: 'Inventory' }))
    const bag = screen.getByRole('dialog', { name: 'Inventory' })
    expect(await within(bag).findByText('Healing Powder')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(within(menu).getByRole('button', { name: 'Character' }))
    const statsWindow = screen.getByRole('dialog', { name: 'Stats' })
    expect(statsWindow).toHaveTextContent('Ninja_01')
    await userEvent.click(within(statsWindow).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Reborn: Tasks shows and hides Quest Navigation.
    const tasks = within(menu).getByRole('button', { name: 'Tasks' })
    expect(await screen.findByRole('region', { name: 'Quest Navigation' })).toBeVisible()
    await userEvent.click(tasks)
    expect(screen.queryByRole('region', { name: 'Quest Navigation' })).not.toBeInTheDocument()
    await userEvent.click(tasks)
    expect(screen.getByRole('region', { name: 'Quest Navigation' })).toBeVisible()
  }, 15_000)

  it('opens the Market from the village icons, Social from the menu and Mail from the minimap', async () => {
    renderGame({
      'GET /api/game/social/mail/summary': () => json({ unread: 2, categories: [] }),
      'GET /api/game/social/friends': () => json({ friends: [], addBack: [], max: 50 }),
      'GET /api/game/social/blocks': () => json({ blocked: [], max: 50 }),
      'GET /api/game/social/mail': () => json({ mails: [] }),
    })
    const menu = await screen.findByRole('navigation', { name: 'Menu' })

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Features' })).getByRole('button', {
        name: 'Market',
      }),
    )
    expect(screen.getByRole('dialog', { name: 'Market' })).toHaveTextContent(
      'The Market opens at level 25.',
    )
    await userEvent.keyboard('{Escape}')

    await userEvent.click(within(menu).getByRole('button', { name: 'Social' }))
    expect(await screen.findByText('Your friends list is empty')).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Friends' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Escape}')

    await userEvent.click(await screen.findByRole('button', { name: 'Mail (2 unread)' }))
    expect(screen.getByRole('dialog', { name: 'Social' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Mail' })).toHaveAttribute('aria-selected', 'true')
  }, 15_000)

  it('hides the Player List in villages', async () => {
    renderGame({ 'GET /api/game/social/scene-players': () => json({ players: [] }) })
    await screen.findByRole('navigation', { name: 'Menu' })
    expect(screen.queryByRole('region', { name: 'Player List' })).toBeNull()
  })

  it('shows the Player List in a field', async () => {
    renderGame(
      { 'GET /api/game/social/scene-players': () => json({ players: [] }) },
      { ...character, sceneId: 2101 },
    )
    expect(await screen.findByRole('region', { name: 'Player List' })).toBeVisible()
  })

  it('opens the Card Room from Events, Wings and the Pet Kennel from the Character window', async () => {
    renderGame({
      'GET /api/game/events': () => json({}),
      'GET /api/game/cards': () => json({ collections: [] }),
      'GET /api/game/pets': () => json(emptyKennel),
      'GET /api/game/wings': () =>
        json({
          maxLevel: 30,
          equipped: null,
          owned: [],
          stones: [],
          talismans: [],
          rewardItemId: 'i218021',
          collection: [],
        }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Events' }))
    await userEvent.click(
      within(screen.getByRole('list', { name: 'Events' })).getByRole('button', {
        name: 'Card Room',
      }),
    )
    expect(await screen.findByRole('dialog', { name: 'Card Room' })).toBeVisible()
    await userEvent.keyboard('{Escape}')

    // Reborn: wings come from the Inventory's Collection button.
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('button', {
        name: 'Inventory',
      }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Collection' }))
    expect(await screen.findByRole('dialog', { name: 'Collection' })).toBeVisible()
  }, 15_000)

  it('opens the Pet Kennel and the Card Room from their village buildings', async () => {
    renderGame({
      'GET /api/game/pets': () => json(emptyKennel),
      'GET /api/game/cards': () => json({ collections: [] }),
    })
    await waitFor(() => expect(mountPicture).toHaveBeenCalled())
    const actions = vi.mocked(mountPicture).mock.calls.at(-1)![2]

    act(() => actions.onBuilding?.('clip_pet'))
    expect(await screen.findByRole('dialog', { name: 'Kennel' })).toBeVisible()
    await userEvent.keyboard('{Escape}')

    act(() => actions.onBuilding?.('clip_CardLink'))
    expect(await screen.findByRole('dialog', { name: 'Card Room' })).toBeVisible()
  })

  it('has Back to the website and Log out in the Settings window', async () => {
    renderGame()
    const settings = await screen.findByRole('button', { name: 'Settings' })
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()

    await userEvent.click(settings)
    const window = screen.getByRole('dialog', { name: 'Settings' })
    expect(within(window).getByRole('link', { name: 'Back to the website' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(within(window).getByRole('button', { name: 'Log out' })).toBeVisible()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('talks to an NPC and accepts the quest it offers', async () => {
    let quests: Quest[] = []
    const fetchMock = renderGame({
      'GET /api/game/quests': () => json({ quests }),
      'GET /api/game/quests/available': () =>
        json({ available: quests.length ? [] : [equipOffer], completed: [90000, 90001] }),
      'POST /api/game/npcs/n11001/talk': () =>
        json({
          dialogKey: 'lg_Say_n11001',
          nameKey: 'lg_name_n11001',
          completed: [90001],
          character,
        }),
      'POST /api/game/quests/90002/accept': () => {
        quests = [{ ...newbiePackQuest, taskId: 90002, nameKey: 'lg_Task_90002', steps: [] }]
        return json({ quests })
      },
    })

    const actions = await screen.findByRole('region', { name: 'Scene actions' })
    await userEvent.click(
      await within(actions).findByRole('button', { name: 'Fire Village Elder in the Hall' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Fire Village Elder in the Hall' })
    expect(await within(dialog).findByText(/Quest complete: Newbie Pack/)).toBeVisible()

    await userEvent.click(within(dialog).getByRole('button', { name: /^Quests/ }))
    const offers = within(dialog).getByRole('region', { name: 'Quests offered' })
    await userEvent.click(within(offers).getAllByRole('button', { name: 'Accept quest' })[0]!)

    expect(await within(dialog).findByText(/Quest accepted/)).toBeVisible()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/90002/accept'))).toBe(true)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'End Conversation' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 15_000)

  it('travels from the world map and locks areas above the player level', async () => {
    const fetchMock = renderGame({
      'POST /api/game/travel': () => json({ character: { ...character, sceneId: 2101 } }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'World Map' }))
    const map = screen.getByRole('dialog', { name: 'World Map' })

    expect(within(map).getAllByRole('button', { name: /Lv\. 11/ })[0]).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.click(within(map).getByRole('button', { name: 'Smelting Mountains' }))

    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2101, via: 'map' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('goes home with the Village button in a field', async () => {
    const fetchMock = renderGame(
      { 'POST /api/game/travel': () => json({ completed: [], character }) },
      { ...character, sceneId: 2101 },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Village' }))
    // SceneSystem.GoHome: the server picks the scene's ToScene or the home village.
    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ via: 'home' })
  })

  it('goes out to the first field with the Leave button in the village', async () => {
    const fetchMock = renderGame({
      'POST /api/game/travel': () => json({ character: { ...character, sceneId: 2101 } }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }))
    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ via: 'out' })
  })

  it('takes a scene exit with link travel', async () => {
    const fetchMock = renderGame(
      {
        'GET /api/game/scene': () => json({ ...field, links: [2103, 2102] }),
        'POST /api/game/travel': () => json({ character: { ...character, sceneId: 2102 } }),
      },
      { ...character, sceneId: 2101, level: 12 },
    )
    const exits = await screen.findByRole('navigation', { name: 'Exits' })
    // 2103 needs level 21.
    expect(within(exits).getByRole('button', { name: /Lv\. 21/ })).toBeDisabled()
    await userEvent.click(within(exits).getByRole('button', { name: /Eventide Barrens/ }))
    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2102, via: 'link' })
  })

  it('opens a feature window from an NPC menu, closing the conversation', async () => {
    renderGame({
      'GET /api/game/scene': () =>
        json({
          ...villageScene,
          npcs: [
            { id: 'n11003', nameKey: 'lg_name_n11003', x: 0, y: 0, scale: 100, menu: 'forge' },
          ],
        }),
      'POST /api/game/npcs/n11003/talk': () => json({ completed: [], character }),
    })
    const actions = await screen.findByRole('region', { name: 'Scene actions' })
    await userEvent.click(await within(actions).findByRole('button', { name: 'Blacksmith' }))
    const talk = await screen.findByRole('dialog', { name: 'Blacksmith' })
    await userEvent.click(await within(talk).findByRole('button', { name: 'Enter Armory' }))
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
    // The Blacksmith's menu opens the forge window registered in windows.tsx.
    expect(await screen.findByRole('dialog', { name: 'Forge' })).toBeInTheDocument()
  })
})

describe('character info', () => {
  it('shows the VP bar empty with its refill disabled (no Energy system yet)', async () => {
    renderGame()
    const card = await screen.findByRole('region', { name: 'Character' })
    expect(within(card).getByRole('meter', { name: 'VP' })).toHaveTextContent('0/200')
    expect(within(card).getByRole('button', { name: 'Energy refill' })).toBeDisabled()
  })

  it('shows the combat stats in the Character window and the pouches on the card', async () => {
    renderGame({}, { ...character, hpPouch: 1000 })
    const card = await screen.findByRole('region', { name: 'Character' })
    expect(within(card).getByLabelText('Pouches')).toHaveTextContent('HP pouch1,000 / 10,000')

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('button', {
        name: 'Character',
      }),
    )
    const statsWindow = screen.getByRole('dialog', { name: 'Stats' })
    expect(within(statsWindow).getByRole('region', { name: 'Profile' })).toHaveTextContent(
      'NameNinja_01Level1',
    )
    const combat = within(statsWindow).getByRole('region', { name: 'Combat stats' })
    // Attributes are stored x100 and rounded like Reborn; speed is 1000 / AtkTime.
    expect(await within(combat).findByText('8 - 9')).toBeVisible()
    expect(combat).toHaveTextContent('STR14')
    expect(combat).toHaveTextContent('Speed1.00')
    expect(combat).toHaveTextContent('HP120/160')
    expect(within(combat).getByText('154')).toHaveAttribute('title', '10.21% damage reduction')
    expect(combat).toHaveTextContent('Block2')
  })

  it('refills both pouches with Gift Coupons from the Carrier Bag (portrait refill icon)', async () => {
    const fetchMock = renderGame(
      { 'POST /api/game/pouches/buy': () => json({ completed: [], character }) },
      { ...character, giftCoupon: 20 },
    )
    await userEvent.click(await screen.findByRole('button', { name: /^HP carrier bag/ }))
    const bag = await screen.findByRole('dialog', { name: 'Carrier Bag' })
    expect(bag).toHaveTextContent('Fill both bags for 20 Gold or 20 Gift Coupons.')
    expect(within(bag).getByRole('button', { name: 'Buy with Gold' })).toBeDisabled()
    await userEvent.click(within(bag).getByRole('button', { name: 'Buy with Gift Coupons' }))
    expect(requestBody(fetchMock, 'POST /api/game/pouches/buy')).toEqual({
      currency: 'giftCoupon',
      hp: 'full',
      mp: 'full',
    })
  })
})

describe('defeat and revive', () => {
  const defeatedInField = { ...character, hp: 0, sceneId: 2101 }
  const fieldTerms = { homeExpLoss: 51, gold: 1, goldAllowed: true }
  const sceneWith = (revive = fieldTerms) => ({
    'GET /api/game/scene': () => json({ ...field, revive }),
  })

  it('offers to go home for EXP and blocks travel while defeated', async () => {
    const fetchMock = renderGame(
      {
        ...sceneWith(),
        'POST /api/game/revive': () => json({ character: { ...character, hp: 1 } }),
      },
      defeatedInField,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Defeated' })
    const home = within(dialog).getByRole('region', { name: 'Return to village' })
    expect(await within(home).findByText(/You lose 51 EXP/)).toBeVisible()
    const here = within(dialog).getByRole('region', { name: 'Revive here' })
    expect(here).toHaveTextContent('You need 1 Gold and have 0.')
    expect(within(here).getByRole('button', { name: 'Revive here' })).toBeDisabled()

    await userEvent.click(within(home).getByRole('button', { name: 'Return to village' }))
    expect(requestBody(fetchMock, 'POST /api/game/revive')).toEqual({ mode: 'home' })
  })

  it('revives on the spot for Gold', async () => {
    const fetchMock = renderGame(
      {
        ...sceneWith(),
        'POST /api/game/revive': () =>
          json({ character: { ...defeatedInField, hp: 160, gold: 4 } }),
      },
      { ...defeatedInField, gold: 5 },
    )
    const dialog = await screen.findByRole('dialog', { name: 'Defeated' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revive here' }))
    expect(requestBody(fetchMock, 'POST /api/game/revive')).toEqual({ mode: 'gold' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says why reviving here is closed and keeps travel locked after closing', async () => {
    renderGame(sceneWith({ ...fieldTerms, goldAllowed: false }), { ...defeatedInField, gold: 5 })
    const dialog = await screen.findByRole('dialog', { name: 'Defeated' })
    expect(await within(dialog).findByText('You cannot revive in this area.')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('button', { name: 'Village' })).toBeDisabled()
    // The HUD keeps a way back to the revive window.
    await userEvent.click(screen.getByRole('button', { name: 'Revive' }))
    expect(screen.getByRole('dialog', { name: 'Defeated' })).toBeVisible()
  })
})

describe('tutorial nudges', () => {
  const pack = { ...potion, id: 'p1', itemId: 'i159104', count: 1, nameKey: 'lg_x' }

  it('Go on the newbie pack step opens the bag and points at the pack', async () => {
    renderGame({
      'GET /api/game/quests': () =>
        json({
          quests: [
            {
              ...newbiePackQuest,
              steps: [{ ...newbiePackQuest.steps[0]!, command: 'use', itemId: 'i159104' }],
            },
          ],
        }),
      'GET /api/game/inventory': () => json({ items: [potion, pack] }),
    })
    const nav = await screen.findByRole('region', { name: 'Quest Navigation' })
    expect(await within(nav).findByText('Open your bag and use the item.')).toBeVisible()
    await userEvent.click(within(nav).getByRole('button', { name: 'Go: Newbie Pack' }))

    const bag = await screen.findByRole('dialog', { name: 'Inventory' })
    const marked = await within(bag).findByText('Next step')
    expect(marked.closest('li')).toHaveTextContent('Unknown item')
    expect(within(bag).getAllByText('Next step')).toHaveLength(1)
  })

  it('Go on the weapon step points at the unequipped weapons', async () => {
    renderGame({
      'GET /api/game/quests': () =>
        json({
          quests: [
            {
              ...newbiePackQuest,
              taskId: 90002,
              nameKey: 'lg_Task_90002',
              steps: [{ ...newbiePackQuest.steps[0]!, command: 'equip' }],
            },
          ],
        }),
      'GET /api/game/inventory': () =>
        json({
          items: [
            potion,
            { ...fists, fitsOutfit: true },
            { ...fists, id: 'stick', itemId: 'i250100', fitsOutfit: false },
          ],
        }),
    })
    const nav = await screen.findByRole('region', { name: 'Quest Navigation' })
    await userEvent.click(await within(nav).findByRole('button', { name: /^Go:/ }))
    const bag = await screen.findByRole('dialog', { name: 'Inventory' })
    const marked = await within(bag).findByText('Next step')
    fireEvent.contextMenu(within(marked.closest('li')!).getByRole('button'))
    expect(within(bag).getByRole('menuitem', { name: /^Equip/ })).toBeEnabled()
    // Only the weapon this outfit can wear is marked.
    expect(within(bag).getAllByText('Next step')).toHaveLength(1)
  })
})

describe('QuestNavigation', () => {
  const guardSquad: Quest = {
    taskId: 10002,
    state: 0,
    progress: [0],
    nameKey: 'lg_Task_10002',
    descriptionKey: 'lg_TaskDes_10002',
    steps: [{ descriptionKey: 'lg_SubTaskDes_10002', target: 1 }],
  }
  const fieldQuest: Quest = { ...guardSquad, taskId: 10003, nameKey: 'lg_Task_10003' }

  it('shows details, opens the quest NPC here and travels to other areas', async () => {
    const fetchMock = renderGame({
      'GET /api/game/quests': () => json({ quests: [guardSquad, fieldQuest] }),
      'GET /api/game/scene': () =>
        json({
          ...villageScene,
          npcs: [
            ...villageScene.npcs,
            { id: 'n11002', nameKey: 'lg_name_n11002', x: 0, y: 0, scale: 100 },
          ],
        }),
      'POST /api/game/npcs/n11002/talk': () =>
        json({ dialogKey: 'lg_Say_n11002', nameKey: 'lg_name_n11002', completed: [], character }),
      'POST /api/game/travel': () => json({ character: { ...character, sceneId: 2101 } }),
    })
    const nav = await screen.findByRole('region', { name: 'Quest Navigation' })
    const list = await within(nav).findByRole('list', { name: 'Accepted quests' })

    const details = await within(list).findByRole('button', { name: 'Details: Guard Squad' })
    await userEvent.click(details)
    expect(details).toHaveAttribute('aria-expanded', 'true')
    expect(within(list).getAllByText('0/1')[0]).toBeVisible()

    await userEvent.click(within(list).getByRole('button', { name: 'Go: Guard Squad' }))
    const dialog = await screen.findByRole('dialog', { name: 'Arena Master' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'End Conversation' }))

    await userEvent.click(within(list).getAllByRole('button', { name: /^Go:/ })[1]!)
    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2101 })
  })

  it('lists available quests and closes to a button', async () => {
    renderGame({
      'GET /api/game/quests/available': () =>
        json({ available: [equipOffer], completed: [90000, 90001] }),
      'POST /api/game/npcs/n11001/talk': () =>
        json({ dialogKey: 'lg_Say_n11001', nameKey: 'lg_name_n11001', completed: [], character }),
    })
    const nav = await screen.findByRole('region', { name: 'Quest Navigation' })
    // Nothing accepted: Reborn opens the panel on Available.
    expect(await within(nav).findByRole('tab', { name: 'Available', selected: true })).toBeVisible()

    const list = within(nav).getByRole('list', { name: 'Available quests' })
    expect(list).toHaveTextContent('Talk to Fire Village Elder in the Hall')
    await userEvent.click(within(list).getAllByRole('button', { name: /^Go:/ })[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Fire Village Elder in the Hall' })
    await userEvent.keyboard('{Escape}')
    expect(dialog).not.toBeInTheDocument()

    await userEvent.click(within(nav).getByRole('button', { name: 'Close Quest Navigation' }))
    expect(screen.queryByRole('region', { name: 'Quest Navigation' })).not.toBeInTheDocument()
  })
})
