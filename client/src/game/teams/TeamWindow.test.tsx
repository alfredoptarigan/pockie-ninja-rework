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

describe('Party window', () => {
  it('creates a party by inviting a ninja by name', async () => {
    const fetch = mockApi({
      'GET /api/game/team': () => json(state(null)),
      'GET /api/game/social/friends': () => json(friends),
      'POST /api/game/team/invite': () =>
        json({ prompt: { promptId: 'p', expiresAt: '' }, ...state(null) }),
    })
    renderWindow()
    expect(await screen.findByText('You are not in a party.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create party' }))
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
    await userEvent.click(await screen.findByRole('button', { name: 'Create party' }))
    await userEvent.type(screen.getByLabelText('Ninja name'), 'Nobody')
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    expect(await screen.findByText('There is no ninja with that name.')).toBeInTheDocument()
  })

  it('shows the squad in fight order with its sequence', async () => {
    mockApi({
      'GET /api/game/team': () =>
        json(state({ ...trio, members: trio.members.map((m, i) => ({ ...m, online: i < 2 })) })),
    })
    renderWindow()
    const order = await screen.findByRole('list', { name: 'Fight order' })
    const cards = within(order).getAllByRole('listitem')
    expect(cards.map((li) => li.getAttribute('aria-label'))).toEqual([
      'Ninja_01',
      'Sakura_1',
      'Rock_1',
    ])
    expect(cards[0]).toHaveTextContent('#1')
    expect(cards[0]).toHaveTextContent('Ninja_01 Lv. 20')
    expect(cards[0]).toHaveTextContent('Leader')
    expect(cards[2]).toHaveTextContent('Offline')
    expect(screen.getByText('3/3 Members')).toBeInTheDocument()
    expect(screen.getByText('(#1 Ninja_01 → #2 Sakura_1 → #3 Rock_1)')).toBeInTheDocument()
    // A full party: no invite form; the order is set on the party portraits.
    expect(screen.queryByLabelText('Ninja name')).not.toBeInTheDocument()
  })

  it('lets the leader of two invite a third', async () => {
    mockApi({
      'GET /api/game/team': () =>
        json(state(team(ME, member(ME, 'Ninja_01', 0), member(SAKURA, 'Sakura_1', 1)))),
    })
    renderWindow()
    expect(await screen.findByText('2/3 Members')).toBeInTheDocument()
    expect(screen.getByLabelText('Ninja name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disband party' })).toBeInTheDocument()
  })

  it('does not let a member invite', async () => {
    mockApi({
      'GET /api/game/team': () =>
        json(state(team(SAKURA, member(SAKURA, 'Sakura_1', 0), member(ME, 'Ninja_01', 1)))),
    })
    renderWindow()
    expect(await screen.findByText('2/3 Members')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ninja name')).not.toBeInTheDocument()
  })

  it('leaves the party', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockApi({
      'GET /api/game/team': () => json(state(trio)),
      'POST /api/game/team/leave': () => json(state(null)),
      'GET /api/game/social/friends': () => json(friends),
    })
    renderWindow()
    await userEvent.click(await screen.findByRole('button', { name: 'Leave party' }))
    expect(await screen.findByText('You are not in a party.')).toBeInTheDocument()
  })

  it('shows the server refusal as it is', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockApi({
      'GET /api/game/team': () => json(state(trio)),
      'POST /api/game/team/leave': () => apiError(409, 'in_fight', 'Not during a fight.'),
    })
    renderWindow()
    await userEvent.click(await screen.findByRole('button', { name: 'Leave party' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not during a fight.')
  })
})
