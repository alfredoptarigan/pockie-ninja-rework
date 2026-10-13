import type { RankingPage, RankingTree, TollGateRanking } from '@pockie/shared'
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
    gates: [{ id: 100001, nameKey: 'lg_missing_key' }],
  },
}

const page = (n: number, myPlace: number | null = null): RankingPage => ({
  key: 'level',
  page: n,
  pages: 3,
  total: 25,
  myPlace,
  rows: [{ place: n * 10 - 9, name: `Top_${n}`, level: 50, nation: 4, value: 1234 }],
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

describe('Rankings window', () => {
  it('pages through a list and finds my place', async () => {
    mockApi({
      'GET /api/game/rankings': () => json(tree),
      'GET /api/game/rankings/level': (url) =>
        url.searchParams.get('find') === 'me'
          ? json(page(3, 22))
          : json(page(Number(url.searchParams.get('page')))),
    })
    renderWithProviders(<RankingsWindow onClose={noop} />)
    expect(await screen.findByText('Top_1')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('You are not in the top 100.')
    expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByText('Top_2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Find me' }))
    expect(await screen.findByText('Top_3')).toBeInTheDocument()
    expect(screen.getByText('Page 3 / 3')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Your place: 22')
    expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled()
  })

  it('shows last week of a toll gate and claims the reward', async () => {
    let claimed = false
    const fetch = mockApi({
      'GET /api/game/rankings': () => json(tree),
      'GET /api/game/rankings/level': () => json(page(1)),
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
    const nav = await screen.findByRole('navigation', { name: 'Ranking lists' })
    await userEvent.click(within(nav).getByRole('button', { name: 'Toll Gate 100001' }))
    expect(await screen.findByText('Nobody is ranked yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Last Week' }))
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Reward for place 1: 6000 EXP, 16908 Stone')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(await screen.findByText('Claimed')).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/rankings/toll-gates/100001/claim')).toEqual({})
  })
})
