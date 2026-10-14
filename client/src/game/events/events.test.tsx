import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { EventsView } from '../../../../shared/src/schemas/events'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders } from '../../test/utils'
import { DiceOfFateWindow, NinjaDiaryWindow, TwentyMinuteRewardButton } from './index'
import { rewardCountdown } from './timer'

const reward = { exp: 0, stone: 0, gold: 0, giftCoupon: 10, honor: 0, items: [] }
const view: EventsView = {
  character,
  resetAt: new Date(Date.now() + 86400000).toISOString(),
  login: {
    completedDays: 0,
    nextDay: 1,
    canClaim: true,
    canClaimBonus: false,
    rewards: [{ day: 1, reward, claimed: false }],
    bonus: reward,
  },
  weekly: {
    week: '2026-10-12',
    points: 50,
    counters: {},
    activities: [],
    milestones: [{ points: 50, reward, claimed: false }],
    weekdays: [
      { day: 1, reward, claimed: false },
      { day: 2, reward, claimed: false },
    ],
    weekday: 1,
    canClaimBonus: false,
    bonus: reward,
  },
  dice: {
    rollsLeft: 0,
    bought: 0,
    buyLimit: 1,
    replenishCost: 10000,
    clearCost: 5000,
    curse: true,
    buffs: [],
  },
  twentyMinute: {
    nextClaimAt: new Date(0).toISOString(),
    claimsToday: 0,
    dailyCap: 6,
    coupons: 10,
  },
}

describe('Daily events windows', () => {
  it('claims login rewards and shows server refusals', async () => {
    mockApi({
      'GET /api/game/events': () => json(view),
      'POST /api/game/events/login/claim': () => apiError(400, 'bag_full', 'Your bag is full.'),
    })
    renderWithProviders(<NinjaDiaryWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Claim' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your bag is full.')
  })

  it('allows only the current weekday and earned milestones', async () => {
    mockApi({ 'GET /api/game/events': () => json(view) })
    renderWithProviders(<NinjaDiaryWindow onClose={vi.fn()} />)
    await screen.findByText('Day 1')
    await userEvent.click(screen.getByRole('tab', { name: 'Weekly' }))
    expect(screen.getByRole('button', { name: 'Claim Monday reward' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Claim Tuesday reward' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Claim 50-point reward' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Claim weekly bonus' })).toBeDisabled()
  })

  it('enables replenishment only with no rolls and remaining purchases', async () => {
    mockApi({
      'GET /api/game/events': () =>
        json({
          ...view,
          character: { ...character, stone: 20000 },
          dice: { ...view.dice, rollsLeft: 1, bought: 1 },
        }),
    })
    renderWithProviders(<DiceOfFateWindow onClose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Roll dice' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Replenish (10,000 Stone)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear curse (5,000 Stone)' })).toBeEnabled()
  })

  it('disables the twenty-minute reward at the daily cap', async () => {
    mockApi({
      'GET /api/game/events': () =>
        json({ ...view, twentyMinute: { ...view.twentyMinute, claimsToday: 6 } }),
    })
    renderWithProviders(<TwentyMinuteRewardButton />)
    expect(await screen.findByRole('button', { name: 'Daily rewards claimed' })).toBeDisabled()
  })

  it('renders a countdown without negative time', () => {
    expect(rewardCountdown('2026-10-14T00:20:00Z', Date.parse('2026-10-14T00:00:00Z'))).toBe(
      '20:00',
    )
    expect(rewardCountdown('2026-10-14T00:20:00Z', Date.parse('2026-10-14T00:21:00Z'))).toBe('0:00')
  })
})
