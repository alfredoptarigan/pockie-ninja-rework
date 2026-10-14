import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import assets from '../../generated/reborn-assets.json'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import {
  BloodlinesWindow,
  formatStat,
  LIMIT_ITEM_NAMES,
  limitIcon,
  limitTotals,
  npcIcon,
} from './index'
import { bloodlinesView, limit } from './test-data'

const ninja = { ...character, level: 60 }
const souls = {
  souls: [{ id: 'a', type: 1, level: 2, limitId: 1, socket: 0 }],
  inventory: 250,
  socketsPerLimit: 5,
  discoveredToday: 0,
  discoverPerDay: 10,
  levelLimits: [25, 25, 25, 36, 36, 51, 71, 71, 90, 90],
  types: [
    {
      id: 1,
      nameKey: 'reborn_soul_1',
      field: 'strength',
      label: 'Strength',
      valueByLevel: [0, 100, 200],
    },
  ],
  prayers: [{ limitId: 1, attribute: 1, level: 2, progress: 0, needed: 400 }],
  prayerMaxLevel: 9,
  prayerPoints: [100],
  resetAt: new Date(Date.now() + 60000).toISOString(),
}

describe('BloodlinesWindow (Bloodline Limits)', () => {
  it('uses Reborn limit and NPC icons that exist in the asset manifest', () => {
    const urls = new Set(Object.values(assets).map((asset) => asset.url))
    for (let id = 1; id <= 44; id++) {
      expect(urls).toContain(limitIcon(id))
      expect(urls).toContain(npcIcon(81000 + id))
    }
    expect(Object.keys(LIMIT_ITEM_NAMES)).toHaveLength(18)
  })

  it('formats stats in Reborn units', () => {
    expect(formatStat({ field: 'strength', label: 'Strength', value: 2300 })).toBe('Strength +23')
    expect(formatStat({ field: 'hpMul', label: 'Max Health %', value: 125 })).toBe(
      'Max Health +12.5%',
    )
    expect(formatStat({ field: 'skillAdd5', label: 'Body Skill Cast Chance %', value: 2 })).toBe(
      'Body Skill Cast Chance +2%',
    )
    expect(formatStat({ field: 'tough', label: 'Constitution', value: 43 })).toBe(
      'Constitution +43',
    )
  })

  it("sums a limit's stats, its socketed souls and its prayer", () => {
    const totals = limitTotals(limit(1), souls)
    // 2300 base + 200 (Lv. 2 soul) + 2 prayer levels x 8 x 100.
    expect(totals.find((s) => s.field === 'strength')?.value).toBe(2300 + 200 + 1600)
    expect(totals).toHaveLength(3)
  })

  it('shows the collection, selects a limit and activates it', async () => {
    let view = bloodlinesView({ 2: { unlocked: true } })
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(view),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/2/active': () => {
        view = bloodlinesView({ 2: { unlocked: true, active: true } })
        return json(view)
      },
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    expect(await screen.findByText('Collected 1/44')).toBeVisible()
    const grid = screen.getByRole('list', { name: 'Limits' })
    expect(within(grid).getAllByRole('button')).toHaveLength(44)
    expect(screen.getByText('Select a limit from your collection')).toBeVisible()
    await userEvent.click(within(grid).getByRole('button', { name: /^House of Flying Blades/ }))
    expect(screen.getByText('Required Level: 16')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/2/active')).toEqual({ active: true })
    expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeVisible()
    const active = screen.getByRole('list', { name: 'Active bloodlines' })
    expect(within(active).getAllByRole('button')).toHaveLength(3)
    expect(within(active).getByRole('button', { name: /House of Flying Blades/ })).toBeEnabled()
  })

  it('keeps Activate off for a locked limit and shows server refusals', async () => {
    mockApi({
      'GET /api/game/bloodlines': () => json(bloodlinesView({ 1: { unlocked: true } })),
      'GET /api/game/bloodlines/souls': () => json(souls),
      'POST /api/game/bloodlines/1/active': () =>
        apiError(400, 'too_many_active', 'Only 3 bloodlines can be active.'),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    const grid = await screen.findByRole('list', { name: 'Limits' })
    await userEvent.click(
      within(grid).getByRole('button', { name: /House of Flying Blades.*locked/ }),
    )
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled()
    await userEvent.click(within(grid).getByRole('button', { name: /^Body Enlargement Technique/ }))
    const equipped = await screen.findByRole('img', { name: /Lv\. 2/ })
    expect(screen.getByRole('list', { name: 'Souls equipped' })).toContainElement(equipped)
    await userEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Only 3 bloodlines can be active.')).toBeVisible()
  })

  it('lists the summed bonuses and opens the Souls tab on double-click', async () => {
    mockApi({
      'GET /api/game/bloodlines': () =>
        json(
          bloodlinesView(
            { 1: { unlocked: true, active: true } },
            {
              bonuses: [
                { field: 'strength', label: 'Strength', value: 5300 },
                { field: 'tough', label: 'Constitution', value: 43 },
              ],
            },
          ),
        ),
      'GET /api/game/bloodlines/souls': () => json(souls),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    const bonuses = await screen.findByRole('list', { name: 'Bloodline bonuses' })
    expect(bonuses).toHaveTextContent('Strength +53')
    expect(bonuses).toHaveTextContent('Constitution +43')
    const grid = screen.getByRole('list', { name: 'Limits' })
    await userEvent.dblClick(
      within(grid).getByRole('button', { name: /^Body Enlargement Technique/ }),
    )
    expect(screen.getByRole('tab', { name: 'Souls' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Soul Inventory (1/250)')).toBeVisible()
  })
})
