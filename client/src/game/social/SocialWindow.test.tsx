import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FriendEntry, FriendsView } from '../../../../shared/src/schemas/social'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { onWhisperRequest } from './requests'
import { SocialWindow, type SocialTab } from './SocialWindow'

const friend = (name: string, online = false, level = 12): FriendEntry => ({
  characterId: `id-${name}`,
  name,
  level,
  nation: 0,
  gender: 0,
  clothing: 3,
  avatarId: 1,
  online,
  mutual: true,
})

const view = (friends: FriendEntry[], addBack: FriendsView['addBack'] = []): FriendsView => ({
  friends,
  addBack,
  max: 100,
})

function renderSocial(
  handlers: Parameters<typeof mockApi>[0] = {},
  { tab = 'friends' as SocialTab, friends = view([friend('Bo', true), friend('Cy')]) } = {},
) {
  const onClose = vi.fn()
  const fetchMock = mockApi({
    'GET /api/game/social/friends': () => json(friends),
    'GET /api/game/social/blocks': () => json({ blocked: [], max: 100 }),
    'GET /api/game/social/mail/summary': () => json({ unread: 0, categories: [] }),
    'GET /api/game/social/mail': () => json({ mails: [], unread: 0, categories: [] }),
    ...handlers,
  })
  renderWithProviders(<SocialWindow character={character} tab={tab} onClose={onClose} />)
  return { fetchMock, onClose }
}

afterEach(() => vi.restoreAllMocks())

describe('SocialWindow', () => {
  it('opens on the given tab with Friends, Requests, Mail and Blocked', async () => {
    renderSocial({}, { tab: 'mail' })
    const dialog = screen.getByRole('dialog', { name: 'Social' })
    const tabs = within(dialog).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Friends', 'Requests', 'Mail', 'Blocked'])
    expect(within(dialog).getByRole('tab', { name: 'Mail' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await within(dialog).findByRole('navigation', { name: 'Mail categories' })).toBeVisible()
  })

  it('lists friends with totals, columns, status and Reborn pages of 8', async () => {
    const many = Array.from({ length: 10 }, (_, i) => friend(`Ninja_${i}`, i < 3))
    renderSocial({}, { friends: view(many) })
    const dialog = screen.getByRole('dialog', { name: 'Social' })
    expect(await within(dialog).findByText('Total Friends: 10 | Online: 3')).toBeVisible()
    for (const column of ['Name', 'Level', 'Village', 'Status', 'Action'])
      expect(within(dialog).getByText(column, { exact: true })).toBeVisible()

    const rows = () =>
      within(screen.getByRole('list', { name: 'Friends' })).getAllByRole('listitem')
    expect(rows()).toHaveLength(8)
    expect(rows()[0]).toHaveTextContent('Ninja_0')
    expect(rows()[0]).toHaveTextContent('12')
    expect(rows()[0]).toHaveTextContent('Online')
    expect(rows()[5]).toHaveTextContent('Offline')
    expect(within(dialog).getByText('1/2')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next page' }))
    expect(rows()).toHaveLength(2)
    expect(within(dialog).getByText('2/2')).toBeVisible()
  })

  it('shows the empty list text', async () => {
    renderSocial({}, { friends: view([]) })
    expect(await screen.findByText('Your friends list is empty')).toBeVisible()
    expect(screen.getByText('Type a player name above and send a friend request.')).toBeVisible()
  })

  it('removes a friend after the confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { fetchMock } = renderSocial({
      'POST /api/game/social/friends/remove': () => json(view([friend('Cy')])),
    })
    const row = (await screen.findByText('Bo')).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Remove' }))
    expect(confirm).toHaveBeenCalledWith('Remove this friend?')
    expect(requestBody(fetchMock, 'POST /api/game/social/friends/remove')).toEqual({
      characterId: 'id-Bo',
    })
  })

  it('sends a friend request with Reborn status lines', async () => {
    const { fetchMock } = renderSocial({
      'POST /api/game/social/friends/add': (_url, init) =>
        JSON.parse(String(init?.body)).name === 'Nobody'
          ? apiError(404, 'unknown_name', 'There is no ninja with that name.')
          : json(view([friend('Bo', true), friend('Cy'), friend('Dee')])),
    })
    const dialog = screen.getByRole('dialog', { name: 'Social' })
    await within(dialog).findByText('Bo')
    const input = within(dialog).getByLabelText('Player Name')
    expect(input).toHaveAttribute('placeholder', 'Search by name...')
    const send = within(dialog).getByRole('button', { name: 'Send Friend Request' })

    await userEvent.click(send)
    expect(within(dialog).getByText("Enter the player's name.")).toBeVisible()

    await userEvent.type(input, character.name.toUpperCase())
    await userEvent.click(send)
    expect(within(dialog).getByText('You cannot add yourself as a friend')).toBeVisible()

    await userEvent.clear(input)
    await userEvent.type(input, 'bo')
    await userEvent.click(send)
    expect(within(dialog).getByText('Already friends')).toBeVisible()

    await userEvent.clear(input)
    await userEvent.type(input, 'Nobody{Enter}')
    expect(await within(dialog).findByText('Player not found')).toBeVisible()

    await userEvent.clear(input)
    await userEvent.type(input, 'Dee{Enter}')
    expect(await within(dialog).findByText('Friend request sent!')).toBeVisible()
    expect(input).toHaveValue('')
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/friends/add')),
    ).toHaveLength(2)
  })

  it('answers friend requests (add-back prompts) with Accept and Reject', async () => {
    const asker = { ...friend('Eve', true), mutual: undefined }
    const { fetchMock } = renderSocial(
      { 'POST /api/game/social/friends/add-back': () => json(view([])) },
      { tab: 'requests', friends: view([], [asker]) },
    )
    const list = await screen.findByRole('list', { name: 'Friend requests' })
    const row = within(list).getByRole('listitem')
    expect(row).toHaveTextContent('Eve')
    expect(row).toHaveTextContent('Online')
    await userEvent.click(within(row).getByRole('button', { name: 'Accept' }))
    expect(requestBody(fetchMock, 'POST /api/game/social/friends/add-back')).toEqual({
      characterId: 'id-Eve',
      accept: true,
    })
    await userEvent.click(within(row).getByRole('button', { name: 'Reject' }))
    const answers = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/add-back'))
    expect(answers.at(-1)?.[1]?.body).toBe(JSON.stringify({ characterId: 'id-Eve', accept: false }))
  })

  it('shows the empty Requests and Blocked texts and unblocks', async () => {
    const blocked = { ...friend('Foe'), online: undefined, mutual: undefined }
    const { fetchMock } = renderSocial(
      {
        'GET /api/game/social/blocks': () => json({ blocked: [blocked], max: 100 }),
        'POST /api/game/social/blocks/remove': () => json({ blocked: [], max: 100 }),
      },
      { tab: 'requests' },
    )
    expect(await screen.findByText('No friend requests')).toBeVisible()
    expect(screen.getByText('Requests other players send you appear here.')).toBeVisible()

    await userEvent.click(screen.getByRole('tab', { name: 'Blocked' }))
    const row = within(await screen.findByRole('list', { name: 'Blocked players' })).getByRole(
      'listitem',
    )
    expect(row).toHaveTextContent('Foe')
    await userEvent.click(within(row).getByRole('button', { name: 'Unblock' }))
    expect(requestBody(fetchMock, 'POST /api/game/social/blocks/remove')).toEqual({
      characterId: 'id-Foe',
    })
  })

  it('opens View Character from a friend name; PM starts a whisper and closes', async () => {
    const whispers: string[] = []
    const off = onWhisperRequest((name) => whispers.push(name))
    const { fetchMock, onClose } = renderSocial({
      'GET /api/game/social/players/id-Bo': () =>
        json({
          player: { ...friend('Bo'), online: undefined, mutual: undefined, level: 31 },
          online: true,
          equipped: [{ slot: 'Weapon', itemId: 'i270100', nameKey: 'lg_x', enhanceLevel: 2 }],
        }),
      'POST /api/game/social/blocks/add': () => json({ blocked: [], max: 100 }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Bo' }))
    const sheet = await screen.findByRole('dialog', { name: 'View Character' })
    expect(await within(sheet).findByText('Level 31')).toBeVisible()
    expect(within(sheet).getByRole('img', { name: 'Weapon: i270100 +2' })).toBeVisible()
    expect(within(sheet).getByRole('button', { name: 'Duel' })).toBeDisabled()
    expect(within(sheet).getByRole('button', { name: 'Trade' })).toBeDisabled()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Block' }))
    expect(requestBody(fetchMock, 'POST /api/game/social/blocks/add')).toEqual({
      characterId: 'id-Bo',
    })

    await userEvent.click(within(sheet).getByRole('button', { name: 'PM' }))
    expect(whispers).toEqual(['Bo'])
    expect(onClose).toHaveBeenCalled()
    off()
  })
})
