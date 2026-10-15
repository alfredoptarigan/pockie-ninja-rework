import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { EventsView } from '../../../../shared/src/schemas/events'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders } from '../../test/utils'
import { OpenWindowProvider } from '../windows'
import { NinjaDiaryWindow, TwentyMinuteRewardButton } from './index'
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
    activities: [
      { id: 'arenaDuel', label: 'Duel in Arena', points: 40, count: 5, max: 5 },
      { id: 'duelFriend', label: 'Duel a friend', points: 10, count: 1, max: 3 },
      { id: 'tollGate', label: 'Toll Gate', points: 50, count: 0, max: 1 },
      { id: 'mission', label: 'Complete Mission', points: 20, count: 0, max: 1 },
    ],
    milestones: [{ points: 50, reward, claimed: false }],
    weekdays: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, reward, claimed: false })),
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
  it('lays out the Ninja Diary tabs and the Daily Login tab', async () => {
    mockApi({ 'GET /api/game/events': () => json(view) })
    renderWithProviders(<NinjaDiaryWindow onClose={vi.fn()} />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Daily Login',
      'Weekly Rewards',
      'Task Board',
    ])
    expect(await screen.findByText('Daily Login Rewards')).toBeInTheDocument()
    expect(screen.getByText('Log in daily to earn rewards!')).toBeInTheDocument()
    expect(screen.getByText('Claim Available')).toBeInTheDocument()
    expect(screen.getByText('Cycle Progress')).toBeInTheDocument()
    expect(screen.getByText('0/1')).toBeInTheDocument()
    expect(screen.getByText('Reward ready!')).toBeInTheDocument()
    expect(screen.getByText('Your reward is ready to claim!')).toBeInTheDocument()
    // canClaimBonus false: today's bonus is already taken.
    const bonus = screen.getByRole('listitem', { name: 'Daily Bonus' })
    expect(within(bonus).getByRole('button', { name: 'Claimed' })).toBeDisabled()
  })

  it('claims login rewards and shows server refusals', async () => {
    mockApi({
      'GET /api/game/events': () => json(view),
      'POST /api/game/events/login/claim': () => apiError(400, 'bag_full', 'Your bag is full.'),
    })
    renderWithProviders(<NinjaDiaryWindow onClose={vi.fn()} />)
    const days = await screen.findByRole('list', { name: 'Login rewards' })
    await userEvent.click(within(days).getByRole('button', { name: 'Claim' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your bag is full.')
  })

  it('counts down to the next login reward once claimed', async () => {
    mockApi({
      'GET /api/game/events': () =>
        json({
          ...view,
          login: {
            ...view.login,
            canClaim: false,
            completedDays: 1,
            nextDay: 2,
            rewards: [
              { day: 1, reward, claimed: true },
              { day: 2, reward, claimed: false },
            ],
          },
        }),
    })
    renderWithProviders(<NinjaDiaryWindow onClose={vi.fn()} />)
    expect(await screen.findByText(/^Next reward unlocks in \d/)).toBeInTheDocument()
    expect(screen.getByText('Next Reward')).toBeInTheDocument()
    expect(screen.queryByText('Claim Available')).not.toBeInTheDocument()
    const days = screen.getByRole('list', { name: 'Login rewards' })
    expect(within(days).getByRole('button', { name: 'Claimed' })).toBeDisabled()
    expect(within(days).getByRole('button', { name: 'Claim' })).toBeDisabled()
  })

  it('shows weekly tasks with Go and allows only the current weekday and earned milestones', async () => {
    mockApi({
      'GET /api/game/events': () => json(view),
      'GET /api/game/daily': () =>
        json({
          day: '2026-10-12',
          resetAt: view.resetAt,
          refreshAt: view.resetAt,
          accepted: 0,
          completed: 0,
          limit: 20,
          inProgressLimit: 5,
          quests: [],
        }),
    })
    const open = vi.fn()
    renderWithProviders(
      <OpenWindowProvider value={open}>
        <NinjaDiaryWindow onClose={vi.fn()} />
      </OpenWindowProvider>,
    )
    await screen.findByText('Daily Login Rewards')
    await userEvent.click(screen.getByRole('tab', { name: 'Weekly Rewards' }))
    expect(
      screen.getByText('Complete daily tasks to earn points and unlock rewards.'),
    ).toBeVisible()
    expect(screen.getByText('Points: 50')).toBeInTheDocument()
    const tasks = screen.getByRole('list', { name: 'Weekly tasks' })
    const arena = within(tasks).getByRole('listitem', { name: 'Duel in Arena' })
    expect(within(arena).getByText('5/5 ✓')).toBeInTheDocument()
    expect(within(arena).getByText('40 pts')).toBeInTheDocument()
    expect(within(arena).queryByRole('button', { name: 'Go' })).not.toBeInTheDocument()
    const friend = within(tasks).getByRole('listitem', { name: 'Duel a friend' })
    await userEvent.click(within(friend).getByRole('button', { name: 'Go' }))
    expect(open).toHaveBeenCalledWith('friends')
    const gate = within(tasks).getByRole('listitem', { name: 'Toll Gate' })
    expect(within(gate).queryByRole('button', { name: 'Go' })).not.toBeInTheDocument()

    const tile = (name: string) => screen.getByRole('listitem', { name })
    expect(within(tile('Mon')).getByRole('button', { name: 'Claim' })).toBeEnabled()
    expect(within(tile('Tue')).getByRole('button', { name: 'Claim' })).toBeDisabled()
    expect(within(tile('50 pts')).getByRole('button', { name: 'Claim' })).toBeEnabled()
    expect(within(tile('Bonus')).getByRole('button', { name: 'Claim' })).toBeDisabled()

    const mission = within(tasks).getByRole('listitem', { name: 'Complete Mission' })
    await userEvent.click(within(mission).getByRole('button', { name: 'Go' }))
    expect(screen.getByRole('tab', { name: 'Task Board' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('No tasks in progress')).toBeInTheDocument()
  })

  it('disables the twenty-minute reward at the daily cap', async () => {
    mockApi({
      'GET /api/game/events': () =>
        json({ ...view, twentyMinute: { ...view.twentyMinute, claimsToday: 6 } }),
    })
    renderWithProviders(<TwentyMinuteRewardButton />)
    expect(await screen.findByRole('button', { name: 'Daily limit reached' })).toBeDisabled()
  })

  it('renders a countdown without negative time', () => {
    expect(rewardCountdown('2026-10-14T00:20:00Z', Date.parse('2026-10-14T00:00:00Z'))).toBe(
      '20:00',
    )
    expect(rewardCountdown('2026-10-14T00:20:00Z', Date.parse('2026-10-14T00:21:00Z'))).toBe('0:00')
    expect(rewardCountdown('2026-10-15T00:00:00Z', Date.parse('2026-10-14T21:59:30Z'))).toBe(
      '2:00:30',
    )
  })
})
