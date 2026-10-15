import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { BuffsPanel } from './BuffsPanel'

describe('buffs and titles', () => {
  it('lists timed effects in a solid panel and removes a removable one', async () => {
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
          titles: [],
        }),
      'POST /api/game/buffs/50001/remove': () => json({ character, buffs: [], titles: [] }),
    })
    renderWithProviders(<BuffsPanel onClose={() => {}} />)
    expect(await screen.findByRole('dialog', { name: 'Active effects' })).toHaveClass(
      'game-panel-1',
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Remove effect' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/buffs/50001/remove',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
