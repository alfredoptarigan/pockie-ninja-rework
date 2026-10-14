import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import type { TeamStoneView } from '../../../../shared/src/schemas/team-stone'
import { TEAM_STONE_MAIL_TEXT, TeamStoneWindow } from './index'

const leagues = [
  ['academy', 0, 250],
  ['bronze', 300, 500],
  ['silver', 700, 800],
  ['gold', 1200, 1200],
  ['platinum', 1800, 1800],
  ['diamond', 2500, 2600],
  ['master', 3300, 3600],
  ['champion', 4200, 5000],
].map(([id, minScore, battleCoins]) => ({
  id: id as string,
  nameKey: `reborn_league_${id}`,
  minScore: minScore as number,
  battleCoins: battleCoins as number,
}))
const view = (overrides: Partial<TeamStoneView> = {}): TeamStoneView => ({
  minLevel: 50,
  attemptsPerDay: 25,
  attemptsUsed: 3,
  score: 320,
  battleCoins: 400,
  league: 1,
  leagues,
  playedThisWeek: true,
  queue: null,
  dayResetAt: '2026-10-15T00:00:00.000Z',
  weekResetAt: '2026-10-19T00:00:00.000Z',
  monthResetAt: '2026-11-01T00:00:00.000Z',
  history: [
    {
      id: '0190a000-0000-7000-8000-000000000001',
      won: true,
      delta: 21,
      team: ['Ninja_01', 'Ally_01', 'Ally_02'],
      enemy: ['Foe_01', 'Foe_02', 'Foe_03'],
      createdAt: '2026-10-14T08:00:00.000Z',
    },
  ],
  ...overrides,
})
const ninja = { ...character, level: 60 }

describe('TeamStoneWindow', () => {
  it('shows score, league, attempts and history, and joins the queue', async () => {
    const fetch = mockApi({
      'GET /api/game/team-stone': () => json(view()),
      'POST /api/game/team-stone/queue': () =>
        json(view({ queue: { queuedAt: '2026-10-14T09:00:00.000Z' } })),
    })
    renderWithProviders(<TeamStoneWindow character={ninja} onClose={() => {}} />)
    expect(await screen.findByText(/Bronze League/)).toBeInTheDocument()
    expect(screen.getByText(/Fights left today: 22\/25/)).toBeInTheDocument()
    expect(screen.getByText('Victory (+21 score)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Join queue' }))
    expect(await screen.findByText('Searching for a match...')).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/team-stone/queue')).toBeUndefined()
  })

  it('tells a ninja below level 50 that Team Stone is locked', async () => {
    mockApi({ 'GET /api/game/team-stone': () => json(view({ score: 0, league: 0 })) })
    renderWithProviders(<TeamStoneWindow character={{ ...ninja, level: 40 }} onClose={() => {}} />)
    expect(await screen.findByText('Team Stone opens at level 50.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join queue' })).toBeDisabled()
  })

  it('lists the 8 leagues and the leaderboard', async () => {
    mockApi({
      'GET /api/game/team-stone': () => json(view()),
      'GET /api/game/team-stone/leaderboard': () =>
        json({ rows: [{ place: 1, name: 'Top_01', level: 70, score: 900 }], myPlace: null }),
    })
    renderWithProviders(<TeamStoneWindow character={ninja} onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Leagues' }))
    const table = await screen.findByRole('table', { name: 'Leagues' })
    expect(within(table).getAllByRole('row')).toHaveLength(9)
    expect(within(table).getByText('Bronze (you)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }))
    expect(await screen.findByText('Top_01')).toBeInTheDocument()
  })

  it('buys from the Battle Coin shop and shows refusals', async () => {
    const fetch = mockApi({
      'GET /api/game/team-stone': () => json(view()),
      'GET /api/game/team-stone/shop': () =>
        json({ battleCoins: 400, offers: [{ itemId: 'i292101', price: 180 }] }),
      'POST /api/game/team-stone/shop/buy': () =>
        apiError(400, 'no_battle_coins', 'You do not have enough Battle Coins.'),
    })
    renderWithProviders(<TeamStoneWindow character={ninja} onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Battle Coin Shop' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Buy / }))
    expect(await screen.findByText('You do not have enough Battle Coins.')).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/team-stone/shop/buy')).toEqual({ itemId: 'i292101' })
  })

  it('renders the weekly pay mail in English', () => {
    expect(
      TEAM_STONE_MAIL_TEXT.team_stone_weekly({ league: 'bronze', battleCoins: 500 }).body,
    ).toBe('Your Team Stone league paid 500 Battle Coins this week.')
  })
})
