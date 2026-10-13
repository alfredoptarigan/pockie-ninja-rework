import type { ChatMessage, Notice } from '@pockie/shared'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMe } from '../lib/auth'
import { createFakeSocket, type FakeSocket } from '../test/socket'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { onNotice, RealtimePanels } from './Chat'
import { requestWhisper } from './social/requests'

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

    const log = screen.getByRole('list', { name: 'World messages' })
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

  it('shows each line as time, [Channel], name and text', () => {
    renderChat()
    act(() => socket.serverEmit('chat:message', message({ text: 'gm' })))

    const line = within(screen.getByRole('list', { name: 'World messages' })).getByRole('listitem')
    // Then the Report action, shown on hover or focus.
    expect(line).toHaveTextContent(/^\d\d:\d\d \[World\] Sasuke_1: gm Report$/)
    expect(line.querySelector('time')).toHaveAttribute('datetime', '2026-10-12T00:00:00Z')
  })

  it('merges both channels on the All tab', async () => {
    renderChat()
    act(() => {
      socket.serverEmit('chat:message', message({ id: 'w', text: 'world news' }))
      socket.serverEmit('chat:message', message({ id: 's', channel: 'scene', text: 'over here' }))
    })

    await userEvent.click(screen.getByRole('tab', { name: 'All' }))

    const log = screen.getByRole('list', { name: 'All messages' })
    expect(log).toHaveTextContent('[World] Sasuke_1: world news')
    expect(log).toHaveTextContent('[Scene] Sasuke_1: over here')
  })

  it('sends on the channel picked by the tab or the channel select', async () => {
    renderChat()
    socket.onSend = (input) => ({ ok: true, message: message({ text: input.text }) })

    await userEvent.click(screen.getByRole('tab', { name: 'Scene' }))
    expect(screen.getByLabelText('Send to')).toHaveValue('scene')
    await userEvent.type(screen.getByLabelText('Message to scene chat'), 'near{Enter}')

    await userEvent.click(screen.getByRole('tab', { name: 'All' }))
    await userEvent.selectOptions(screen.getByLabelText('Send to'), 'world')
    await userEvent.type(screen.getByLabelText('Message to world chat'), 'far{Enter}')

    expect(socket.sent).toEqual([
      { channel: 'scene', text: 'near' },
      { channel: 'world', text: 'far' },
    ])
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

  it('shows the connection state on the dark HUD plate so it reads over the scene', () => {
    renderChat()
    const state = screen.getByRole('status')
    expect(state).toHaveTextContent('Online')
    expect(state).toHaveClass('game-hud')
    act(() => socket.serverEmit('disconnect'))
    expect(screen.getByRole('status')).toHaveTextContent('Offline')
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

describe('Chat whispers, team and reports', () => {
  const me = { characterId: 'c1', name: 'Ninja_01' }
  const sasuke = { characterId: 'c2', name: 'Sasuke_1' }

  it('sends /Name text as a whisper and keeps the name for a follow-up', async () => {
    renderChat()
    socket.onSend = (input) => ({ ok: true, message: message({ text: input.text }) })

    await userEvent.type(
      screen.getByLabelText('Message to world chat'),
      '/Sasuke_1 hi there{Enter}',
    )

    expect(socket.sent).toEqual([{ channel: 'whisper', to: 'Sasuke_1', text: 'hi there' }])
    expect(screen.getByLabelText('Message to world chat')).toHaveValue('/Sasuke_1 ')
  })

  it('starts a whisper asked for by another window (the Friends list)', () => {
    renderChat()

    act(() => requestWhisper('Sasuke_1'))

    expect(screen.getByLabelText('Message to world chat')).toHaveValue('/Sasuke_1 ')
    expect(screen.getByLabelText('Message to world chat')).toHaveFocus()
  })

  it('explains the whisper syntax on the Whisper tab', async () => {
    renderChat()
    await userEvent.click(screen.getByRole('tab', { name: 'Whisper' }))
    await userEvent.type(screen.getByLabelText('Whisper (/Name message)'), 'hello{Enter}')

    expect(socket.sent).toEqual([])
    expect(screen.getByRole('alert')).toHaveTextContent('To whisper, type /Name and your message.')
  })

  it('shows whispers both ways on the Whisper tab and starts a reply from a name', async () => {
    renderChat()
    act(() => {
      socket.serverEmit('chat:message', message({ id: 'w', text: 'world news' }))
      socket.serverEmit(
        'chat:message',
        message({ id: 'in', channel: 'whisper', sender: sasuke, to: me, text: 'psst' }),
      )
      socket.serverEmit(
        'chat:message',
        message({ id: 'out', channel: 'whisper', sender: me, to: sasuke, text: 'yes?' }),
      )
    })
    await userEvent.click(screen.getByRole('tab', { name: 'Whisper' }))

    const log = screen.getByRole('list', { name: 'Whisper messages' })
    expect(log).not.toHaveTextContent('world news')
    expect(log).toHaveTextContent('[Whisper] From Sasuke_1: psst')
    expect(log).toHaveTextContent('[Whisper] To Sasuke_1: yes?')

    await userEvent.click(within(log).getAllByRole('button', { name: 'Whisper to Sasuke_1' })[0]!)
    expect(screen.getByLabelText('Whisper (/Name message)')).toHaveValue('/Sasuke_1 ')
  })

  it('has a Team tab and channel only in a team', async () => {
    renderWithProviders(<TeamToggle />)
    act(() => socket.serverEmit('connect'))
    expect(screen.queryByRole('tab', { name: 'Team' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Join a team' }))
    socket.onSend = (input) => ({ ok: true, message: message({ text: input.text }) })
    await userEvent.click(screen.getByRole('tab', { name: 'Team' }))
    await userEvent.type(screen.getByLabelText('Message to team chat'), 'ready{Enter}')
    expect(socket.sent).toEqual([{ channel: 'team', text: 'ready' }])
  })

  it('reports a line once with the text as shown', async () => {
    renderChat()
    act(() => socket.serverEmit('chat:message', message({ id: 'bad', text: 'rude ****' })))
    socket.onSend = () => ({ ok: true }) as never

    await userEvent.click(screen.getByRole('button', { name: 'Report this message from Sasuke_1' }))

    expect(socket.sent).toEqual([{ channel: 'world', characterId: 'c2', text: 'rude ****' }])
    expect(screen.getByText('Your report was sent. Thank you.')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Report this message from Sasuke_1' }),
    ).not.toBeInTheDocument()
  })

  it('offers no report or whisper on your own lines', () => {
    renderChat()
    act(() => socket.serverEmit('chat:message', message({ sender: me, text: 'mine' })))
    expect(screen.queryByRole('button', { name: /Report|Whisper to/ })).not.toBeInTheDocument()
  })

  it('turns notices and friend presence into system lines and tells listeners', () => {
    const notices: Notice[] = []
    const off = onNotice((notice) => notices.push(notice))
    renderChat()
    const from = { characterId: 'c2', name: 'Sasuke_1', level: 12 }
    act(() => {
      socket.serverEmit('notice', { kind: 'mail', mailId: 'm', category: 'player' })
      socket.serverEmit('notice', {
        kind: 'teamPrompt',
        promptId: 'p',
        prompt: 'invite',
        from,
        expiresAt: '2026-10-12T00:01:00Z',
      })
      socket.serverEmit('notice', { kind: 'teamChanged', teamId: null })
      socket.serverEmit('notice', { kind: 'friendAdded', from })
      socket.serverEmit('friend:presence', { characterId: 'c2', name: 'Sasuke_1', online: true })
    })
    off()

    const log = screen.getByRole('list', { name: 'World messages' })
    expect(log).toHaveTextContent('[System] You have new mail.')
    expect(log).toHaveTextContent('Sasuke_1 (Level 12) has invited you to join a team.')
    expect(log).toHaveTextContent('Sasuke_1 added you as a friend.')
    expect(log).toHaveTextContent('Sasuke_1 is now online.')
    expect(within(log).getAllByRole('listitem')).toHaveLength(4)
    expect(notices.map((n) => n.kind)).toEqual(['mail', 'teamPrompt', 'teamChanged', 'friendAdded'])
  })
})

/** Stands in for the team state the game screen passes down. */
function TeamToggle() {
  const [inTeam, setInTeam] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setInTeam(true)}>
        Join a team
      </button>
      <RealtimePanels characterId="c1" inTeam={inTeam} />
    </>
  )
}

/** Watches the session like the route guard of /play does. */
function SessionProbe() {
  useMe()
  return null
}
