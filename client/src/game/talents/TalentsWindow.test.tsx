import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import assets from '../../generated/reborn-assets.json'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { TalentsWindow, talentIcon } from './index'

const talents = Array.from({ length: 8 }, (_, i) => ({
  talentId: i + 1,
  nameKey: `reborn_talent_${i + 1}`,
  level: i === 0 ? 2 : 0,
  exp: i === 0 ? 50 : 0,
  expNeeded: i === 0 ? 410 : 100,
  active: false,
}))
const view = {
  unlockLevel: 51,
  cap: 10,
  attemptsUsed: 9,
  attemptsPerDay: 40,
  nextCost: { gold: 11, stones: 5120000 },
  maxActive: 3,
  resetAt: new Date(Date.now() + 60000).toISOString(),
  talents,
}
const ninja = { ...character, level: 60 }

describe('TalentsWindow', () => {
  it('uses Reborn talent icons that exist in the asset manifest', () => {
    const urls = new Set(Object.values(assets).map((asset) => asset.url))
    for (let id = 1; id <= 8; id++) expect(urls).toContain(talentIcon(id))
  })

  it('shows 8 talents, attempts and costs, and upgrades with Gold', async () => {
    const fetch = mockApi({
      'GET /api/game/talents': () => json(view),
      'POST /api/game/talents/1/upgrade': () =>
        json({
          ...view,
          attemptsUsed: 10,
          upgrade: { talentId: 1, exp: 300, crit: true, levelsGained: 0 },
          character: ninja,
        }),
    })
    renderWithProviders(<TalentsWindow character={ninja} onClose={vi.fn()} />)
    expect(await screen.findByText('Heart of Dodge')).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByText(/Upgrades left today: 31\/40/)).toBeVisible()
    expect(screen.getByRole('meter', { name: 'EXP' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('button', { name: 'Upgrade for 5,120,000 Stone' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade for 11 Gold' }))
    expect(requestBody(fetch, 'POST /api/game/talents/1/upgrade')).toEqual({ useGold: true })
    expect(await screen.findByText('Critical upgrade! +300 EXP.')).toBeVisible()
  })

  it('activates a trained talent and cannot activate an untrained one', async () => {
    const fetch = mockApi({
      'GET /api/game/talents': () => json(view),
      'POST /api/game/talents/1/active': () =>
        json({ ...view, talents: [{ ...talents[0]!, active: true }, ...talents.slice(1)] }),
    })
    renderWithProviders(<TalentsWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Activate' }))
    expect(requestBody(fetch, 'POST /api/game/talents/1/active')).toEqual({ active: true })
    expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /Heart of Block/ }))
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled()
  })

  it('tells a ninja below 51 when talents unlock and shows server refusals', async () => {
    mockApi({
      'GET /api/game/talents': () => json({ ...view, cap: 0 }),
      'POST /api/game/talents/1/active': () =>
        apiError(400, 'too_many_active', 'Only 3 talents can be active.'),
    })
    renderWithProviders(<TalentsWindow character={{ ...character, level: 40 }} onClose={vi.fn()} />)
    expect(await screen.findByText('Talents unlock at level 51.')).toBeVisible()
    expect(screen.getByRole('button', { name: /Stone/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Only 3 talents can be active.')).toBeVisible()
  })
})
