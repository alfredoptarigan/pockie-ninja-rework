import type { TeamMemberView, TeamState, TeamView } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { TeamHud } from './TeamHud'

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
  hp: 50,
  maxHp: 100,
  mp: 50,
  maxMp: 50,
  fightOrder,
  captain: false,
  online: true,
})

const trio = (captainId: string): TeamView => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  sceneId: 2601,
  captainId,
  members: [
    member(ME, 'Ninja_01', 0),
    member(SAKURA, 'Sakura_1', 1),
    member(ROCK, 'Rock_1', 2),
  ].map((m) => ({ ...m, captain: m.characterId === captainId })),
})
const state = (team: TeamView | null, prompts: TeamState['prompts'] = []): TeamState => ({
  team,
  prompts,
})
const invite = {
  id: '00000000-0000-4000-8000-0000000000bb',
  kind: 'invite' as const,
  from: { characterId: SAKURA, name: 'Sakura_1', level: 21 },
  expiresAt: new Date(Date.now() + 45_000).toISOString(),
}

const portraits = () => screen.findByRole('list', { name: 'Party members' })
const card = async (name: string) => within(await portraits()).getByRole('listitem', { name })

afterEach(() => vi.restoreAllMocks())

describe('Party portraits', () => {
  it('shows nothing outside the team scenes', () => {
    const fetch = mockApi({})
    renderWithProviders(<TeamHud character={{ ...me, sceneId: 111 }} />)
    expect(screen.queryByRole('button', { name: 'Party' })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('draws one card per member in fight order with level, bars and the leader crown', async () => {
    mockApi({ 'GET /api/game/team': () => json(state(trio(SAKURA))) })
    renderWithProviders(<TeamHud character={me} />)
    const cards = within(await portraits()).getAllByRole('listitem')
    expect(cards.map((li) => li.getAttribute('aria-label'))).toEqual([
      'Ninja_01',
      'Sakura_1',
      'Rock_1',
    ])
    const sakura = await card('Sakura_1')
    expect(within(sakura).getByLabelText('Level')).toHaveTextContent('21')
    expect(within(sakura).getByRole('meter', { name: 'HP' })).toHaveAttribute('aria-valuenow', '50')
    expect(within(sakura).getByRole('meter', { name: 'MP' })).toBeInTheDocument()
    expect(within(sakura).getByRole('meter', { name: 'VP' })).toBeInTheDocument()
    expect(within(sakura).getByRole('img', { name: 'Party leader' })).toBeInTheDocument()
    expect(within(await card('Rock_1')).queryByRole('img', { name: 'Party leader' })).toBeNull()
  })

  it('gives a member only the X on their own card, which leaves the party', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetch = mockApi({
      'GET /api/game/team': () => json(state(trio(SAKURA))),
      'POST /api/game/team/leave': () => json(state(null)),
    })
    renderWithProviders(<TeamHud character={me} />)
    expect(
      within(await card('Sakura_1')).queryAllByRole('button', { name: /Kick|Promote|Move/ }),
    ).toEqual([])
    expect(screen.queryByRole('button', { name: /Move/ })).not.toBeInTheDocument()
    await userEvent.click(
      within(await card('Ninja_01')).getByRole('button', { name: 'Leave party' }),
    )
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/team/leave'))).toBe(true)
    expect(await screen.findByRole('button', { name: 'Party' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Party members' })).not.toBeInTheDocument()
  })

  it('lets the leader kick, promote and reorder from the cards', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetch = mockApi({
      'GET /api/game/team': () => json(state(trio(ME))),
      'POST /api/game/team/kick': () => json(state(trio(ME))),
      'POST /api/game/team/captain': () => json(state(trio(ME))),
      'POST /api/game/team/order': () => json(state(trio(ME))),
    })
    renderWithProviders(<TeamHud character={me} />)
    const first = await card('Ninja_01')
    const last = await card('Rock_1')
    // The first card has no up arrow, the last no down arrow; no promote on my own card.
    expect(within(first).queryByRole('button', { name: 'Move Ninja_01 up' })).toBeNull()
    expect(within(first).queryByRole('button', { name: /Promote/ })).toBeNull()
    expect(within(last).queryByRole('button', { name: 'Move Rock_1 down' })).toBeNull()

    await userEvent.click(within(last).getByRole('button', { name: 'Move Rock_1 up' }))
    expect(requestBody(fetch, 'POST /api/game/team/order')).toEqual({
      characterId: ROCK,
      direction: 'up',
    })
    await userEvent.click(within(last).getByRole('button', { name: 'Promote Rock_1' }))
    expect(requestBody(fetch, 'POST /api/game/team/captain')).toEqual({ characterId: ROCK })
    await userEvent.click(within(last).getByRole('button', { name: 'Kick Rock_1' }))
    expect(requestBody(fetch, 'POST /api/game/team/kick')).toEqual({ characterId: ROCK })
  })

  it('shows the server refusal of a card action', async () => {
    mockApi({
      'GET /api/game/team': () => json(state(trio(ME))),
      'POST /api/game/team/captain': () =>
        apiError(400, 'target_offline', 'That ninja is offline.'),
    })
    renderWithProviders(<TeamHud character={me} />)
    await userEvent.click(
      within(await card('Sakura_1')).getByRole('button', { name: 'Promote Sakura_1' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('That ninja is offline.')
  })

  it('opens View Character from the name', async () => {
    mockApi({
      'GET /api/game/team': () => json(state(trio(ME))),
      [`GET /api/game/social/players/${SAKURA}`]: () => apiError(404, 'not_found', 'Not found.'),
      'GET /api/game/social/blocks': () => json({ blocked: [] }),
    })
    renderWithProviders(<TeamHud character={me} />)
    await userEvent.click(within(await card('Sakura_1')).getByRole('button', { name: 'Sakura_1' }))
    expect(await screen.findByRole('dialog', { name: 'View Character' })).toBeInTheDocument()
  })
})

describe('Party Invite', () => {
  it('accepts an invitation from the popup', async () => {
    const fetch = mockApi({
      'GET /api/game/team': () => json(state(null, [invite])),
      [`POST /api/game/team/prompts/${invite.id}/accept`]: () => json(state(trio(SAKURA))),
    })
    renderWithProviders(<TeamHud character={me} />)
    const popup = await screen.findByRole('dialog', { name: 'Party Invite' })
    expect(popup).toHaveTextContent('Sakura_1 (Level 21) invites you to join their party.')
    expect(popup).toHaveTextContent(/\(4\d s\)/)
    await userEvent.click(within(popup).getByRole('button', { name: 'Accept' }))
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/accept'))).toBe(true)
    expect(await portraits()).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Party Invite' })).not.toBeInTheDocument()
  })

  it('denies an application from the popup', async () => {
    const apply = { ...invite, kind: 'apply' as const }
    const fetch = mockApi({
      'GET /api/game/team': () => json(state(null, [apply])),
      [`POST /api/game/team/prompts/${apply.id}/refuse`]: () => json(state(null)),
    })
    renderWithProviders(<TeamHud character={me} />)
    const popup = await screen.findByRole('dialog', { name: 'Party Request' })
    expect(popup).toHaveTextContent('Sakura_1 (Level 21) asks to join your party.')
    await userEvent.click(within(popup).getByRole('button', { name: 'Deny' }))
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/refuse'))).toBe(true)
  })

  it('drops an expired invitation', async () => {
    mockApi({
      'GET /api/game/team': () =>
        json(state(null, [{ ...invite, expiresAt: new Date(Date.now() - 1000).toISOString() }])),
    })
    renderWithProviders(<TeamHud character={me} />)
    expect(await screen.findByRole('button', { name: 'Party' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
