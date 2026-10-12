import { screen, waitFor, within } from '@testing-library/react'
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
    'GET /api/game/scene': () => json(player.sceneId === 111 ? villageScene : field),
    'GET /api/game/quests': () => json({ quests: [] }),
    'GET /api/game/quests/available': () => json({ available: [], completed: [] }),
    'GET /api/game/inventory': () => json({ items: [{ ...fists, equippedSlot: 'Weapon' }] }),
    ...handlers,
  })
  renderWithProviders(<GameApp view="game" />, { route: '/play', path: '/play' })
  return fetchMock
}

describe('GameScreen', () => {
  it('lays the HUD over the scene', async () => {
    renderGame()

    expect(await screen.findByRole('heading', { name: 'Ninja_01' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'HP' })).toHaveAttribute('aria-valuenow', '120')
    expect(screen.getByRole('meter', { name: 'MP' })).toHaveAttribute('aria-valuenow', '30')
    expect(screen.getByRole('meter', { name: 'EXP' })).toHaveAttribute('aria-valuenow', '5')
    expect(screen.getByTitle('Stone')).toHaveTextContent('100')
    expect(screen.getByTitle('Coupons')).toHaveTextContent('10')
    const location = screen.getByRole('region', { name: 'Location' })
    expect(await within(location).findByRole('heading', { name: 'Fire Village' })).toBeVisible()
    expect(within(location).getByRole('button', { name: 'Leave' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Quest Navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skills (coming soon)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  }, 15_000)

  it('opens windows from the menu icons and closes them with Escape or X', async () => {
    renderGame({
      'GET /api/game/inventory': () => json({ items: [potion] }),
      'GET /api/game/quests': () => json({ quests: [newbiePackQuest] }),
    })
    const menu = await screen.findByRole('navigation', { name: 'Menu' })

    await userEvent.click(within(menu).getByRole('button', { name: 'Bag' }))
    const bag = screen.getByRole('dialog', { name: 'Inventory' })
    expect(await within(bag).findByText('Healing Powder')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(within(menu).getByRole('button', { name: 'Character' }))
    const statsWindow = screen.getByRole('dialog', { name: 'Stats' })
    expect(statsWindow).toHaveTextContent('Ninja_01')
    await userEvent.click(within(statsWindow).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(within(menu).getByRole('button', { name: 'Quests' }))
    const log = screen.getByRole('dialog', { name: 'Quest Log' })
    expect(await within(log).findByText('Newbie Pack')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 15_000)

  it('has Back to the website and Log out in the Settings menu', async () => {
    renderGame()
    const settings = await screen.findByRole('button', { name: 'Settings' })
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()

    await userEvent.click(settings)
    expect(settings).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Back to the website' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible()

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

    expect(within(map).getAllByRole('button', { name: /Lv\. 11/ })[0]).toBeDisabled()
    await userEvent.click(within(map).getByRole('button', { name: 'Smelting Mountains' }))

    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2101 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('goes home with the Village button in a field', async () => {
    const fetchMock = renderGame(
      { 'POST /api/game/travel': () => json({ character }) },
      { ...character, sceneId: 2101 },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Village' }))
    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 111 })
  })
})

describe('character info', () => {
  it('shows the combat stats and pouches in the Character window', async () => {
    renderGame({}, { ...character, hpPouch: 1000 })
    const card = await screen.findByRole('region', { name: 'Character' })
    expect(within(card).getByLabelText('Pouches')).toHaveTextContent('HP pouch1,000 / 10,000')

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('button', {
        name: 'Character',
      }),
    )
    const combat = within(screen.getByRole('dialog', { name: 'Stats' })).getByRole('region', {
      name: 'Combat stats',
    })
    // Attributes are stored x100; speed is 1000 / AtkTime; defence 154 takes 10% off.
    expect(await within(combat).findByText('8 - 9')).toBeVisible()
    expect(combat).toHaveTextContent('Strength13')
    expect(combat).toHaveTextContent('Speed1.00')
    expect(combat).toHaveTextContent('Defense154 (-10% damage)')
    expect(combat).toHaveTextContent('Block2')
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
      'GET /api/game/inventory': () => json({ items: [potion, fists] }),
    })
    const nav = await screen.findByRole('region', { name: 'Quest Navigation' })
    await userEvent.click(await within(nav).findByRole('button', { name: /^Go:/ }))
    const bag = await screen.findByRole('dialog', { name: 'Inventory' })
    const marked = await within(bag).findByText('Next step')
    expect(within(marked.closest('li')!).getByRole('button', { name: /^Equip/ })).toBeVisible()
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
    expect(await within(nav).findByText('No quests yet. Look in Available.')).toBeVisible()
    await userEvent.click(within(nav).getByRole('tab', { name: 'Available' }))

    const list = within(nav).getByRole('list', { name: 'Available quests' })
    expect(list).toHaveTextContent('Talk to Fire Village Elder in the Hall')
    await userEvent.click(within(list).getAllByRole('button', { name: /^Go:/ })[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Fire Village Elder in the Hall' })
    await userEvent.keyboard('{Escape}')
    expect(dialog).not.toBeInTheDocument()

    await userEvent.click(within(nav).getByRole('button', { name: 'Close Quest Navigation' }))
    expect(screen.getByRole('button', { name: 'Quest Navigation' })).toBeVisible()
  })
})
