import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { BuffsPanel } from './BuffsPanel'

describe('buffs and titles', () => {
  it('lists timed effects and lets an owned title be equipped', async () => {
    const fetchMock = mockApi({
      'GET /api/game/buffs': () =>
        json({
          buffs: [
            {
              buffId: 50001,
              nameKey: 'lg_Food82_itemname',
              expiresAt: '2030-01-01T00:00:00Z',
              removable: true,
            },
          ],
          titles: [{ titleId: 12, nameKey: 'lg_EffortTitle12', active: false, expiresAt: null }],
        }),
      'POST /api/game/titles/activate': () => json({ character, buffs: [], titles: [] }),
    })
    renderWithProviders(<BuffsPanel onClose={() => {}} />)
    expect(await screen.findByText(/Active effects/)).toBeVisible()
    await userEvent.click(await screen.findByRole('button', { name: /Equip title/ }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/titles/activate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ titleId: 12 }) }),
    )
  })
})
