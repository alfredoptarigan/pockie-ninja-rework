import type { ChatMessage } from '@pockie/shared'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMe } from '../lib/auth'
import { createFakeSocket, type FakeSocket } from '../test/socket'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { RealtimePanels } from './Chat'

let socket: FakeSocket
vi.mock('../lib/socket', () => ({ createGameSocket: () => socket }))
beforeEach(() => {
  socket = createFakeSocket()
})

const message = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  channel: 'world',
  sender: { characterId: 'c2', name: 'Sasuke_1' },
  text: 'Hello',
  sentAt: '2026-10-12T00:00:00Z',
  ...overrides,
})

function renderChat() {
  renderWithProviders(<RealtimePanels characterId="c1" />)
  act(() => socket.serverEmit('connect'))
}

describe('Chat', () => {
  it('renders messages as plain text, never as HTML', () => {
    renderChat()
    act(() =>
      socket.serverEmit(
        'chat:message',
        message({ text: '<img src=x onerror=alert(1)><b>bold</b>' }),
      ),
    )

    const log = screen.getByRole('list', { name: 'world messages' })
    expect(log).toHaveTextContent('Sasuke_1: <img src=x onerror=alert(1)><b>bold</b>')
    expect(log.querySelector('img, b')).toBeNull()
  })

  it('keeps world and scene messages on their own tabs', async () => {
    renderChat()
    act(() => {
      socket.serverEmit('chat:message', message({ id: 'w', text: 'world news' }))
      socket.serverEmit('chat:message', message({ id: 's', channel: 'scene', text: 'over here' }))
    })
    expect(screen.queryByText('over here')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Scene' }))

    expect(screen.getByText('over here')).toBeInTheDocument()
    expect(screen.queryByText('world news')).not.toBeInTheDocument()
  })

  it('sends on the active channel and shows ack errors', async () => {
    renderChat()
    socket.onSend = () => ({
      ok: false,
      error: { code: 'rate_limited', message: 'You are sending messages too fast.' },
    })

    await userEvent.type(screen.getByLabelText('Message to world chat'), 'hi all{Enter}')

    expect(socket.sent).toEqual([{ channel: 'world', text: 'hi all' }])
    expect(await screen.findByRole('alert')).toHaveTextContent('You are sending messages too fast.')
    expect(screen.getByLabelText('Message to world chat')).toHaveValue('hi all')
  })

  it('clears the input when the server accepts the message', async () => {
    renderChat()
    socket.onSend = (input) => ({ ok: true, message: message({ text: input.text }) })

    await userEvent.type(screen.getByLabelText('Message to world chat'), 'hi all{Enter}')

    expect(screen.getByLabelText('Message to world chat')).toHaveValue('')
  })

  it('lists the players in the scene', async () => {
    renderChat()
    act(() =>
      socket.serverEmit('scene:players', {
        sceneId: 111,
        players: [
          { characterId: 'c1', name: 'Ninja_01', level: 3, clothing: 3, gender: 0, nation: 0 },
          { characterId: 'c2', name: 'Sasuke_1', level: 7, clothing: 9, gender: 0, nation: 0 },
        ],
      }),
    )

    // The list opens from the chat header.
    expect(screen.queryByRole('region', { name: /Players here/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Players (2)' }))

    const list = screen.getByRole('region', { name: 'Players here (2)' })
    expect(within(list).getByText('Sasuke_1')).toBeInTheDocument()
    expect(within(list).getByText('Lv. 7')).toBeInTheDocument()
  })

  it('explains handshake rejections', () => {
    renderWithProviders(<RealtimePanels characterId="c1" />)
    act(() =>
      socket.serverEmit(
        'connect_error',
        Object.assign(new Error('rejected'), { data: { code: 'unauthenticated' } }),
      ),
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Your session ended. Please log in again.')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('asks to close a tab when too many game tabs are open', () => {
    renderWithProviders(<RealtimePanels characterId="c1" />)
    act(() =>
      socket.serverEmit(
        'connect_error',
        Object.assign(new Error('rejected'), { data: { code: 'too_many_connections' } }),
      ),
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Too many game tabs are open. Close one and reload.',
    )
  })

  it('says chat is unavailable when the connection fails without a reason', () => {
    renderWithProviders(<RealtimePanels characterId="c1" />)
    // A foreign origin (HTTP 403) or an unreachable server: no `data`.
    act(() => socket.serverEmit('connect_error', new Error('xhr poll error')))

    expect(screen.getByRole('alert')).toHaveTextContent('Chat is unavailable. Reconnecting...')
  })

  it('sends the player to log in again when a message finds the session ended', async () => {
    let sessionChecks = 0
    mockApi({
      'GET /api/auth/me': () => {
        sessionChecks++
        return sessionChecks === 1
          ? json({ user: { id: 'u1', username: 'Player_one' } })
          : apiError(401, 'unauthenticated', 'Please log in.')
      },
    })
    renderWithProviders(
      <>
        <SessionProbe />
        <RealtimePanels characterId="c1" />
      </>,
    )
    act(() => socket.serverEmit('connect'))
    await waitFor(() => expect(sessionChecks).toBe(1))
    socket.onSend = () => ({
      ok: false,
      error: { code: 'unauthenticated', message: 'Your session ended. Please log in again.' },
    })

    await userEvent.type(screen.getByLabelText('Message to world chat'), 'hi all{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended. Please log in again.',
    )
    // The session is checked again; the route guard then sends the player to the login page.
    await waitFor(() => expect(sessionChecks).toBe(2))
  })
})

/** Watches the session like the route guard of /play does. */
function SessionProbe() {
  useMe()
  return null
}
