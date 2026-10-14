import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { SocialPlayer } from '../../../../shared/src/schemas/social'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { PlayerList } from './PlayerList'

const player = (i: number): SocialPlayer => ({
  characterId: `id-${i}`,
  name: `Ninja_${i}`,
  level: 10 + i,
  nation: 0,
  gender: 0,
  clothing: 3,
  avatarId: 1,
})
const players = Array.from({ length: 9 }, (_, i) => player(i))
const teamState = { team: null, prompts: [] }

function renderList(sceneId: number) {
  const fetchMock = mockApi({
    'GET /api/game/social/scene-players': () => json({ players }),
    'POST /api/game/team/invite': () => json(teamState),
    'GET /api/game/social/players/id-0': () =>
      json({ player: players[0], online: true, equipped: [] }),
    'GET /api/game/social/blocks': () => json({ blocked: [], max: 100 }),
  })
  renderWithProviders(<PlayerList character={{ ...character, sceneId }} />)
  return fetchMock
}

describe('PlayerList', () => {
  it('pages scene players by 7 with Lv., name and Invite; Friend and Apprentice are empty', async () => {
    renderList(2601)
    const list = screen.getByRole('region', { name: 'Player List' })
    expect(
      within(list)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Area', 'Friend', 'Apprentice'])
    const rows = await within(list).findAllByRole('listitem')
    expect(rows).toHaveLength(7)
    expect(rows[0]).toHaveTextContent('Lv.10')
    expect(rows[0]).toHaveTextContent('Ninja_0')
    await userEvent.click(within(list).getByRole('button', { name: 'Next page' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)

    await userEvent.click(within(list).getByRole('tab', { name: 'Friend' }))
    expect(within(list).queryAllByRole('listitem')).toEqual([])
  })

  it('invites to a team where teams form, and only there', async () => {
    const fetchMock = renderList(2601)
    const list = screen.getByRole('region', { name: 'Player List' })
    const [first] = await within(list).findAllByRole('listitem')
    await userEvent.click(within(first!).getByRole('button', { name: 'Invite' }))
    expect(requestBody(fetchMock, 'POST /api/game/team/invite')).toEqual({ characterId: 'id-0' })
  })

  it('disables Invite outside team scenes', async () => {
    renderList(2101)
    const [first] = await screen.findAllByRole('listitem')
    expect(within(first!).getByRole('button', { name: 'Invite' })).toBeDisabled()
  })

  it('opens View Character from a name and collapses from the header button', async () => {
    renderList(2101)
    const list = screen.getByRole('region', { name: 'Player List' })
    await userEvent.click(await within(list).findByRole('button', { name: 'Ninja_0' }))
    expect(await screen.findByRole('dialog', { name: 'View Character' })).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(within(list).getByRole('button', { name: 'Minimize' }))
    expect(within(list).queryByRole('tab')).toBeNull()
    await userEvent.click(within(list).getByRole('button', { name: 'Restore' }))
    expect(within(list).getAllByRole('tab')).toHaveLength(3)
  })
})
