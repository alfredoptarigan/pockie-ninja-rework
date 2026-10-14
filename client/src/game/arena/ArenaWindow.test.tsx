import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { mountBattle } from '../phaser'
import type { Replay } from '../types'
import { ArenaWindow } from './ArenaWindow'
import type {
  ArenaFightResult,
  ArenaLogView,
  ArenaSlotView,
  ArenaView,
  DuelView,
  HonorShopView,
} from '../../../../shared/src/schemas/arena'

const ninja = { ...character, gold: 50, honor: 300 }
const replay: Replay = { seed: 1, fighters: [], events: [], winner: 'attackers' }

const slots: ArenaSlotView[] = Array.from({ length: 18 }, (_, slot) =>
  slot === 0
    ? {
        slot,
        beaten: false,
        kind: 'player',
        characterId: 'c1',
        name: 'Rival_01',
        level: 30,
        clothing: 1,
        tier: 2,
        score: 101000,
        place: 4,
      }
    : { slot, beaten: slot === 1, kind: 'npc', npcId: `n4010${slot}`, level: 5, score: 93700 },
)

const view = (overrides: Partial<ArenaView> = {}): ArenaView => ({
  tier: 2,
  score: 100500,
  place: 9,
  streak: 3,
  fights: 10,
  wins: 6,
  winRate: 60,
  honor: 300,
  freeTriesLeft: 5,
  triesBought: 0,
  maxBought: 15,
  tryGold: 0,
  freeRefreshAt: null,
  refreshGold: 20,
  bossReady: false,
  bossNpcId: 'n310039',
  bossScore: 109900,
  slots,
  ...overrides,
})

const won: ArenaFightResult<Replay> = {
  replay,
  looks: [{ clothing: 1 }, { clothing: 2 }],
  won: true,
  scoreDelta: 1000,
  honor: 10,
  promotedTo: null,
  arena: view({ slots: slots.map((s) => (s.slot === 0 ? { ...s, beaten: true } : s)) }),
  character: ninja,
}

const log: ArenaLogView = {
  id: '5b0c3d38-8a6f-4b8a-9f43-6f0d1c2f9a11',
  kind: 'defense',
  opponentName: 'Rival_02',
  result: 0,
  scoreDelta: -900,
  honor: 0,
  streak: 0,
  createdAt: '2026-10-13T10:00:00Z',
  canRevenge: true,
}

const noop = () => {}
const open = () => renderWithProviders(<ArenaWindow character={ninja} onClose={noop} />)

describe('ArenaWindow', () => {
  it('loads the arena: rank, score, Honor, tries and 18 opponents in 3 rows', async () => {
    mockApi({ 'GET /api/game/arena': () => json(view()) })
    open()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    const summary = await screen.findByRole('region', { name: 'Your arena' })
    expect(within(summary).getByText('Prep III')).toBeInTheDocument()
    expect(within(summary).getByText('1005.00')).toBeInTheDocument()
    expect(within(summary).getByText('60% (6 / 10)')).toBeInTheDocument()
    expect(within(summary).getByText('Next fight: free')).toBeInTheDocument()
    for (const row of ['Row 1', 'Row 2', 'Row 3'])
      expect(within(screen.getByRole('list', { name: row })).getAllByRole('listitem')).toHaveLength(
        6,
      )
    expect(screen.getByText('Beaten')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh (free)' })).toBeEnabled()
    expect(screen.getByText('Reach a score of 1099.00 to challenge the boss.')).toBeInTheDocument()
  })

  it('attacks an opponent, plays the replay and shows the result', async () => {
    const fetch = mockApi({
      'GET /api/game/arena': () => json(view()),
      'POST /api/game/arena/fight': () => json(won),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Attack Rival_01' }))
    expect(await screen.findByText('Victory! Score +10.00, Honor +10.')).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/arena/fight')).toEqual({ slot: 0 })
  })

  it('asks before a fight that costs Gold', async () => {
    const fetch = mockApi({
      'GET /api/game/arena': () => json(view({ freeTriesLeft: 0, tryGold: 8 })),
      'POST /api/game/arena/fight': () => json(won),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Attack Rival_01' }))
    const confirm = screen.getByRole('group', { name: 'Confirm fight' })
    expect(confirm).toHaveTextContent('Attack Rival_01 for 8 Gold?')
    expect(requestBody(fetch, 'POST /api/game/arena/fight')).toBeUndefined()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Pay and fight' }))
    expect(await screen.findByText('Victory! Score +10.00, Honor +10.')).toBeInTheDocument()
  })

  it('blocks attacks with no tries left and shows server refusals', async () => {
    mockApi({
      'GET /api/game/arena': () => json(view({ freeRefreshAt: '2026-10-13T12:00:00Z' })),
      'POST /api/game/arena/fight': () =>
        apiError(400, 'list_changed', 'The opponent list changed. Please try again.'),
      'POST /api/game/arena/refresh': () =>
        apiError(400, 'no_gold', 'You do not have enough Gold.'),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Attack Rival_01' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The opponent list changed. Please try again.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Refresh (20 Gold)' }))
    expect(await screen.findByText('You do not have enough Gold.')).toBeInTheDocument()
  })

  it('disables attacks once every try of the day is used', async () => {
    mockApi({ 'GET /api/game/arena': () => json(view({ freeTriesLeft: 0, tryGold: null })) })
    open()
    expect(await screen.findByText('No tries left today.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attack Rival_01' })).toBeDisabled()
  })

  it('fights the boss and announces the promotion', async () => {
    const fetch = mockApi({
      'GET /api/game/arena': () => json(view({ bossReady: true })),
      'POST /api/game/arena/boss': () => json({ ...won, promotedTo: 3, honor: 1300 }),
    })
    open()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Challenge the boss for Prep IV' }),
    )
    expect(
      await screen.findByText('Victory! You were promoted to Prep IV. Honor +1300.'),
    ).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/arena/boss')).toEqual({})
  })

  it('lists the fight log, watches a replay and takes revenge', async () => {
    const fetch = mockApi({
      'GET /api/game/arena': () => json(view()),
      'GET /api/game/arena/logs': () => json({ logs: [log] }),
      [`GET /api/game/arena/logs/${log.id}`]: () =>
        json({
          replay,
          looks: [
            { clothing: 1, wingSprite: 'wing_duotian_3', aura: 'ki_lightning' },
            { clothing: 2 },
          ],
        }),
      'POST /api/game/arena/revenge': () => json({ ...won, won: false, scoreDelta: -500 }),
    })
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Fight Log' }))
    expect(await screen.findByText('Rival_02')).toBeInTheDocument()
    expect(screen.getByText('-9.00')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Watch the fight with Rival_02' }))
    // Both ninjas wear their outfits: the defending player is no npc.
    await vi.waitFor(() =>
      expect(mountBattle).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          clothing: 1,
          defenderLooks: [{ clothing: 2 }],
          // The attacker's wing and aura from its snapshot reach the battle.
          look: expect.objectContaining({ wingSprite: 'wing_duotian_3', aura: 'ki_lightning' }),
        }),
      ),
    )
    expect(await screen.findByRole('tab', { name: 'Fight Log' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Revenge on Rival_02' }))
    expect(await screen.findByText('Defeat. Score -5.00, Honor +10.')).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/arena/revenge')).toEqual({ logId: log.id })
  })
})

describe('Honor shop', () => {
  const shop: HonorShopView = {
    tier: 2,
    honor: 300,
    offers: [
      { itemId: 'i292101', honor: 180, minTier: 0 },
      { itemId: 'i293101', honor: 520, minTier: 5 },
    ],
    exchange: { honor: 100, exp: 550 },
  }

  it('buys an item for Honor and trades Honor for EXP', async () => {
    let honor = shop.honor
    const after = (spent: number, extra = {}) => {
      honor -= spent
      return json({ shop: { ...shop, honor }, character: { ...ninja, honor }, ...extra })
    }
    const fetch = mockApi({
      'GET /api/game/arena': () => json(view()),
      'GET /api/game/arena/shop': () => json({ ...shop, honor }),
      'POST /api/game/arena/shop/buy': () => after(180),
      'POST /api/game/arena/shop/exchange': () => after(100, { levelsGained: 1 }),
    })
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Honor Shop' }))
    const offers = await screen.findByRole('list', { name: 'Honor shop' })
    const [cheap, locked] = within(offers).getAllByRole('button', { name: /^Buy / })
    expect(locked).toBeDisabled()
    expect(within(offers).getByText('Needs Pre-Academy')).toBeInTheDocument()

    await userEvent.click(cheap!)
    expect(requestBody(fetch, 'POST /api/game/arena/shop/buy')).toEqual({ itemId: 'i292101' })
    expect(await screen.findByText(/^You bought /)).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Exchange' }))
    expect(requestBody(fetch, 'POST /api/game/arena/shop/exchange')).toEqual({ units: 1 })
    expect(
      await screen.findByText('Exchanged 100 Honor for 550 EXP. Level up +1!'),
    ).toBeInTheDocument()
  })

  it('shows a refused purchase', async () => {
    mockApi({
      'GET /api/game/arena': () => json(view()),
      'GET /api/game/arena/shop': () => json(shop),
      'POST /api/game/arena/shop/buy': () =>
        apiError(400, 'bag_full', 'Your bag is full. Make room first.'),
    })
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Honor Shop' }))
    const offers = await screen.findByRole('list', { name: 'Honor shop' })
    await userEvent.click(within(offers).getAllByRole('button', { name: /^Buy / })[0]!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Your bag is full. Make room first.')
  })
})

describe('Ninjutsu Duel', () => {
  const duels = (tier: number): DuelView => ({
    tier,
    duelsUsed: 10,
    freeDuels: 10,
    duelGold: 2,
    candidates: [{ name: 'Rival_03', level: 40, clothing: 1, tier: 3, score: 111000 }],
    friends: [],
    logs: [],
  })

  it('needs Prep III', async () => {
    mockApi({
      'GET /api/game/arena': () => json(view({ tier: 1 })),
      'GET /api/game/arena/duels': () => json(duels(1)),
    })
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Ninjutsu Duel' }))
    expect(
      await screen.findByText('Ninjutsu Duels open at Prep III. Your rank is Prep II.'),
    ).toBeInTheDocument()
  })

  it('shows the free count, duels from the list and by name', async () => {
    const fetch = mockApi({
      'GET /api/game/arena': () => json(view()),
      'GET /api/game/arena/duels': () => json(duels(2)),
      'POST /api/game/arena/duel': (_url, init) =>
        JSON.parse(String(init?.body)).name === 'Nobody'
          ? apiError(400, 'unknown_name', 'There is no ninja with that name.')
          : json({ replay, looks: won.looks, won: true, duel: duels(2), character: ninja }),
    })
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Ninjutsu Duel' }))
    expect(
      await screen.findByText('Free duels left today: 0 / 10. Next duel: 2 Gold.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Duel Rival_03' }))
    expect(await screen.findByText('You won the duel with Rival_03.')).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/arena/duel')).toEqual({ name: 'Rival_03' })

    await userEvent.click(screen.getByRole('tab', { name: 'Ninjutsu Duel' }))
    await userEvent.type(await screen.findByLabelText('Duel by name'), 'Nobody')
    await userEvent.click(screen.getByRole('button', { name: 'Duel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('There is no ninja with that name.')
  })
})
