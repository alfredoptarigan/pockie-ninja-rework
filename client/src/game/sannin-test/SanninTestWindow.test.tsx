import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SanninTestView } from '../../../../shared/src/schemas/sannin-test'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders } from '../../test/utils'
import type { Replay } from '../types'
import { diceArt, SanninTestWindow } from './index'

const ninja = { ...character, level: 60 }
const rankBonuses = [
  { requiredPoints: 0, hp: 0 },
  { requiredPoints: 30, hp: 200 },
  { requiredPoints: 60, hp: 400 },
]
const view: SanninTestView = {
  state: {
    rank: 0,
    growthPoints: 12,
    remainingDice: 10,
    remainingFreeChanges: 3,
    totalRolls: 0,
    pending: null,
  },
  rankBonuses,
  pendingReward: null,
  makeSixCost: 100,
  gold: 500,
  resetAt: new Date(Date.now() + 3_600_000).toISOString(),
}
const rolled: SanninTestView = {
  ...view,
  state: {
    ...view.state,
    remainingDice: 9,
    pending: { dice: [1, 1, 1, 1, 1, 4], ninjaCount: 5 },
  },
  pendingReward: { experience: 12_000, growthPoints: 20 },
}
const replay: Replay = {
  seed: 1,
  fighters: [
    {
      index: 0,
      side: 'attackers',
      name: 'Ninja_01',
      level: 60,
      maxHp: 1,
      startHp: 1,
      hp: 1,
      maxMp: 1,
      startMp: 1,
      mp: 1,
    },
    {
      index: 1,
      side: 'defenders',
      name: 'Orochimaru',
      level: 60,
      maxHp: 1,
      startHp: 1,
      hp: 0,
      maxMp: 1,
      startMp: 1,
      mp: 1,
    },
  ],
  events: [],
  winner: 'attackers',
}

const perfected: SanninTestView = {
  ...rolled,
  state: { ...rolled.state, pending: { dice: [1, 1, 1, 1, 1, 1], ninjaCount: 6 } },
}
const claimed: SanninTestView = {
  ...view,
  state: { ...view.state, growthPoints: 32, remainingDice: 9 },
}
const promoted: SanninTestView = { ...view, state: { ...view.state, rank: 1, growthPoints: 2 } }

/** The server's state: each action answers with it and the refetch after it reads it. */
const open = async (data: SanninTestView = view) => {
  let current = data
  const answer =
    (next: SanninTestView, body: (v: SanninTestView) => object = (v) => v) =>
    () => {
      current = next
      return json(body(next))
    }
  const fetch = mockApi({
    'GET /api/game/sannin-test': () => json(current),
    'POST /api/game/sannin-test/roll': answer(rolled),
    'POST /api/game/sannin-test/change-luck': answer(rolled),
    'POST /api/game/sannin-test/perfect': answer(perfected, (v) => ({
      sanninTest: v,
      character: ninja,
    })),
    'POST /api/game/sannin-test/claim': answer(claimed, (v) => ({
      sanninTest: v,
      experience: 12_000,
      growthPoints: 20,
      character: ninja,
    })),
    'POST /api/game/sannin-test/promote': answer(promoted, (v) => ({
      replay,
      victory: true,
      targetRank: 1,
      look: { clothing: 51 },
      sanninTest: v,
      character: ninja,
    })),
  })
  renderWithProviders(<SanninTestWindow character={ninja} onClose={vi.fn()} />)
  await screen.findByRole('region', { name: 'Sannin counters' })
  return fetch
}
const called = (fetch: ReturnType<typeof mockApi>, path: string) =>
  fetch.mock.calls.some(([url]) => String(url).endsWith(path))

describe('SanninTestWindow', () => {
  it('has the dice art exported', () => {
    const file = (url: string) => join(__dirname, '../../../public', url)
    for (const face of [1, 2, 3, 4, 5, 6]) expect(existsSync(file(diceArt(face)))).toBe(true)
  })

  it('shows the counters', async () => {
    await open()
    const counters = screen.getByRole('region', { name: 'Sannin counters' })
    expect(counters).toHaveTextContent('Title Rank: 0 / 2')
    expect(counters).toHaveTextContent('Growing Points: 12')
    expect(counters).toHaveTextContent('Dice: 10')
    expect(counters).toHaveTextContent('Change Luck: 3')
  })

  it('rolls, shows the six dice with Perfect and Change Luck, then claims', async () => {
    const fetch = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Shake the Sannin dice' }))
    const result = await screen.findByRole('dialog', { name: 'Sannin Test Result' })
    expect(within(result).getAllByAltText('Ninja die')).toHaveLength(5)
    expect(result).toHaveTextContent('Exp Gained: 12,000')
    await userEvent.click(within(result).getByRole('button', { name: 'Perfect' }))
    expect(called(fetch, '/sannin-test/perfect')).toBe(true)
    expect(await within(result).findAllByAltText('Ninja die')).toHaveLength(6)
    expect(within(result).getByRole('button', { name: 'Change Luck' })).toBeDisabled()
    await userEvent.click(within(result).getByRole('button', { name: 'Ok' }))
    expect(called(fetch, '/sannin-test/claim')).toBe(true)
    expect(await screen.findByText('Growing Points: 32')).toBeInTheDocument()
  })

  it('says when today’s dice are used up', async () => {
    await open({ ...view, state: { ...view.state, remainingDice: 0 } })
    expect(screen.getByRole('button', { name: 'Shake the Sannin dice' })).toBeDisabled()
    expect(screen.getByText('All dice attempts have been used today.')).toBeInTheDocument()
  })

  it('Titles shows the path; the promotion battle needs the points, then unlocks the rank', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Titles' }))
    const panel = await screen.findByRole('dialog', { name: 'Sannin Title Progression' })
    expect(panel).toHaveTextContent('Rank 0 of 2')
    expect(panel).toHaveTextContent('12 / 30')
    expect(within(panel).getByRole('button', { name: 'Promotion Battle' })).toBeDisabled()
    expect(panel).toHaveTextContent('Requires 30 Growing Points')
  })

  it('a won promotion battle reports the unlocked rank', async () => {
    const fetch = await open({ ...view, state: { ...view.state, growthPoints: 32 } })
    await userEvent.click(screen.getByRole('button', { name: 'Titles' }))
    const panel = await screen.findByRole('dialog', { name: 'Sannin Title Progression' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Promotion Battle' }))
    expect(called(fetch, '/sannin-test/promote')).toBe(true)
    expect(await screen.findByText('Promotion victory: rank 1 unlocked.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Sannin counters' })).toHaveTextContent(
      'Title Rank: 1 / 2',
    )
  })
})
