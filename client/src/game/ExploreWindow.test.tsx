import type { Character } from '@pockie/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { character, fists, villageScene } from '../test/game'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { ExploreWindow } from './ExploreWindow'
import { mountBattle } from './phaser'
import type { ExploreResult, ExploreView, InventoryItem, Replay, SceneView } from './types'

const FREE = 'Smelting Mountains Exploration Zone'
const EXPERT = 'Smelting Mountains Exploration Zone Expert'

const ninja: Character = { ...character, sceneId: 2101 }
const field: SceneView = {
  ...villageScene,
  sceneId: 2101,
  nameKey: 'lg_Scene_BackGround_2101',
  npcs: [],
  exploreSpots: ['21011', '21012'],
}
const view: ExploreView = {
  remaining: 6,
  total: 7,
  cooldownEndsAt: null,
  spots: [
    {
      id: '21011',
      nameKey: 'lg_OutSearch_21011',
      requireLevel: 1,
      requireItems: [],
      star: { level: 1, progress: 1, perStar: 2 },
    },
    {
      id: '21012',
      nameKey: 'lg_OutSearch_21012',
      requireLevel: 1,
      requireItems: [{ itemId: 'i150046', count: 1 }],
      star: { level: 0, progress: 0, perStar: 4 },
    },
  ],
}
const resting = (ms: number) => ({
  ...view,
  cooldownEndsAt: new Date(Date.now() + ms).toISOString(),
})

const found: ExploreResult = {
  spotId: '21011',
  star: { level: 2, progress: 0, perStar: 2 },
  starBonus: { type: 'exp', exp: 115 },
  card: { type: 'item', itemId: 'i160006', bound: false, granted: true },
  otherCards: [
    { type: 'stone', amount: 671 },
    { type: 'fight', monsterId: 'n330261' },
    { type: 'nothing' },
    { type: 'game' },
  ],
  fight: null,
  rewards: { exp: 115, stone: 0, items: [{ itemId: 'i160006', bound: false }], levelsGained: 1 },
  completed: [],
  explore: { remaining: 5, total: 7, cooldownEndsAt: resting(300_000).cooldownEndsAt },
  character: { ...ninja, level: 2 },
}

const replay: Replay = {
  seed: 1,
  winner: 'attackers',
  events: [{ actor: 0, event: 1 }],
  fighters: [
    { index: 0, side: 'attackers', name: 'Ninja_01', level: 1, maxHp: 160, startHp: 160, hp: 150 },
    {
      index: 1,
      side: 'defenders',
      name: 'lg_name_n33026',
      level: 6,
      maxHp: 30,
      startHp: 30,
      hp: 0,
    },
  ],
}
const fought: ExploreResult = {
  ...found,
  starBonus: null,
  card: { type: 'fight', monsterId: 'n330261', granted: true },
  fight: { replay, won: true },
  rewards: { exp: 20, stone: 5, items: [], levelsGained: 0 },
}

function Harness({ who = ninja, scene = field }: { who?: Character; scene?: SceneView }) {
  const [open, setOpen] = useState(false)
  return <ExploreWindow character={who} scene={scene} open={open} onOpenChange={setOpen} />
}

const api = (
  handlers: Record<string, () => Response> = {},
  { explore = view, items = [fists] }: { explore?: ExploreView; items?: InventoryItem[] } = {},
) =>
  mockApi({
    'GET /api/game/explore': () => json(explore),
    'GET /api/game/inventory': () => json({ items }),
    ...handlers,
  })

const calls = (fetchMock: ReturnType<typeof mockApi>, key: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      `${init?.method ?? 'GET'} ${new URL(String(input), 'http://x').pathname}` === key,
  ).length

async function openWindow() {
  await userEvent.click(await screen.findByRole('button', { name: 'Explore' }))
  return screen.findByRole('dialog', { name: 'Exploration' })
}

async function exploreFree() {
  const dialog = await openWindow()
  // The bag has loaded (key counts are shown).
  await within(dialog).findByText(/you have 0/)
  await userEvent.click(within(dialog).getByRole('button', { name: `Explore ${FREE}` }))
  const confirm = await screen.findByRole('dialog', { name: 'Start Exploring?' })
  await userEvent.click(within(confirm).getByRole('button', { name: 'Explore' }))
}

describe('ExploreWindow', () => {
  it('is not offered in scenes without explore spots', () => {
    const fetchMock = api()
    renderWithProviders(<Harness scene={villageScene} />)
    expect(screen.queryByRole('button', { name: 'Explore' })).not.toBeInTheDocument()
    expect(calls(fetchMock, 'GET /api/game/explore')).toBe(0)
  })

  it('lists the spots with level, cost, stars and the searches left today', async () => {
    api()
    renderWithProviders(<Harness />)
    expect(await screen.findByText('6 / 7 today')).toBeInTheDocument()

    const dialog = await openWindow()
    expect(dialog).toHaveTextContent('Searches left today6 / 7')
    expect(dialog).toHaveTextContent('Next searchReady')

    const free = within(dialog).getByRole('region', { name: FREE })
    expect(free).toHaveTextContent('Level1+')
    expect(free).toHaveTextContent('CostFree')
    expect(within(free).getByRole('img', { name: '1 of 5 stars' })).toBeInTheDocument()
    expect(free).toHaveTextContent('1 / 2 searches to the next star')
    expect(within(free).getByRole('button', { name: `Explore ${FREE}` })).toBeEnabled()

    // The expert spot takes a key the bag does not hold.
    const expert = within(dialog).getByRole('region', { name: EXPERT })
    expect(
      within(expert).getByRole('img', { name: 'Smelting Mountains Secret Key' }),
    ).toBeInTheDocument()
    expect(expert).toHaveTextContent('1 x Smelting Mountains Secret Key (you have 0)')
    const button = within(expert).getByRole('button', { name: `Explore ${EXPERT}` })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(
      'You need 1 x Smelting Mountains Secret Key to explore there.',
    )
  })

  it('explores after a confirmation, shows what was found and refreshes the game', async () => {
    const fetchMock = api({ 'POST /api/game/explore/21011': () => json(found) })
    renderWithProviders(<Harness />)

    // Cancelling sends nothing.
    const dialog = await openWindow()
    await userEvent.click(within(dialog).getByRole('button', { name: `Explore ${FREE}` }))
    const confirm = await screen.findByRole('dialog', { name: 'Start Exploring?' })
    expect(confirm).toHaveTextContent(`Explore ${FREE}?`)
    expect(confirm).toHaveTextContent('This uses 1 of your 6 searches left today.')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(calls(fetchMock, 'POST /api/game/explore/21011')).toBe(0)

    await userEvent.click(within(dialog).getByRole('button', { name: `Explore ${FREE}` }))
    const again = await screen.findByRole('dialog', { name: 'Start Exploring?' })
    await userEvent.click(within(again).getByRole('button', { name: 'Explore' }))

    const result = await screen.findByRole('dialog', { name: 'Exploration Result' })
    expect(result).toHaveTextContent('You found Healing Powder.')
    expect(result).toHaveTextContent('New star! Bonus: 115 EXP.')
    expect(within(result).getByRole('img', { name: '2 of 5 stars' })).toBeInTheDocument()
    expect(result).toHaveTextContent('EXP+115')
    expect(within(result).getByRole('img', { name: 'Healing Powder' })).toHaveAttribute(
      'src',
      '/assets/game/items/icon_resume6.webp',
    )
    expect(result).toHaveTextContent('Level up! You are now level 2.')
    const others = within(result).getByRole('list', { name: 'The other cards held' })
    expect(others).toHaveTextContent('671 Stone')
    expect(others).toHaveTextContent('A fight with Sushi')
    expect(calls(fetchMock, 'POST /api/game/explore/21011')).toBe(1)

    // The spots, bag and the rest of the game state are fetched again.
    await waitFor(() => expect(calls(fetchMock, 'GET /api/game/explore')).toBe(2))
    expect(calls(fetchMock, 'GET /api/game/inventory')).toBe(2)

    await userEvent.click(within(result).getByRole('button', { name: 'Back to Exploration' }))
    expect(await screen.findByRole('dialog', { name: 'Exploration' })).toBeVisible()
  })

  it('plays an explore fight in the battle replay before the result', async () => {
    api(
      { 'POST /api/game/explore/21011': () => json(fought) },
      { items: [{ ...fists, equippedSlot: 'Weapon' }] },
    )
    renderWithProviders(<Harness />)

    await exploreFree()

    // The stub stage ends the replay at once.
    const result = await screen.findByRole('dialog', { name: 'Exploration Result' })
    expect(result).toHaveTextContent('You ran into Sushi and won the fight.')
    expect(result).toHaveTextContent('Stone+5')
    // Explore monsters are level variants drawn with their base monster's art.
    expect(mountBattle).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ replay, monsterIds: ['n33026'], weaponItemId: fists.itemId }),
    )
    const before = vi.mocked(mountBattle).mock.calls.length
    await userEvent.click(within(result).getByRole('button', { name: 'Replay Battle' }))
    expect(await screen.findByRole('dialog', { name: 'Exploration Result' })).toBeVisible()
    expect(vi.mocked(mountBattle).mock.calls.length).toBe(before + 1)
  })

  it('counts down the rest and keeps exploring locked until it ends', async () => {
    api({}, { explore: resting(272_500) })
    renderWithProviders(<Harness />)
    expect(await screen.findByText(/^Rest 4:3\d$/)).toBeInTheDocument()

    const dialog = await openWindow()
    const button = within(dialog).getByRole('button', { name: `Explore ${FREE}` })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/^Resting\. You can explore again in 4:3\d\.$/)
  })

  it('locks exploring when today’s searches are used up', async () => {
    api({}, { explore: { ...view, remaining: 0 } })
    renderWithProviders(<Harness />)
    const dialog = await openWindow()
    expect(
      within(dialog).getByRole('button', { name: `Explore ${FREE}` }),
    ).toHaveAccessibleDescription('You cannot explore any more today.')
  })

  it('locks exploring while defeated', async () => {
    api()
    renderWithProviders(<Harness who={{ ...ninja, hp: 0 }} />)
    const dialog = await openWindow()
    const button = within(dialog).getByRole('button', { name: `Explore ${FREE}` })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('You were defeated. Revive first.')
  })

  it('shows why the server refused and fetches the spots again', async () => {
    const fetchMock = api({
      'POST /api/game/explore/21011': () =>
        apiError(400, 'no_stone', 'You do not have enough Stone.'),
    })
    renderWithProviders(<Harness />)

    await exploreFree()

    const dialog = await screen.findByRole('dialog', { name: 'Exploration' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You do not have enough Stone.',
    )
    await waitFor(() => expect(calls(fetchMock, 'GET /api/game/explore')).toBe(2))
  })
})
