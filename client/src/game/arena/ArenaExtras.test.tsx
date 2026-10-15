import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { mountBattle } from '../phaser'
import type { Replay } from '../types'
import { ArenaWindow } from './ArenaWindow'
import type { ArenaView } from '../../../../shared/src/schemas/arena'
import type {
  ChampionshipView,
  SquadView,
  WeeklyView,
} from '../../../../shared/src/schemas/arena-extras'

const ninja = { ...character, level: 60, giftCoupon: 250 }
const replay: Replay = { seed: 1, fighters: [], events: [], winner: 'attackers' }
const noop = () => {}
const open = () => renderWithProviders(<ArenaWindow character={ninja} onClose={noop} />)

const arena: ArenaView = {
  tier: 2,
  score: 100500,
  place: 0,
  streak: 0,
  fights: 0,
  wins: 0,
  winRate: 0,
  honor: 0,
  freeTriesLeft: 0,
  triesBought: 0,
  maxBought: 15,
  tickets: 3,
  tryGold: 0,
  freeRefreshAt: null,
  refreshGold: 20,
  bossReady: false,
  bossNpcId: null,
  bossScore: null,
  slots: [],
}

const weekly: WeeklyView = {
  kind: 'arena',
  isMonday: false,
  week: '2026-10-12',
  currentWeek: '2026-10-12',
  userRank: 2,
  userPoints: 45,
  leaderboard: [
    { rank: 1, characterId: 'c1', name: 'Leader_01', points: 60 },
    { rank: 2, characterId: 'c2', name: 'Me_01', points: 45 },
  ],
  rewards: [
    { place: 1, medals: 1000, giftCoupons: 100, gold: 50, items: ['i150177'] },
    { place: 50, medals: 100, giftCoupons: 10, gold: 0, items: [] },
  ],
  resetAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  claim: { week: '2026-10-05', rank: 1, claimed: false, closesAt: '2026-10-17T00:00:00Z' },
  canClaim: true,
}

describe('Buy Arena Tickets', () => {
  it('shows the tickets, prices 100 per ticket and buys', async () => {
    const fetch = mockApi({
      'GET /api/game/arena': () => json(arena),
      'POST /api/game/arena/tickets': () =>
        json({ arena: { ...arena, tickets: 5 }, character: ninja }),
    })
    open()
    const summary = await screen.findByRole('region', { name: 'Your arena' })
    expect(within(summary).getByText('Tickets')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Buy Tickets' }))
    const buy = screen.getByRole('dialog', { name: 'Buy Arena Tickets' })
    const amount = within(buy).getByLabelText('Number of tickets to buy')
    fireEvent.change(amount, { target: { value: '3' } })
    // 300 > 250 Gift Certificates.
    expect(within(buy).getByText('Cost: 300 Gift Certificates')).toBeInTheDocument()
    expect(within(buy).getByRole('button', { name: 'Buy' })).toBeDisabled()
    fireEvent.change(amount, { target: { value: '2' } })
    await userEvent.click(within(buy).getByRole('button', { name: 'Buy' }))
    expect(await screen.findByText('Your purchase was successful!')).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/arena/tickets')).toEqual({ amount: 2 })
  })
})

describe('Arena Weekly Rewards', () => {
  it('shows rank, points, the leaderboard, the reward table and claims', async () => {
    const fetch = mockApi({
      'GET /api/game/arena': () => json(arena),
      'GET /api/game/arena/weekly': () => json(weekly),
      'POST /api/game/arena/weekly/claim': () =>
        json({
          weekly: { ...weekly, canClaim: false, claim: { ...weekly.claim, claimed: true } },
          reward: weekly.rewards[0],
          character: ninja,
        }),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Weekly Rewards' }))
    const window = await screen.findByRole('dialog', { name: 'Arena Weekly Rewards' })
    expect(await within(window).findByText('#2')).toBeInTheDocument()
    expect(within(window).getByText('Next Monday in')).toBeInTheDocument()
    const board = within(window).getByRole('region', { name: 'Top 10 Leaderboard' })
    expect(within(board).getByText('60p')).toBeInTheDocument()
    expect(within(window).getByText('#11-50')).toBeInTheDocument()
    await userEvent.click(within(window).getByRole('button', { name: 'Claim' }))
    expect(await within(window).findByText('Claimed Rank Rewards')).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/arena/weekly/claim')).toEqual({ kind: 'arena' })
  })
})

const squad: SquadView = {
  minLevel: 50,
  level: 60,
  score: 93500,
  rank: 3,
  fights: 0,
  wins: 0,
  freeTickets: 10,
  boughtTickets: 0,
  teamCoins: 0,
  loadouts: [
    { set: 1, mainStat: 'AGI', clothing: 3, vipLocked: false },
    { set: 2, mainStat: 'STR', clothing: 1, vipLocked: false },
    { set: 3, mainStat: 'STA', clothing: 6, vipLocked: false },
    { set: 4, mainStat: 'STR', clothing: 1, vipLocked: true },
    { set: 5, mainStat: null, clothing: null, vipLocked: true },
  ],
  selected: [1, 2, 3],
  squadValid: true,
  opponents: [
    {
      index: 0,
      characterId: 'c9',
      name: 'Squad_09',
      level: 55,
      clothing: 1,
      score: 95000,
      won: false,
    },
  ],
  history: [],
  leaderboard: [{ rank: 1, characterId: 'c9', name: 'Squad_09', score: 95000 }],
  shop: [{ id: 'exp-bag-5', itemId: 'i150172', amount: 1, price: 400 }],
  rewards: { teamCoinsPerMatch: 50, giftCouponChance: 0.1, giftCoupons: 50, rankMultiplier: 3 },
}

describe('Squad Arena', () => {
  it('edits the squad: three different main stats in order', async () => {
    const fetch = mockApi({
      'GET /api/game/arena': () => json(arena),
      'GET /api/game/arena/squad': () => json({ ...squad, selected: [], squadValid: false }),
      'POST /api/game/arena/squad/loadouts': () => json({ squad, character: ninja }),
    })
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Squad Arena' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Squad' }))
    const edit = screen.getByRole('dialog', { name: 'Select Your Squad' })
    expect(within(edit).getByRole('button', { name: 'Loadout IV: VIP required' })).toBeDisabled()
    await userEvent.click(within(edit).getByRole('button', { name: 'Loadout II: STR' }))
    await userEvent.click(within(edit).getByRole('button', { name: 'Loadout I: AGI' }))
    expect(within(edit).getByRole('button', { name: 'Confirm Squad' })).toBeDisabled()
    await userEvent.click(within(edit).getByRole('button', { name: 'Loadout III: STA' }))
    expect(within(edit).getByText('3/3 Selected (#1 STR → #2 AGI → #3 STA)')).toBeInTheDocument()
    await userEvent.click(within(edit).getByRole('button', { name: 'Confirm Squad' }))
    expect(requestBody(fetch, 'POST /api/game/arena/squad/loadouts')).toEqual({
      loadouts: [2, 1, 3],
    })
  })

  it('fights a squad: plays the three rounds, then shows the result', async () => {
    vi.mocked(mountBattle).mockClear()
    const round = (won: boolean, set: number) => ({
      replay,
      looks: [{ clothing: 1 }, { clothing: 2 }],
      won,
      sets: [set, set],
    })
    mockApi({
      'GET /api/game/arena': () => json(arena),
      'GET /api/game/arena/squad': () => json(squad),
      'POST /api/game/arena/squad/fight': () =>
        json({
          rounds: [round(true, 1), round(false, 2), round(true, 3)],
          won: true,
          scoreDelta: 3000,
          teamCoins: 50,
          giftCoupons: 0,
          squad: { ...squad, teamCoins: 50 },
          character: ninja,
        }),
    })
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Squad Arena' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Fight Squad_09' }))
    expect(await screen.findByText('Squad Won! Score +30.00, +50 Team Coins.')).toBeInTheDocument()
    expect(mountBattle).toHaveBeenCalledTimes(3)
  })
})

const empty = Array.from({ length: 16 }, () => null)
const championship: ChampionshipView = {
  phase: 'registration',
  registrationEndsAt: new Date(Date.now() + 3_600_000).toISOString(),
  battlingEndsAt: new Date(Date.now() + 7_200_000).toISOString(),
  cooldownEndsAt: new Date(Date.now() + 9_000_000).toISOString(),
  minLevel: 30,
  slots: empty.map((_, slot) =>
    slot === 1 ? { slot, characterId: 'c5', name: 'Holder_05', level: 40, clothing: 1 } : null,
  ),
  mySlot: null,
  matches: Array.from({ length: 8 }, (_, i) => ({
    round: 1,
    matchIndex: i,
    slot1: 2 * i,
    slot2: 2 * i + 1,
    winnerSlot: null,
    scheduledAt: new Date().toISOString(),
    hasReplay: false,
  })),
  challenges: [],
  champion: null,
  lastChampion: 'Old_Champ',
  heroCoins: 0,
  wins: 0,
  losses: 0,
  top3: 0,
  rewards: [
    { round: 2, heroCoins: 100 },
    { round: 3, heroCoins: 250 },
    { round: 4, heroCoins: 500 },
  ],
  shop: [],
}

describe('Championship', () => {
  it('joins an empty slot and challenges a registered ninja for theirs', async () => {
    const fetch = mockApi({
      'GET /api/game/arena': () => json(arena),
      'GET /api/game/arena/championship': () => json(championship),
      'POST /api/game/arena/championship/enter': (_url, init) =>
        JSON.parse(String(init?.body)).slot === 1
          ? json({
              championship: { ...championship, mySlot: 1 },
              character: ninja,
              fight: { replay, looks: [{ clothing: 1 }, { clothing: 1 }], won: true },
            })
          : apiError(400, 'registration_closed', 'Registration for this Championship is closed.'),
    })
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Championship' }))
    expect(await screen.findByText('Registration Open')).toBeInTheDocument()
    expect(screen.getByText('Old_Champ')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Join slot 1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Registration for this Championship is closed.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Challenge Holder_05' }))
    expect(await screen.findByText("You stole Holder_05's slot!")).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/arena/championship/enter')).toEqual({ slot: 0 })
  })

  it('lists the Tournament Rewards', async () => {
    mockApi({
      'GET /api/game/arena': () => json(arena),
      'GET /api/game/arena/championship': () => json(championship),
    })
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Championship' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Rewards' }))
    const rewards = screen.getByRole('dialog', { name: 'Tournament Rewards' })
    expect(within(rewards).getByText('Quarterfinal Winner')).toBeInTheDocument()
    expect(within(rewards).getByText('500 Hero Coins')).toBeInTheDocument()
  })
})
