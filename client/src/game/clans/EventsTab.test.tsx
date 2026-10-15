import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { GardenPlotView, GardenView, PicnicView } from '../../../../shared/src/schemas/home'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { EventsTab } from './EventsTab'
import { NinjaGardenWindow } from './NinjaGarden'
import { PicnicWindow } from './Picnic'

const NOW = Date.UTC(2026, 9, 15, 12)
const empty = (locked: boolean): GardenPlotView => ({ locked, tree: null, cooldownUntil: 0 })
const garden = (patch: Partial<GardenView> = {}, plots: Record<number, GardenPlotView> = {}) => ({
  serverNow: NOW,
  plots: Array.from({ length: 9 }, (_, i) => plots[i] ?? empty(i > 0)),
  scrolls: 18,
  plantsToday: 0,
  resetAt: Date.UTC(2026, 9, 16),
  pendingLevel: 1,
  clan: { level: 1, exp: 0, next: 35_000 },
  ...patch,
})
const picnic = (patch: Partial<PicnicView> = {}): PicnicView => ({
  unlocked: true,
  unlockLevel: 4,
  clanLevel: 4,
  warehousePoints: 250,
  requirement: 1_000,
  isFull: false,
  lastWeekFull: false,
  canClaim: false,
  alreadyClaimedThisWeek: false,
  rewardAmount: 1,
  boxLevel: 4,
  timeUntilMonday: 86_400_000 * 2 + 3_600_000 * 5,
  stoneCost: 150_000,
  stonePoints: 10,
  goldCost: 20,
  goldPoints: 30,
  contributions: [],
  ...patch,
})

describe('Clan Events tab', () => {
  it('shows the clan level bar and opens Garden, Picnic and Adventure only', async () => {
    mockApi({
      'GET /api/game/clan-events': () => json({ level: 2, exp: 1_200, next: 70_000 }),
      'GET /api/game/clan-events/garden': () => json(garden()),
    })
    renderWithProviders(<EventsTab />)
    expect(await screen.findByText('1200 / 70000')).toBeVisible()
    const tiles = screen.getByRole('list', { name: 'Clan activities' })
    expect(within(tiles).getByRole('button', { name: 'Training' })).toBeDisabled()
    await userEvent.click(within(tiles).getByRole('button', { name: 'Garden' }))
    expect(await screen.findByRole('dialog', { name: 'Ninja Garden' })).toBeVisible()
  })
  it('opens Adventure with Jiraiya from its tile', async () => {
    mockApi({
      'GET /api/game/clan-events': () => json({ level: 2, exp: 1_200, next: 70_000 }),
      'GET /api/game/adventure': () =>
        json({
          active: false,
          startedAt: null,
          hours: 0,
          rewards: { charExp: 0, bankaiExp: 0, clanExp: 0 },
        }),
    })
    renderWithProviders(<EventsTab />)
    const tiles = screen.getByRole('list', { name: 'Clan activities' })
    await userEvent.click(within(tiles).getByRole('button', { name: 'Adventure' }))
    expect(await screen.findByRole('dialog', { name: 'Adventure with Jiraiya' })).toBeVisible()
  })
})

describe('NinjaGardenWindow', () => {
  it('unlocks a plot after the Gift Certificate confirm', async () => {
    let view = garden()
    const fetch = mockApi({
      'GET /api/game/clan-events/garden': () => json(view),
      'POST /api/game/clan-events/garden/unlock': () => {
        view = garden({}, { 3: empty(false) })
        return json({ garden: view, character })
      },
    })
    renderWithProviders(<NinjaGardenWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Plot 4: locked' }))
    const confirm = screen.getByRole('dialog', { name: 'Unlock Plot' })
    expect(confirm).toHaveTextContent('unlock this plot for 250 Gift Certificates?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }))
    expect(requestBody(fetch, 'POST /api/game/clan-events/garden/unlock')).toEqual({
      plotIndex: 3,
    })
    expect(await screen.findByRole('button', { name: 'Plot 4: empty' })).toBeVisible()
  })

  it('plants through Choose Tree and the Ninjutsu Garden', async () => {
    let view = garden()
    const fetch = mockApi({
      'GET /api/game/clan-events/garden': () => json(view),
      'POST /api/game/clan-events/garden/level-up': () => {
        view = garden({ pendingLevel: 2 })
        return json({ garden: view, character })
      },
      'POST /api/game/clan-events/garden/plant': () => {
        view = garden(
          { plantsToday: 1 },
          {
            0: {
              locked: false,
              tree: { type: 'money', level: 2, readyAt: NOW + 3 * 3_600_000 },
              cooldownUntil: 0,
            },
          },
        )
        return json({ garden: view, character })
      },
    })
    renderWithProviders(<NinjaGardenWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Plot 1: empty' }))
    await userEvent.click(screen.getByRole('button', { name: /Money Tree/ }))
    const dialog = screen.getByRole('dialog', { name: 'Ninjutsu Garden' })
    expect(dialog).toHaveTextContent('240 Bankai coin and 300 Clan points.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Level Up Tree' }))
    const confirm = screen.getByRole('dialog', { name: 'Level Up Tree' })
    expect(confirm).toHaveTextContent('Upgrade from Level 1 to Level 2.')
    await userEvent.click(within(confirm).getByRole('button', { name: '5 Gold' }))
    expect(requestBody(fetch, 'POST /api/game/clan-events/garden/level-up')).toEqual({
      currentLevel: 1,
      payWith: 'gold',
    })
    expect(await within(dialog).findByText(/450 Bankai coin/)).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Plant Tree' }))
    expect(requestBody(fetch, 'POST /api/game/clan-events/garden/plant')).toEqual({
      plotIndex: 0,
      treeLevel: 2,
      treeType: 'money',
    })
    expect(
      await screen.findByRole('button', { name: 'Plot 1: Level 2 Money Tree, growing' }),
    ).toBeVisible()
  })

  it('harvests a grown tree and tells the daily limit and cooldown apart', async () => {
    let view = garden(
      { plantsToday: 1 },
      {
        0: {
          locked: false,
          tree: { type: 'zenpakuto', level: 1, readyAt: NOW - 1 },
          cooldownUntil: 0,
        },
        1: { locked: false, tree: null, cooldownUntil: NOW + 3_600_000 },
      },
    )
    const fetch = mockApi({
      'GET /api/game/clan-events/garden': () => json(view),
      'POST /api/game/clan-events/garden/harvest': () => {
        view = garden(
          { plantsToday: 2 },
          { 0: { locked: false, tree: null, cooldownUntil: NOW + 7_200_000 }, 1: empty(false) },
        )
        return json({
          garden: view,
          character,
          harvest: { type: 'zenpakuto', level: 1, clanHonor: 220, coins: 0, bankaiExp: 1150 },
        })
      },
      'POST /api/game/clan-events/garden/skip': () => json({ garden: view, character }),
    })
    renderWithProviders(<NinjaGardenWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Plot 2: on cooldown' }))
    const cooldown = screen.getByRole('dialog', { name: 'Notice' })
    expect(cooldown).toHaveTextContent('Plot is on Cooldown')
    expect(cooldown).toHaveTextContent('1/2 plants remaining today')
    await userEvent.click(within(cooldown).getByRole('button', { name: 'Skip' }))
    expect(requestBody(fetch, 'POST /api/game/clan-events/garden/skip')).toEqual({ plotIndex: 1 })

    await userEvent.click(
      screen.getByRole('button', { name: 'Plot 1: Level 1 Zenpakuto Tree, ready' }),
    )
    const harvested = await screen.findByRole('dialog', { name: 'Notice' })
    expect(harvested).toHaveTextContent('Harvested Level 1 Zenpakuto Tree!')
    expect(harvested).toHaveTextContent('+1150 Bankai EXP')
    expect(harvested).toHaveTextContent('+220 Clan Honor')
    await userEvent.click(within(harvested).getByRole('button', { name: 'OK' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Plot 2: empty' }))
    expect(screen.getByRole('dialog', { name: 'Notice' })).toHaveTextContent(
      'Plant limit reached (2/2 today)',
    )
  })
})

describe('PicnicWindow', () => {
  it('says when a locked picnic opens', async () => {
    mockApi({
      'GET /api/game/clan-events/picnic': () => json(picnic({ unlocked: false, clanLevel: 2 })),
    })
    renderWithProviders(<PicnicWindow onClose={vi.fn()} />)
    expect(await screen.findByText('Picnic unlocks at level 4')).toBeVisible()
    expect(screen.getByText('Current Clan Level 2')).toBeVisible()
  })

  it('contributes Stones and an outfit, and shows the leaderboard', async () => {
    let view = picnic()
    const fetch = mockApi({
      'GET /api/game/clan-events/picnic': () => json(view),
      'GET /api/game/inventory': () =>
        json({
          items: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              itemId: 'i291101',
              count: 1,
              bound: false,
              equippedSlot: null,
              equippedSet: null,
              nameKey: 'x',
              page: 0,
              slot: 0,
              locked: false,
              info: { kind: 'equip', equipSlot: 'Outfit', level: 0, stack: 1, class: 'AvatarItem' },
            },
          ],
        }),
      'POST /api/game/clan-events/picnic/stone': () => {
        view = picnic({
          warehousePoints: 260,
          contributions: [{ characterId: 'c1', name: 'Ninja_01', points: 10 }],
        })
        return json({ picnic: view, character, pointsAdded: 10 })
      },
      'POST /api/game/clan-events/picnic/outfit': () =>
        json({ picnic: view, character, pointsAdded: 3 }),
    })
    renderWithProviders(<PicnicWindow onClose={vi.fn()} />)
    expect(await screen.findByRole('meter', { name: 'Warehouse' })).toHaveTextContent('250 / 1000')
    await userEvent.click(screen.getByRole('button', { name: 'Stone Contribution' }))
    const confirm = screen.getByRole('dialog', { name: 'Stone Contribution' })
    expect(confirm).toHaveTextContent('Spend 150,000 Stones for +10 warehouse points?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }))
    const success = await screen.findByRole('dialog', { name: 'Success' })
    expect(success).toHaveTextContent('+10 points!')
    await userEvent.click(within(success).getByRole('button', { name: 'OK' }))

    await userEvent.click(screen.getByRole('button', { name: 'Outfit Contribution' }))
    const select = screen.getByRole('dialog', { name: 'Select Outfit' })
    expect(select).toHaveTextContent('Select an outfit to contribute (1-7 points)')
    const list = within(select).getByRole('list', { name: 'Outfits' })
    await userEvent.click(await within(list).findByRole('button'))
    expect(requestBody(fetch, 'POST /api/game/clan-events/picnic/outfit')).toEqual({
      uid: '00000000-0000-4000-8000-000000000001',
    })
    expect(await screen.findByText('+3 points!')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'OK' }))

    await userEvent.click(screen.getByRole('button', { name: 'Leaderboard' }))
    const board = screen.getByRole('dialog', { name: 'Contribution Leaderboard' })
    expect(within(board).getByRole('row', { name: 'Ninja_01' })).toHaveTextContent('10')
  })

  it('claims only when allowed', async () => {
    let view = picnic({ lastWeekFull: true })
    const fetch = mockApi({
      'GET /api/game/clan-events/picnic': () => json(view),
      'POST /api/game/clan-events/picnic/claim': () => {
        view = picnic({ lastWeekFull: true, alreadyClaimedThisWeek: true })
        return json({
          picnic: view,
          character,
          claimed: { boxes: 1, refineTalismans: 40, bankaiCoins: 16_000 },
        })
      },
    })
    const { unmount } = renderWithProviders(<PicnicWindow onClose={vi.fn()} />)
    const claim = await screen.findByRole('button', { name: 'Claim Reward' })
    expect(claim).toHaveAttribute('title', 'Next claim: Monday (2d 5h)')
    await userEvent.click(claim)
    expect(screen.getByRole('dialog', { name: 'Notice' })).toHaveTextContent(
      'Rewards available on Monday only',
    )
    unmount()

    view = picnic({ lastWeekFull: true, canClaim: true })
    renderWithProviders(<PicnicWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Claim Reward' }))
    const confirm = screen.getByRole('dialog', { name: 'Claim Reward' })
    expect(confirm).toHaveTextContent('Claim 1 Picnic Box?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }))
    expect(requestBody(fetch, 'POST /api/game/clan-events/picnic/claim')).toEqual({})
    expect(await screen.findByRole('dialog', { name: 'Success' })).toHaveTextContent(
      '+16,000 Bankai Coins',
    )
  })
})
