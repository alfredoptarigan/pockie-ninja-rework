import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { character, newbiePackQuest, potion, villageScene } from '../test/game'
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
    'GET /api/game/character': () => json({ character: player }),
    'GET /api/game/scene': () => json(player.sceneId === 111 ? villageScene : field),
    'GET /api/game/quests': () => json({ quests: [] }),
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
    const stats = screen.getByRole('dialog', { name: 'Stats' })
    expect(stats).toHaveTextContent('Ninja_01')
    await userEvent.click(within(stats).getByRole('button', { name: 'Close' }))
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
