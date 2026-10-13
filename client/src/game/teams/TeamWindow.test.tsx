import type { TeamMemberView, TeamState, TeamView } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { TeamWindow } from './TeamWindow'

const ME = '00000000-0000-4000-8000-000000000001'
const SAKURA = '00000000-0000-4000-8000-000000000002'
const ROCK = '00000000-0000-4000-8000-000000000003'
const me = { ...character, id: ME, sceneId: 2601 }

const member = (characterId: string, name: string, fightOrder: number): TeamMemberView => ({
  characterId,
  name,
  level: 20 + fightOrder,
  clothing: 3,
  gender: 0,
  hp: 100,
  maxHp: 100,
  mp: 50,
  maxMp: 50,
  fightOrder,
  captain: fightOrder === 0,
  online: true,
})

const team = (captainId: string, ...members: TeamMemberView[]): TeamView => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  sceneId: 2601,
  captainId,
  members: members.map((m) => ({ ...m, captain: m.characterId === captainId })),
})

const state = (view: TeamView | null, prompts: TeamState['prompts'] = []): TeamState => ({
  team: view,
  prompts,
})
const trio = team(
  ME,
  member(ME, 'Ninja_01', 0),
  member(SAKURA, 'Sakura_1', 1),
  member(ROCK, 'Rock_1', 2),
)
const friends = {
  friends: [
    {
      characterId: SAKURA,
      name: 'Sakura_1',
      level: 21,
      nation: 0,
      gender: 1,
      clothing: 3,
      avatarId: 3,
      online: true,
      mutual: true,
    },
  ],
  addBack: [],
  max: 50,
}

const noop = () => {}
const renderWindow = () => renderWithProviders(<TeamWindow character={me} onClose={noop} />)

afterEach(() => vi.restoreAllMocks())

describe('Team window', () => {
  it('creates a team by inviting a ninja by name', async () => {
    const fetch = mockApi({
      'GET /api/game/team': () => json(state(null)),
      'GET /api/game/social/friends': () => json(friends),
      'POST /api/game/team/invite': () =>
        json({ prompt: { promptId: 'p', expiresAt: '' }, ...state(null) }),
    })
    renderWindow()
    expect(await screen.findByText('You are not in a team.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create team' }))
    await userEvent.type(screen.getByLabelText('Ninja name'), 'sakura_1')
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    expect(await screen.findByText(/Invitation sent/)).toBeInTheDocument()
    expect(requestBody(fetch, 'POST /api/game/team/invite')).toEqual({ name: 'sakura_1' })
  })

  it('shows the server refusal for an unknown name', async () => {
    mockApi({
      'GET /api/game/team': () => json(state(null)),
      'POST /api/game/team/invite': () =>
        apiError(404, 'unknown_name', 'There is no ninja with that name.'),
    })
    renderWindow()
    await userEvent.click(await screen.findByRole('button', { name: 'Create team' }))
    await userEvent.type(screen.getByLabelText('Ninja name'), 'Nobody')
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    expect(await screen.findByText('There is no ninja with that name.')).toBeInTheDocument()
  })

  it('accepts an invitation and shows the new team', async () => {
    const expiresAt = new Date(Date.now() + 45_000).toISOString()
    const prompt = {
      id: '00000000-0000-4000-8000-0000000000bb',
      kind: 'invite' as const,
      from: { characterId: SAKURA, name: 'Sakura_1', level: 21 },
      expiresAt,
    }
    const fetch = mockApi({
      'GET /api/game/team': () => json(state(null, [prompt])),
      [`POST /api/game/team/prompts/${prompt.id}/accept`]: () =>
        json(state(team(SAKURA, member(SAKURA, 'Sakura_1', 0), member(ME, 'Ninja_01', 1)))),
    })
    renderWindow()
    expect(
      await screen.findByText(/Sakura_1 \(Level 21\) invites you to join a team/),
    ).toBeInTheDocument()
    expect(screen.getByText(/^\(4\d s\)$/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    const members = await screen.findByRole('list', { name: 'Members' })
    expect(within(members).getByRole('listitem', { name: 'Sakura_1' })).toHaveTextContent('Captain')
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/accept'))).toBe(true)
    // Not the captain: no captain controls, and the last two leave by disbanding.
    expect(screen.queryByRole('button', { name: /Kick/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disband team' })).toBeInTheDocument()
  })

  it('hides prompts past their expiry', async () => {
    mockApi({
      'GET /api/game/team': () =>
        json(
          state(null, [
            {
              id: '00000000-0000-4000-8000-0000000000cc',
              kind: 'apply',
              from: { characterId: ROCK, name: 'Rock_1', level: 30 },
              expiresAt: new Date(Date.now() - 1000).toISOString(),
            },
          ]),
        ),
    })
    renderWindow()
    expect(await screen.findByText('You are not in a team.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  })

  it('lets the captain kick and reorder', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetch = mockApi({
      'GET /api/game/team': () => json(state(trio)),
      'POST /api/game/team/kick': () =>
        json(state(team(ME, member(ME, 'Ninja_01', 0), member(SAKURA, 'Sakura_1', 1)))),
      'POST /api/game/team/order': () => json(state(trio)),
    })
    renderWindow()
    expect(await screen.findByRole('button', { name: 'Move Ninja_01 up' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move Rock_1 up' }))
    expect(requestBody(fetch, 'POST /api/game/team/order')).toEqual({
      characterId: ROCK,
      direction: 'up',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Kick Rock_1' }))
    expect(requestBody(fetch, 'POST /api/game/team/kick')).toEqual({ characterId: ROCK })
    expect(await screen.findByRole('button', { name: 'Disband team' })).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'Rock_1' })).not.toBeInTheDocument()
  })

  it('leaves the team', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockApi({
      'GET /api/game/team': () => json(state(trio)),
      'POST /api/game/team/leave': () => json(state(null)),
      'GET /api/game/social/friends': () => json(friends),
    })
    renderWindow()
    await userEvent.click(await screen.findByRole('button', { name: 'Leave team' }))
    expect(await screen.findByText('You are not in a team.')).toBeInTheDocument()
  })

  it('shows the server refusal as it is', async () => {
    mockApi({
      'GET /api/game/team': () => json(state(trio)),
      'POST /api/game/team/captain': () =>
        apiError(400, 'target_offline', 'That ninja is offline.'),
    })
    renderWindow()
    await userEvent.click(await screen.findByRole('button', { name: 'Make Sakura_1 captain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That ninja is offline.')
  })
})
