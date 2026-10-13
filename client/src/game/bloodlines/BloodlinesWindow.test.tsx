import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import assets from '../../generated/reborn-assets.json'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { BloodlinesWindow, formatStat, LIMIT_ITEM_NAMES, limitIcon, npcIcon } from './index'

const limit = (id: number, extra: object = {}) => ({
  limitId: id,
  nameKey: `reborn_limit_${id}`,
  npcId: 81000 + id,
  npcNameKey: `reborn_npc_${81000 + id}`,
  requiredLevel: 16,
  unlockItem: 'i148023',
  itemsHeld: 0,
  amity: 0,
  amityNeeded: 30,
  unlocked: false,
  active: false,
  stats: [
    { field: 'strength', label: 'Strength', value: 2300 },
    { field: 'skillAdd5', label: 'Body Skill Cast Chance %', value: 2 },
    { field: 'hpMul', label: 'Max Health %', value: 125 },
  ],
  ...extra,
})
const view = {
  turnInsUsed: 3,
  turnInsPerDay: 10,
  itemsPerTurnIn: 4,
  amityPerTurnIn: 30,
  maxActive: 3,
  resetAt: new Date(Date.now() + 60000).toISOString(),
  bonuses: [],
  limits: Array.from({ length: 44 }, (_, i) => limit(i + 1)),
}
const ninja = { ...character, level: 60 }

describe('BloodlinesWindow', () => {
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

  it('lists 44 Ninja House NPCs and turns in items', async () => {
    const ready = { ...view, limits: [limit(1, { itemsHeld: 5 }), ...view.limits.slice(1)] }
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(ready),
      'POST /api/game/bloodlines/1/turn-in': () =>
        json({
          ...ready,
          turnInsUsed: 4,
          limits: [limit(1, { amity: 30, unlocked: true, itemsHeld: 1 }), ...view.limits.slice(1)],
          character: ninja,
        }),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    const grid = await screen.findByRole('list', { name: 'Ninja House' })
    expect(grid.querySelectorAll('li')).toHaveLength(44)
    expect(screen.getByText(/Turn-ins left today: 7\/10/)).toBeVisible()
    expect(screen.getByText('Kebab Flavored Chips: 5/4')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Turn in 4' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/1/turn-in')).toEqual({})
    expect(await screen.findByText('Bloodline unlocked.')).toBeVisible()
  })

  it('disables turn-in without items and shows server refusals', async () => {
    mockApi({
      'GET /api/game/bloodlines': () =>
        json({ ...view, limits: [limit(1, { unlocked: true }), ...view.limits.slice(1)] }),
      'POST /api/game/bloodlines/1/active': () =>
        apiError(400, 'too_many_active', 'Only 3 bloodlines can be active.'),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /House of Flying Blades/ }))
    expect(screen.getByRole('button', { name: 'Turn in 4' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Body Enlargement Technique/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Only 3 bloodlines can be active.')).toBeVisible()
  })

  it('shows the 3 active slots and the summed bonuses', async () => {
    mockApi({
      'GET /api/game/bloodlines': () =>
        json({
          ...view,
          bonuses: [
            { field: 'strength', label: 'Strength', value: 5300 },
            { field: 'tough', label: 'Constitution', value: 43 },
          ],
          limits: [limit(1, { unlocked: true, active: true }), ...view.limits.slice(1)],
        }),
    })
    renderWithProviders(<BloodlinesWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Bloodlines' }))
    const slots = screen.getByRole('list', { name: 'Active bloodlines' })
    expect(slots.querySelectorAll('li')).toHaveLength(3)
    expect(slots).toHaveTextContent('Body Enlargement Technique')
    expect(slots).toHaveTextContent('Empty slot')
    const bonuses = screen.getByRole('list', { name: 'Bloodline bonuses' })
    expect(bonuses).toHaveTextContent('Strength +53')
    expect(bonuses).toHaveTextContent('Constitution +43')
  })
})
