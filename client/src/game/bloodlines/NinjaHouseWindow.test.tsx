import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { NinjaHouseWindow } from './ninja-house'
import { bloodlinesView } from './test-data'

const ninja = { ...character, level: 60 }

describe('NinjaHouseWindow', () => {
  it('shows 8 bloodline NPC cards a page, sorted by required level', async () => {
    mockApi({ 'GET /api/game/bloodlines': () => json(bloodlinesView()) })
    renderWithProviders(<NinjaHouseWindow character={ninja} onClose={vi.fn()} />)
    const grid = await screen.findByRole('list', { name: 'Ninja House' })
    const cards = await within(grid).findAllByRole('listitem')
    expect(cards).toHaveLength(8)
    const first = cards[0]!
    expect(first).toHaveAccessibleName('Choji Akimichi')
    expect(first).toHaveTextContent('Drops: SM Lv16+')
    expect(first).toHaveTextContent('Amity 0/30')
    expect(first).toHaveTextContent('Lv.16')
    expect(within(first).getByRole('button', { name: 'Talk' })).toBeVisible()
    expect(screen.getByText('1/6')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('2/6')).toBeVisible()
  })

  it('previews a limit and turns in items through the Ninja Saga', async () => {
    let view = bloodlinesView({ 1: { itemsHeld: 5 } })
    const fetch = mockApi({
      'GET /api/game/bloodlines': () => json(view),
      'POST /api/game/bloodlines/1/turn-in': () => {
        view = bloodlinesView(
          { 1: { amity: 30, unlocked: true, itemsHeld: 1 } },
          { turnInsUsed: 4 },
        )
        return json({ ...view, character: ninja })
      },
    })
    renderWithProviders(<NinjaHouseWindow character={ninja} onClose={vi.fn()} />)
    const card = await screen.findByRole('listitem', { name: 'Choji Akimichi' })
    await userEvent.hover(within(card).getByRole('button', { name: 'Preview' }))
    expect(within(card).getByRole('tooltip')).toHaveTextContent('Strength +23')
    await userEvent.click(within(card).getByRole('button', { name: 'Talk' }))
    const saga = screen.getByRole('dialog', { name: 'Ninja Saga' })
    expect(saga).toHaveTextContent('Kebab-Flavored Chips x4')
    expect(saga).toHaveTextContent('You have 5')
    expect(saga).toHaveTextContent('0/30')
    expect(saga).toHaveTextContent('Turn-ins left today: 7/10')
    await userEvent.click(within(saga).getByRole('button', { name: 'Turn In' }))
    expect(requestBody(fetch, 'POST /api/game/bloodlines/1/turn-in')).toEqual({})
    expect(await within(saga).findByText('30/30')).toBeVisible()
    expect(within(saga).getByRole('button', { name: 'Turn In' })).toBeDisabled()
  })

  it('disables Turn In without 4 items or below the required level', async () => {
    mockApi({
      'GET /api/game/bloodlines': () => json(bloodlinesView({ 1: { itemsHeld: 9 } })),
    })
    renderWithProviders(<NinjaHouseWindow character={{ ...ninja, level: 10 }} onClose={vi.fn()} />)
    const card = await screen.findByRole('listitem', { name: 'Choji Akimichi' })
    await userEvent.click(within(card).getByRole('button', { name: 'Talk' }))
    const saga = screen.getByRole('dialog', { name: 'Ninja Saga' })
    expect(within(saga).getByRole('button', { name: 'Turn In' })).toBeDisabled()
    expect(saga).toHaveTextContent('Come back at level 16.')
    await userEvent.click(within(saga).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Ninja Saga' })).toBeNull()
  })
})
