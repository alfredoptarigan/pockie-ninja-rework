import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import assets from '../../generated/reborn-assets.json'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { TALENT_ART, TalentsWindow, talentIcon } from './index'

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

describe('TalentsWindow (Talent)', () => {
  it('uses Reborn talent art that exists in the asset manifest', () => {
    const urls = new Set(Object.values(assets).map((asset) => asset.url))
    for (let id = 1; id <= 8; id++) expect(urls).toContain(talentIcon(id))
    for (const url of Object.values(TALENT_ART)) expect(urls).toContain(url)
  })

  it('shows the 8 talents and the selected one, and upgrades with Gold after confirming', async () => {
    let current = view
    const fetch = mockApi({
      'GET /api/game/talents': () => json(current),
      'POST /api/game/talents/1/upgrade': () => {
        current = {
          ...view,
          attemptsUsed: 10,
          talents: [{ ...talents[0]!, level: 3, exp: 0, expNeeded: 820 }, ...talents.slice(1)],
        }
        return json({
          ...current,
          upgrade: { talentId: 1, exp: 300, crit: true, levelsGained: 1 },
          character: ninja,
        })
      },
    })
    renderWithProviders(<TalentsWindow character={ninja} onClose={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Talents' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByText('Select a talent')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Normal Upgrade' })).toBeDisabled()
    await userEvent.click(within(list).getByRole('button', { name: 'Heart of Pierce' }))
    expect(screen.getByRole('heading', { name: 'Heart of Pierce' })).toBeVisible()
    expect(screen.getByText('Current level 2')).toBeVisible()
    expect(screen.getByRole('meter', { name: 'Talent EXP' })).toHaveAttribute(
      'aria-valuetext',
      '50 / 410',
    )
    expect(screen.getByText('Can level up 8')).toBeVisible()
    expect(screen.getByText('Attempts: 31 (Reset everyday at 00:00 server time)')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Gold Upgrade' }))
    const confirm = screen.getByRole('alertdialog')
    expect(confirm).toHaveTextContent('This will cost 11 gold, continue?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetch, 'POST /api/game/talents/1/upgrade')).toEqual({ useGold: true })
    expect(await screen.findByText('Current level 3')).toBeVisible()
  })

  it('asks for Stone on a Normal Upgrade and shows refusals', async () => {
    const fetch = mockApi({
      'GET /api/game/talents': () => json(view),
      'POST /api/game/talents/2/upgrade': () =>
        apiError(400, 'not_enough', 'You need 5,120,000 Stone.'),
    })
    renderWithProviders(<TalentsWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Heart of Block' }))
    await userEvent.click(screen.getByRole('button', { name: 'Normal Upgrade' }))
    const confirm = screen.getByRole('alertdialog')
    expect(confirm).toHaveTextContent('This will cost 5,120,000 stones, continue?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetch, 'POST /api/game/talents/2/upgrade')).toEqual({ useGold: false })
    expect(await screen.findByText('You need 5,120,000 Stone.')).toBeVisible()
  })

  it('turns a learned talent on with Use Talent and shows its pill', async () => {
    let current = view
    const fetch = mockApi({
      'GET /api/game/talents': () => json(current),
      'POST /api/game/talents/1/active': () => {
        current = { ...view, talents: [{ ...talents[0]!, active: true }, ...talents.slice(1)] }
        return json(current)
      },
    })
    renderWithProviders(<TalentsWindow character={ninja} onClose={vi.fn()} />)
    const list = await screen.findByRole('list', { name: 'Talents' })
    expect(within(list).getAllByRole('button', { name: /^Turn .* on$/ })).toHaveLength(1)
    await userEvent.click(within(list).getByRole('button', { name: 'Heart of Block' }))
    expect(screen.getByRole('button', { name: 'Use Talent' })).toBeDisabled()
    await userEvent.click(within(list).getByRole('button', { name: 'Heart of Pierce' }))
    await userEvent.click(screen.getByRole('button', { name: 'Use Talent' }))
    expect(requestBody(fetch, 'POST /api/game/talents/1/active')).toEqual({ active: true })
    expect(await screen.findByRole('button', { name: 'Remove Talent' })).toBeVisible()
    expect(within(list).getByRole('button', { name: 'Turn Heart of Pierce off' })).toBeVisible()
    expect(screen.getByText('Active: 1/3')).toBeVisible()
  })

  it('keeps upgrades off below the unlock level', async () => {
    mockApi({ 'GET /api/game/talents': () => json({ ...view, cap: 0 }) })
    renderWithProviders(<TalentsWindow character={{ ...ninja, level: 40 }} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Heart of Pierce' }))
    expect(screen.getByText('Talents unlock at level 51.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Normal Upgrade' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Gold Upgrade' })).toBeDisabled()
  })
})
