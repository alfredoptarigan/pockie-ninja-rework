import type { ClanListView, ClanMemberView, ClanView } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { OpenWindowProvider } from '../windows'
import { ClanWindow } from './ClanWindow'

const me = { ...character, level: 35, stone: 200_000 }
const noop = () => {}
const member = (over: Partial<ClanMemberView>): ClanMemberView => ({
  characterId: 'x',
  name: 'Nobody',
  level: 30,
  role: 'member',
  weeklyPoints: 0,
  totalPoints: 0,
  online: false,
  offlineDays: 2,
  ...over,
})
const clan = (over: Partial<ClanView> = {}): ClanView => ({
  id: 'k1',
  name: 'Konoha',
  level: 1,
  notice: 'Train hard',
  stone: 1000,
  gold: 0,
  giftCoupon: 0,
  myRole: 'leader',
  members: [
    member({ characterId: me.id, name: me.name, role: 'leader', online: true, weeklyPoints: 40 }),
    member({ characterId: 'v', name: 'Sakura_1', role: 'vice', weeklyPoints: 75 }),
    member({ characterId: 'm', name: 'Rock_1' }),
  ],
  ...over,
})
const list: ClanListView = {
  clans: [
    { id: 'k1', name: 'Konoha', level: 2, members: 3, leader: 'Naruto_1', applied: false },
    { id: 's1', name: 'Suna', level: 1, members: 15, leader: 'Gaara_1', applied: false },
  ],
  total: 2,
  page: 1,
  pages: 1,
}
const result = (view: ClanView | null) => json({ clan: view, character: me })

function renderClan(open = vi.fn()) {
  renderWithProviders(
    <OpenWindowProvider value={open}>
      <ClanWindow character={me} onClose={noop} />
    </OpenWindowProvider>,
  )
  return open
}

afterEach(() => vi.restoreAllMocks())

describe('Clan Browser (no clan)', () => {
  it('lists clans and applies, marking the row Applied', async () => {
    const fetch = mockApi({
      'GET /api/game/clans/me': () => json({ clan: null }),
      'GET /api/game/clans': () => json(list),
      'POST /api/game/clans/apply': () => result(null),
    })
    renderClan()
    const konoha = await screen.findByRole('row', { name: 'Konoha' })
    expect(konoha).toHaveTextContent('3/15')
    expect(konoha).toHaveTextContent('Naruto_1')
    expect(
      within(screen.getByRole('row', { name: 'Suna' })).getByRole('button', { name: 'Full' }),
    ).toBeDisabled()
    expect(screen.getByText('Total: 2')).toBeInTheDocument()

    await userEvent.click(within(konoha).getByRole('button', { name: 'Apply' }))
    expect(requestBody(fetch, 'POST /api/game/clans/apply')).toEqual({ clanId: 'k1' })
    expect(await within(konoha).findByRole('button', { name: 'Applied' })).toBeDisabled()
  })

  it('reverts the Applied mark when the application fails', async () => {
    mockApi({
      'GET /api/game/clans/me': () => json({ clan: null }),
      'GET /api/game/clans': () => json(list),
      'POST /api/game/clans/apply': () => apiError(400, 'clan_full', 'That clan is full.'),
    })
    renderClan()
    const konoha = await screen.findByRole('row', { name: 'Konoha' })
    await userEvent.click(within(konoha).getByRole('button', { name: 'Apply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That clan is full.')
    expect(within(konoha).getByRole('button', { name: 'Apply' })).toBeEnabled()
  })

  it('searches by name', async () => {
    const fetch = mockApi({
      'GET /api/game/clans/me': () => json({ clan: null }),
      'GET /api/game/clans': () => json(list),
    })
    renderClan()
    await screen.findByRole('row', { name: 'Konoha' })
    await userEvent.type(screen.getByLabelText('Search'), 'su na!')
    await userEvent.click(screen.getByRole('button', { name: 'Find' }))
    const urls = fetch.mock.calls.map(([input]) => String(input))
    expect(urls).toContain('/api/game/clans?page=1&q=suna')
  })

  it('creates a clan with Reborn name rules, then opens the Clan window', async () => {
    const fetch = mockApi({
      'GET /api/game/clans/me': () => json({ clan: null }),
      'GET /api/game/clans': () => json(list),
      'GET /api/game/clans/create-info': () =>
        json({ free: true, cost: 500, minLevel: 30, levelOk: true }),
      'POST /api/game/clans/create': () => result(clan()),
    })
    const open = renderClan()
    await userEvent.click(await screen.findByRole('button', { name: 'Create' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create Clan' })
    expect(await within(dialog).findByText('Cost to Create: Free (first clan)')).toBeVisible()
    const input = within(dialog).getByLabelText('Enter Clan Name')
    await userEvent.type(input, 'Ko')
    expect(within(dialog).getByText('Minimum 4 characters.')).toBeInTheDocument()
    await userEvent.type(input, 'no ha!')
    expect(within(dialog).getByText('Invalid characters (A-Z 0-9).')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled()
    await userEvent.type(input, '{Backspace}')
    expect(within(dialog).getByText('6/10')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(requestBody(fetch, 'POST /api/game/clans/create')).toEqual({ name: 'Konoha' })
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('clan'))
  })

  it('shows the Gift Certificate cost in red when it cannot be paid', async () => {
    mockApi({
      'GET /api/game/clans/me': () => json({ clan: null }),
      'GET /api/game/clans': () => json(list),
      'GET /api/game/clans/create-info': () =>
        json({ free: false, cost: 500, minLevel: 30, levelOk: true }),
    })
    renderClan()
    await userEvent.click(await screen.findByRole('button', { name: 'Create' }))
    const cost = await screen.findByText('Cost to Create: 500 Gift Certificates')
    expect(cost).toHaveClass('text-[#a01010]')
  })
})

describe('Clan window', () => {
  it('shows the notice, info and members with positions', async () => {
    mockApi({ 'GET /api/game/clans/me': () => json({ clan: clan() }) })
    renderClan()
    expect(await screen.findByRole('dialog', { name: 'Clan' })).toBeInTheDocument()
    expect(screen.getByLabelText('Notice')).toHaveValue('Train hard')
    const rows = within(screen.getByRole('table', { name: 'Members' })).getAllByRole('row')
    expect(rows.slice(1).map((row) => row.getAttribute('aria-label'))).toEqual([
      me.name,
      'Sakura_1',
      'Rock_1',
    ])
    expect(screen.getByRole('row', { name: 'Sakura_1' })).toHaveTextContent('Vice-Leader')
    expect(screen.getByRole('row', { name: 'Rock_1' })).toHaveTextContent('2d')
  })

  it('lets the leader save the notice', async () => {
    const fetch = mockApi({
      'GET /api/game/clans/me': () => json({ clan: clan() }),
      'POST /api/game/clans/notice': () => result(clan({ notice: 'War tonight' })),
    })
    renderClan()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const notice = screen.getByLabelText('Notice')
    await userEvent.clear(notice)
    await userEvent.type(notice, 'War tonight')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(requestBody(fetch, 'POST /api/game/clans/notice')).toEqual({ notice: 'War tonight' })
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('hides Manage and Applications from plain members, and asks before quitting', async () => {
    const fetch = mockApi({
      'GET /api/game/clans/me': () => json({ clan: clan({ myRole: 'member' }) }),
      'POST /api/game/clans/leave': () => result(null),
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderClan()
    await userEvent.click(await screen.findByRole('button', { name: 'Quit' }))
    expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith('Are you sure you want to leave this clan?')
    expect(requestBody(fetch, 'POST /api/game/clans/leave')).toEqual({})
  })

  it('names the heir when the leader quits a clan with members', async () => {
    mockApi({ 'GET /api/game/clans/me': () => json({ clan: clan() }) })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderClan()
    await userEvent.click(await screen.findByRole('button', { name: 'Quit' }))
    expect(confirm).toHaveBeenCalledWith(
      'You lead this clan. Leaving makes Sakura_1 the new leader. Leave this clan?',
    )
  })

  it('offers the Manage actions the rules allow and confirms a kick', async () => {
    const fetch = mockApi({
      'GET /api/game/clans/me': () => json({ clan: clan({ myRole: 'vice' }) }),
      'POST /api/game/clans/kick': () => result(clan()),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderClan()
    await userEvent.click(await screen.findByRole('button', { name: 'Manage' }))
    const manage = await screen.findByRole('dialog', { name: 'Manage' })
    // A vice cannot touch the leader or itself in the list; on a member: Officer and Kick.
    const sakura = within(manage).getByRole('row', { name: 'Sakura_1' })
    expect(sakura).toHaveTextContent('--')
    const rock = within(manage).getByRole('row', { name: 'Rock_1' })
    expect(
      within(rock)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Officer', 'Kick'])
    expect(within(manage).getByText('Officers: 0/3')).toBeInTheDocument()
    await userEvent.click(within(rock).getByRole('button', { name: 'Kick' }))
    expect(window.confirm).toHaveBeenCalledWith('Kick Rock_1?')
    expect(requestBody(fetch, 'POST /api/game/clans/kick')).toEqual({ characterId: 'm' })
  })

  it('accepts an application', async () => {
    const fetch = mockApi({
      'GET /api/game/clans/me': () => json({ clan: clan() }),
      'GET /api/game/clans/applications': () =>
        json({ applications: [{ characterId: 'a', name: 'Neji_1', level: 31 }] }),
      'POST /api/game/clans/applications/accept': () => result(clan()),
    })
    renderClan()
    await userEvent.click(await screen.findByRole('button', { name: 'Applications' }))
    const row = await screen.findByRole('row', { name: 'Neji_1' })
    await userEvent.click(within(row).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetch, 'POST /api/game/clans/applications/accept')).toEqual({
      characterId: 'a',
    })
  })

  it('donates after Confirm your donation?', async () => {
    let current = clan()
    const fetch = mockApi({
      'GET /api/game/clans/me': () => json({ clan: current }),
      'POST /api/game/clans/donate': () => {
        current = clan({ stone: 151_000 })
        return result(current)
      },
    })
    renderClan()
    await userEvent.click(await screen.findByRole('tab', { name: 'Storage' }))
    await userEvent.click(screen.getByRole('button', { name: 'Donate Stones' }))
    const donate = await screen.findByRole('dialog', { name: 'Donate Stones' })
    await userEvent.type(within(donate).getByLabelText('Amount'), '150000')
    await userEvent.click(within(donate).getByRole('button', { name: 'Donate' }))
    const confirm = await screen.findByRole('dialog', { name: 'Confirm your donation?' })
    expect(confirm).toHaveTextContent(
      'Donate 150,000 Stones to the clan treasury for +10 contribution points?',
    )
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }))
    expect(requestBody(fetch, 'POST /api/game/clans/donate')).toEqual({
      currency: 'stone',
      amount: 150_000,
    })
    expect(await screen.findByText('151,000')).toBeInTheDocument()
  })

  it('splits a withdrawal among all members and ranks weekly contributions', async () => {
    const fetch = mockApi({
      'GET /api/game/clans/me': () => json({ clan: clan() }),
      'POST /api/game/clans/withdraw': () => result(clan({ stone: 1 })),
    })
    renderClan()
    await userEvent.click(await screen.findByRole('tab', { name: 'Storage' }))
    await userEvent.click(screen.getByRole('button', { name: 'Leaderboard' }))
    const board = await screen.findByRole('dialog', { name: 'Contribution Leaderboard' })
    expect(
      within(board)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(['1Sakura_175', `2${me.name}40`])
    // The second Close is Reborn's button under the table (the first is the title bar's).
    await userEvent.click(within(board).getAllByRole('button', { name: 'Close' })[1]!)

    await userEvent.click(screen.getByRole('button', { name: 'Withdraw Currency' }))
    const withdraw = await screen.findByRole('dialog', { name: 'Withdraw Currency' })
    await userEvent.click(within(withdraw).getByRole('radio', { name: 'Split All' }))
    await userEvent.type(within(withdraw).getByLabelText('Amount'), '999')
    expect(within(withdraw).getByText('Each member gets: 333')).toBeInTheDocument()
    await userEvent.click(within(withdraw).getByRole('button', { name: 'Stones' }))
    expect(requestBody(fetch, 'POST /api/game/clans/withdraw')).toEqual({
      mode: 'all',
      currency: 'stone',
      amount: 999,
    })
  })
})
