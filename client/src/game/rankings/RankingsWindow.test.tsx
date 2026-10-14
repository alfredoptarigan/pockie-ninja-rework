import type { RankingKey, RankingPage, RankingTree, TollGateRanking } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { RankingsWindow } from './RankingsWindow'

const tree: RankingTree = {
  lists: [
    { key: 'level', group: 'Ninja', label: 'Level' },
    { key: 'arena', group: 'Arena', label: 'Arena Rank' },
  ],
  tollGates: {
    group: 'Demon City',
    label: 'Weekly Toll Gate Ranking',
    gates: [
      { id: 100001, nameKey: 'lg_missing_key' },
      { id: 100002, nameKey: 'lg_missing_key' },
    ],
  },
}

const page = (key: RankingKey, n: number, myPlace: number | null = null): RankingPage => ({
  key,
  page: n,
  pages: 3,
  total: 25,
  myPlace,
  rows: [
    {
      place: n * 10 - 9,
      name: `${key}_${n}`,
      level: 50,
      nation: 4,
      value: 1234567,
      ...(key === 'arena' ? { tier: 2 } : {}),
    },
  ],
})

const week = { week: '2026-10-12', rows: [], myPlace: null }
const gate = (claimed: boolean): TollGateRanking => ({
  gateId: 100001,
  thisWeek: week,
  lastWeek: {
    week: '2026-10-05',
    rows: [
      {
        place: 1,
        name: 'Ninja_01',
        level: 20,
        nation: 0,
        schedule: 60,
        reachedAt: '2026-10-06T10:00:00Z',
      },
    ],
    myPlace: 1,
    reward: { place: 1, exp: 6000, stone: 16908, claimed },
  },
})

const noop = () => {}
const headers = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent)

describe('Rankings window', () => {
  it('opens on Arena with Reborn columns, the arena rank name and comma numbers', async () => {
    mockApi({
      'GET /api/game/rankings': () => json(tree),
      'GET /api/game/rankings/arena': () => json(page('arena', 1)),
    })
    renderWithProviders(<RankingsWindow onClose={noop} />)
    expect(screen.getByRole('dialog', { name: 'Rankings' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Arena',
      'Level',
      'Stone',
      'Las Noches',
      'Toll Gates',
    ])
    expect(screen.getByRole('tab', { name: 'Arena' })).toHaveAttribute('aria-selected', 'true')
    const row = (await screen.findByText('arena_1')).closest('tr')!
    expect(headers()).toEqual(['Rank', 'Player Name', 'Level', 'Score', 'Arena Rank', 'Village'])
    expect(within(row).getByText('1,234,567')).toBeInTheDocument()
    expect(within(row).getByText('Prep III')).toBeInTheDocument()
    expect(screen.getByText('Your Rank --')).toBeInTheDocument()
  })

  it('pages through Level, finds my place and refreshes', async () => {
    let loads = 0
    mockApi({
      'GET /api/game/rankings': () => json(tree),
      'GET /api/game/rankings/arena': () => json(page('arena', 1)),
      'GET /api/game/rankings/level': (url) => {
        loads++
        return url.searchParams.get('find') === 'me'
          ? json(page('level', 3, 22))
          : json(page('level', Number(url.searchParams.get('page'))))
      },
    })
    renderWithProviders(<RankingsWindow onClose={noop} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Level' }))
    expect(await screen.findByText('level_1')).toBeInTheDocument()
    expect(headers()).toEqual(['Rank', 'Player Name', 'Level', 'Experience', 'Village'])
    expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByText('level_2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Find Me' }))
    expect(await screen.findByText('level_3')).toBeInTheDocument()
    expect(screen.getByText('Page 3 / 3')).toBeInTheDocument()
    expect(screen.getByText('Your Rank 22')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled()
    const before = loads
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await expect.poll(() => loads).toBe(before + 1)
  })

  it('shows an empty list', async () => {
    mockApi({
      'GET /api/game/rankings': () => json(tree),
      'GET /api/game/rankings/arena': () => json({ ...page('arena', 1), rows: [], pages: 1 }),
    })
    renderWithProviders(<RankingsWindow onClose={noop} />)
    expect(await screen.findByText('No leaderboard data')).toBeInTheDocument()
  })

  it('picks a toll gate, shows last week and claims the reward', async () => {
    let claimed = false
    const fetch = mockApi({
      'GET /api/game/rankings': () => json(tree),
      'GET /api/game/rankings/arena': () => json(page('arena', 1)),
      'GET /api/game/rankings/toll-gates/100001': () => json(gate(claimed)),
      'POST /api/game/rankings/toll-gates/100001/claim': () => {
        claimed = true
        return json({
          reward: { place: 1, exp: 6000, stone: 16908, levelsGained: 1 },
          ranking: gate(true),
          character,
        })
      },
    })
    renderWithProviders(<RankingsWindow onClose={noop} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Toll Gates' }))
    const gates = await screen.findByRole('combobox', { name: 'Toll gate' })
    expect(within(gates).getAllByRole('option')).toHaveLength(2)
    expect(await screen.findByText('No leaderboard data')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Week' }), 'lastWeek')
    expect(headers()).toEqual(['Rank', 'Player Name', 'Level', 'Progress', 'Village'])
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Your Rank 1')).toBeInTheDocument()
    expect(screen.getByText('Reward for place 1: 6,000 EXP, 16,908 Stone')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(await screen.findByRole('button', { name: 'Claimed' })).toBeDisabled()
    expect(requestBody(fetch, 'POST /api/game/rankings/toll-gates/100001/claim')).toEqual({})
  })
})
