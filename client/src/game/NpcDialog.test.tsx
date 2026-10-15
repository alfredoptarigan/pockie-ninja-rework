import type { QuestHandIn } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { character, equipOffer, villageScene } from '../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { useTalk } from './api'
import { NpcDialog } from './NpcDialog'
import type { SceneNpc } from './types'
import { OpenWindowProvider } from './windows'

const elder = villageScene.npcs[0]!

/** Talks to the Elder on mount, like GameApp does when an NPC is opened. */
function Conversation() {
  const talk = useTalk()
  const { mutate } = talk
  useEffect(() => mutate(elder.id), [mutate])
  return <NpcDialog npc={elder} talk={talk} character={character} onClose={vi.fn()} />
}

const handIn: QuestHandIn = {
  taskId: 90000,
  exp: 5,
  stone: 100,
  gold: 0,
  giftCoupon: 10,
  honor: 0,
  items: [{ itemId: 'i159104', count: 1, nameKey: 'lg_Debris159104_itemname' }],
  levelsGained: 0,
}

function renderConversation(talkBody: object) {
  mockApi({
    'POST /api/game/npcs/n11001/talk': () => json({ ...talkBody, character }),
    'GET /api/game/quests/available': () =>
      json({
        available: [
          {
            ...equipOffer,
            rewards: { ...handIn, exp: 10, stone: 0, items: [] },
          },
        ],
        completed: [90000, 90001],
      }),
    'GET /api/game/quests': () => json({ quests: [] }),
    'GET /api/game/scene': () => json(villageScene),
    'GET /api/game/inventory': () => json({ items: [] }),
  })
  renderWithProviders(<Conversation />)
}

describe('NpcDialog', () => {
  it('shows the items a handed-in quest granted', async () => {
    renderConversation({
      dialogKey: 'lg_Say_n11001',
      nameKey: 'lg_name_n11001',
      completed: [90000],
      rewards: [handIn],
    })
    const received = await screen.findByRole('group', { name: /^Received for / })
    expect(received).toHaveTextContent('EXP +5, Stone +100, Coupons +10')
    expect(within(received).getByRole('img', { name: 'Lv.1 Newbie Pack' })).toBeVisible()
  })

  it('still works with a talk result without rewards', async () => {
    renderConversation({ dialogKey: 'lg_Say_n11001', nameKey: 'lg_name_n11001', completed: [] })
    expect(await screen.findByRole('button', { name: 'Quests' })).toBeVisible()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('lists one row per quest on offer with Back and End Conversation, like Reborn', async () => {
    renderConversation({ dialogKey: 'lg_Say_n11001', nameKey: 'lg_name_n11001', completed: [] })
    const options = await screen.findByRole('list', { name: 'Options' })
    expect(
      within(options)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Quests', 'End Conversation'])

    await userEvent.click(within(options).getByRole('button', { name: 'Quests' }))
    const offered = screen.getByRole('region', { name: 'Quests offered' })
    const row = within(offered).getByRole('article', { name: 'Weapon Equipment' })
    expect(row).toHaveTextContent('Accept quest: Weapon Equipment')
    expect(
      within(offered)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Accept quest: Weapon Equipment', 'Back', 'End Conversation'])

    await userEvent.click(within(offered).getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('list', { name: 'Options' })).toBeVisible()
  })

  it('offers no Quests option when the NPC has none', async () => {
    mockApi({
      'POST /api/game/npcs/n11001/talk': () =>
        json({ dialogKey: 'lg_Say_n11001', nameKey: 'lg_name_n11001', completed: [], character }),
      'GET /api/game/quests/available': () => json({ available: [], completed: [] }),
      'GET /api/game/quests': () => json({ quests: [] }),
    })
    renderWithProviders(<Conversation />)
    const options = await screen.findByRole('list', { name: 'Options' })
    expect(await within(options).findByRole('button', { name: 'End Conversation' })).toBeVisible()
    expect(within(options).queryByRole('button', { name: 'Quests' })).not.toBeInTheDocument()
  })
})

describe('NPC menus (Angel City, Demon City, Stone Organization)', () => {
  function renderMenu(npc: SceneNpc, who = character, onClose = vi.fn()) {
    const openWindow = vi.fn()
    const fetchMock = mockApi({
      [`POST /api/game/npcs/${npc.id}/talk`]: () => json({ completed: [], character: who }),
      'GET /api/game/quests/available': () => json({ available: [], completed: [] }),
      'POST /api/game/rest': () =>
        json({ cost: 117, character: { ...who, stone: who.stone - 117, hp: who.maxHp } }),
      'GET /api/game/scene': () => json(villageScene),
      'GET /api/game/quests': () => json({ quests: [] }),
      'GET /api/game/inventory': () => json({ items: [] }),
    })
    function Menu() {
      const talk = useTalk()
      const { mutate } = talk
      useEffect(() => mutate(npc.id), [mutate])
      return (
        <OpenWindowProvider value={openWindow}>
          <NpcDialog npc={npc} talk={talk} character={who} onClose={onClose} />
        </OpenWindowProvider>
      )
    }
    renderWithProviders(<Menu />)
    return { openWindow, fetchMock }
  }
  const npc = (id: string, menu: SceneNpc['menu']): SceneNpc => ({
    id,
    nameKey: `lg_name_${id}`,
    x: 0,
    y: 0,
    scale: 100,
    menu,
  })

  it('opens the Armory (our forge) from the Angel City Blacksmith, as Reborn words it', async () => {
    const { openWindow } = renderMenu(npc('n16003', 'forge'))
    await userEvent.click(await screen.findByRole('button', { name: 'Enter Armory' }))
    expect(openWindow).toHaveBeenCalledWith('forge', { npcId: 'n16003' })
  })

  it.each([
    ['n16004', 'shop', 'Browse Wares'],
    ['n16005', 'merchant', 'Browse Wares'],
    ['n17001', 'gates', 'Enter'],
    ['n16013', 'daily', 'Task Board'],
  ] as const)('routes %s to the %s window', async (id, menu, label) => {
    const { openWindow } = renderMenu(npc(id, menu))
    await userEvent.click(await screen.findByRole('button', { name: label }))
    expect(openWindow).toHaveBeenCalledWith(menu, { npcId: id })
  })

  const optionNames = () =>
    within(screen.getByRole('list', { name: 'Options' }))
      .getAllByRole('button')
      .map((button) => button.textContent)

  it("heals at the Stone Organization through Reborn's Recover HP & MP steps", async () => {
    const close = vi.fn()
    const { fetchMock } = renderMenu(
      npc('n26100', 'rest'),
      { ...character, level: 40, stone: 200 },
      close,
    )
    expect(await screen.findByRole('dialog', { name: 'Stone Organization' })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Recover HP & MP' }))
    expect(optionNames()).toEqual(['Healing Service (117 Stones)', 'Back', 'End Conversation'])
    await userEvent.click(screen.getByRole('button', { name: 'Healing Service (117 Stones)' }))
    expect(optionNames()).toEqual(['Yes, Heal Me (117 Stones)', 'Cancel', 'End Conversation'])
    expect(requestBody(fetchMock, 'POST /api/game/rest')).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: 'Yes, Heal Me (117 Stones)' }))
    expect(await screen.findByText('Healing complete!')).toBeVisible()
    expect(requestBody(fetchMock, 'POST /api/game/rest')).toEqual({ npcId: 'n26100' })
    await userEvent.click(screen.getByRole('button', { name: 'Thank you!' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('greys the Healing Service out without the Stones', async () => {
    renderMenu(npc('n26100', 'rest'), { ...character, level: 40, stone: 50 })
    await userEvent.click(await screen.findByRole('button', { name: 'Recover HP & MP' }))
    expect(screen.getByRole('button', { name: 'You need 117 stones' })).toBeDisabled()
  })

  it('heals for free at once while the rest costs nothing', async () => {
    const { fetchMock } = renderMenu(npc('n26100', 'rest'), { ...character, level: 5 })
    await userEvent.click(await screen.findByRole('button', { name: 'Recover HP & MP' }))
    await userEvent.click(screen.getByRole('button', { name: 'Free Healing' }))
    expect(await screen.findByText('Healing complete!')).toBeVisible()
    expect(requestBody(fetchMock, 'POST /api/game/rest')).toEqual({ npcId: 'n26100' })
  })

  it('opens the Team Board at the Stone Organization', async () => {
    const { openWindow } = renderMenu(npc('n26100', 'rest'))
    await userEvent.click(await screen.findByRole('button', { name: 'Team Board' }))
    expect(openWindow).toHaveBeenCalledWith('teamBoard', { npcId: 'n26100' })
  })

  it('offers no window to a talk-only NPC', async () => {
    renderMenu(npc('n16001', null))
    expect(await screen.findByRole('button', { name: 'End Conversation' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Browse Wares' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recover HP & MP' })).not.toBeInTheDocument()
  })
})
