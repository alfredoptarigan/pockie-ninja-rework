import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { character, villageScene } from '../test/game'
import { createFakeSocket, type FakeSocket } from '../test/socket'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { Play } from './Play'

let socket: FakeSocket
vi.mock('../lib/socket', () => ({ createGameSocket: () => socket }))
beforeEach(() => {
  socket = createFakeSocket()
})

const LAZY = { timeout: 5000 }

const user = {
  id: 'u1',
  username: 'Naruto',
  email: 'naruto@konoha.example',
  role: 'admin',
  createdAt: '2026-10-11T00:00:00Z',
}

const signedIn = { 'GET /api/auth/me': () => json({ user }) }
const inGame = {
  ...signedIn,
  'GET /api/game/character': () => json({ character }),
  'GET /api/game/scene': () => json(villageScene),
  'GET /api/game/quests': () => json({ quests: [] }),
}

function renderPlay(route = '/play') {
  return renderWithProviders(<Play />, {
    route,
    path: '/play',
    otherPaths: ['/login', '/', '/play/create'],
  })
}

describe('Play', () => {
  it('sends visitors without a session to the login page', async () => {
    mockApi({ 'GET /api/auth/me': () => apiError(401, 'unauthenticated', 'Please log in.') })
    renderPlay()
    expect(await screen.findByTestId('location')).toHaveTextContent('/login')
  })

  it('sends players without a ninja to character creation', async () => {
    mockApi({
      ...signedIn,
      'GET /api/game/character': () => apiError(404, 'no_character', 'Create your ninja first.'),
    })
    renderPlay()
    // The game bundle loads lazily; the first import can be slow in a full test run.
    expect(await screen.findByTestId('location', {}, LAZY)).toHaveTextContent('/play/create')
  })

  it('shows the character, the scene and the chat', async () => {
    mockApi(inGame)
    renderPlay()

    expect(await screen.findByRole('heading', { name: 'Ninja_01' }, LAZY)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Fire Village' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fire Village Elder in the Hall' })).toBeVisible()
    expect(screen.getByRole('meter', { name: 'HP' })).toHaveAttribute('aria-valuenow', '120')
    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument()
  })

  it('logs out and returns to the landing page', async () => {
    mockApi({ ...inGame, 'POST /api/auth/logout': () => new Response(null, { status: 204 }) })
    renderPlay()

    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }, LAZY))
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/$/)
    expect(socket.disconnected).toBe(true)
  })
})
