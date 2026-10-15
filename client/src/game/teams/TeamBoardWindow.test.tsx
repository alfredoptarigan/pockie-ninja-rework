import type { TeamBoardView, TeamState } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { TeamBoardWindow } from './TeamBoardWindow'

const CAPTAIN = '00000000-0000-4000-8000-000000000002'
const me = { ...character, sceneId: 2601 }
const board: TeamBoardView = {
  sceneId: 2601,
  teams: [
    {
      teamId: '00000000-0000-4000-8000-0000000000aa',
      captain: { characterId: CAPTAIN, name: 'Sakura_1', level: 22, arenaTier: 3 },
      member: {
        characterId: '00000000-0000-4000-8000-000000000003',
        name: 'Rock_1',
        level: 20,
        arenaTier: null,
      },
    },
  ],
  solos: [
    {
      characterId: '00000000-0000-4000-8000-000000000004',
      name: 'Neji_1',
      level: 25,
      arenaTier: 1,
    },
  ],
  listed: false,
}
const solo: TeamState = { team: null, prompts: [] }
const noop = () => {}

describe('Team board window', () => {
  it('applies to a listed team', async () => {
    const fetch = mockApi({
      'GET /api/game/team/board': () => json(board),
      'GET /api/game/team': () => json(solo),
      'POST /api/game/team/apply': () =>
        json({ prompt: { promptId: 'p', expiresAt: '' }, ...solo }),
    })
    renderWithProviders(<TeamBoardWindow character={me} onClose={noop} />)
    const row = await screen.findByRole('listitem', {
      name: /Sakura_1 \(Lv\. 22, arena rank Prep IV\)/,
    })
    expect(row).toHaveTextContent('Rock_1 (Lv. 20, unranked)')
    await userEvent.click(within(row).getByRole('button', { name: 'Join' }))
    expect(await screen.findByText(/You asked to join Sakura_1's party/)).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/team/apply')).toEqual({ characterId: CAPTAIN })
  })

  it('lists solo ninjas and shows refusals as they come', async () => {
    mockApi({
      'GET /api/game/team/board': () => json(board),
      'GET /api/game/team': () => json(solo),
      'POST /api/game/team/invite': () =>
        apiError(400, 'not_same_scene', 'That ninja is not in this area.'),
      'POST /api/game/team/board/join': () => json({ ...board, listed: true }),
    })
    renderWithProviders(<TeamBoardWindow character={me} onClose={noop} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Looking for a Party' }))
    const row = screen.getByRole('listitem', { name: /Neji_1/ })
    await userEvent.click(within(row).getByRole('button', { name: 'Invite' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That ninja is not in this area.')
    await userEvent.click(screen.getByRole('button', { name: 'List myself' }))
    expect(await screen.findByRole('button', { name: 'Remove my listing' })).toBeInTheDocument()
  })

  it('shows the board refusal for a non-captain', async () => {
    mockApi({
      'GET /api/game/team/board': () =>
        apiError(400, 'not_captain', 'Only the team captain can use the team stone.'),
      'GET /api/game/team': () => json(solo),
    })
    renderWithProviders(<TeamBoardWindow character={me} onClose={noop} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the team captain can use the team stone.',
    )
  })
})
