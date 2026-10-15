import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { EventsView } from '../../../../shared/src/schemas/events'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ToastHost } from '../toast'
import { DiceOfFateWindow } from './DiceOfFateWindow'

const reward = { exp: 0, stone: 0, gold: 0, giftCoupon: 0, honor: 0, items: [] }
const dice: EventsView['dice'] = {
  rollsLeft: 1,
  bought: 0,
  buyLimit: 1,
  replenishCost: 10000,
  clearCost: 5000,
  curse: true,
  buffs: [],
}
const view: EventsView = {
  character: { ...character, stone: 20000 },
  resetAt: new Date(Date.now() + 86400000).toISOString(),
  login: {
    completedDays: 0,
    nextDay: 1,
    canClaim: false,
    canClaimBonus: false,
    rewards: [],
    bonus: reward,
  },
  weekly: {
    week: '2026-10-12',
    points: 0,
    counters: {},
    activities: [],
    milestones: [],
    weekdays: [],
    weekday: 1,
    canClaimBonus: false,
    bonus: reward,
  },
  dice,
  twentyMinute: {
    nextClaimAt: new Date(0).toISOString(),
    claimsToday: 0,
    dailyCap: 6,
    coupons: 10,
  },
}
const open = () =>
  renderWithProviders(
    <>
      <DiceOfFateWindow onClose={vi.fn()} />
      <ToastHost />
    </>,
  )

describe('DiceOfFateWindow', () => {
  it('lays out the attempts, the blessing and curse boxes and the button row', async () => {
    mockApi({ 'GET /api/game/events': () => json(view) })
    open()
    const window = screen.getByRole('dialog', { name: 'Dice of Fate' })
    expect(
      await within(window).findByText("Today's number of times for Cleromancy: 1"),
    ).toBeVisible()
    const blessing = within(window).getByRole('group', { name: 'Blessing Effect:' })
    expect(within(blessing).getByText('Angelic Blessing: Net 4+ lucky dice (5, 6)')).toBeVisible()
    expect(
      within(blessing).getByText('Low Level Blessing: Net 2-3 lucky dice (5, 6)'),
    ).toBeVisible()
    expect(within(blessing).getByText('Low Level')).toHaveAttribute(
      'title',
      expect.stringMatching(/^Low Level Blessing: Increase Constitution, Armor Break by 6/),
    )
    const curse = within(window).getByRole('group', { name: 'Curse Effect:' })
    expect(within(curse).getByText('Demonic Curse: Net 4+ unlucky dice (1, 2)')).toBeVisible()
    expect(within(curse).getByText('Low Level Curse: Net 2-3 unlucky dice (1, 2)')).toBeVisible()
    expect(within(window).getByRole('button', { name: 'Attempt Cleromancy' })).toBeEnabled()
    const replenish = within(window).getByRole('button', { name: 'Replenish Dice (10,000 Stones)' })
    expect(replenish).toBeDisabled()
    expect(replenish).toHaveAttribute(
      'title',
      expect.stringContaining('You can only refresh dice once all attempts have been used.'),
    )
    expect(within(window).getByRole('button', { name: 'Clear Curse (5,000 Stones)' })).toBeEnabled()
  })

  it('offers Replenish Dice once the attempts are used and hides Clear Curse without a curse', async () => {
    mockApi({
      'GET /api/game/events': () =>
        json({ ...view, dice: { ...dice, rollsLeft: 0, curse: false } }),
    })
    open()
    expect(await screen.findByRole('button', { name: 'Attempt Cleromancy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Replenish Dice (10,000 Stones)' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^Clear Curse/ })).not.toBeInTheDocument()
  })

  it('casts the dice in the Cleromancy window and logs the result', async () => {
    const rolled: EventsView = {
      ...view,
      dice: {
        ...dice,
        rollsLeft: 0,
        lastRoll: { dice: [6, 5, 5, 6, 1, 3], net: 3, buffId: 80101 },
      },
    }
    const fetch = mockApi({
      'GET /api/game/events': () => json(view),
      'POST /api/game/events/dice/roll': () => json(rolled),
    })
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Attempt Cleromancy' }))
    expect(requestBody(fetch, 'POST /api/game/events/dice/roll')).toBeUndefined()
    const cleromancy = await screen.findByRole('dialog', { name: 'Cleromancy' })
    const log = within(cleromancy).getByRole('log')
    expect(
      await within(log).findByText('Results are 6, 5, 5, 6, 1, 3 totaling 26 points.'),
    ).toBeVisible()
    expect(within(log).getByText('The dice bless you with Low Level Blessing.')).toBeVisible()
    expect(screen.getByText('Fortune favors you - Low Level Blessing!')).toBeVisible()
  })
})
