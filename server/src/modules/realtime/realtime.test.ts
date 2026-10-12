import {
  CHAT_MAX_LENGTH,
  REALTIME_EVENTS,
  type ChatAck,
  type ChatMessage,
  type ClientToServerEvents,
  type ScenePlayersEvent,
  type ServerToClientEvents,
} from '@pockie/shared'
import { sql } from 'drizzle-orm'
import type { AddressInfo } from 'node:net'
import { io as connectClient, type Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { sessions } from '../../db/schema.js'

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>
interface Tab {
  socket: TestSocket
  players: ScenePlayersEvent[]
  chat: ChatMessage[]
}
type ConnectError = Error & { data?: { code: string; message: string } }

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let url: string
const opened: TestSocket[] = []

async function player(username: string, character?: { name: string; nation: number }) {
  const client = new Client(app)
  await client.post('/api/auth/register', {
    username,
    email: `${username.toLowerCase()}@example.com`,
    password: 'believe-it',
  })
  if (character) {
    // Clothing 3 is a male starting outfit.
    const created = await client.post('/api/game/characters', {
      ...character,
      gender: 0,
      clothing: 3,
    })
    expect(created.statusCode).toBe(201)
  }
  return client
}

function open(cookie?: string, headers: Record<string, string> = {}): Tab {
  const socket: TestSocket = connectClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: { ...(cookie ? { cookie } : {}), ...headers },
  })
  opened.push(socket)
  const tab: Tab = { socket, players: [], chat: [] }
  socket.on(REALTIME_EVENTS.scenePlayers, (event) => tab.players.push(event))
  socket.on(REALTIME_EVENTS.chatMessage, (message) => tab.chat.push(message))
  return tab
}

async function connect(client: Client) {
  const tab = open(client.cookieHeader)
  await new Promise<void>((resolve, reject) => {
    tab.socket.once('connect', resolve)
    tab.socket.once('connect_error', reject)
  })
  return tab
}

function rejection(cookie?: string, headers?: Record<string, string>) {
  const tab = open(cookie, headers)
  return new Promise<ConnectError>((resolve, reject) => {
    tab.socket.once('connect', () => reject(new Error('connected')))
    tab.socket.once('connect_error', resolve)
  })
}

/** Names in the latest player list the tab received for a scene. */
function namesIn(tab: Tab, sceneId: number) {
  const latest = tab.players.filter((event) => event.sceneId === sceneId).at(-1)
  return latest?.players.map((p) => p.name).sort()
}

const send = (tab: Tab, payload: unknown): Promise<ChatAck> =>
  tab.socket.emitWithAck(REALTIME_EVENTS.chatSend, payload as never)

const VILLAGE = 111 // Fire Village castle scene: where nation 0 starts.
const FIELD = 2101 // Its first field.

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  await app.listen({ port: 0, host: '127.0.0.1' })
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
})
afterEach(async () => {
  for (const socket of opened.splice(0)) socket.disconnect()
  await app.close()
})
afterAll(() => close())

describe('handshake', () => {
  it('rejects a connection without a session cookie', async () => {
    const error = await rejection()
    expect(error.message).toBe('Please log in.')
    expect(error.data?.code).toBe('unauthenticated')
  })

  it('rejects an unknown session token', async () => {
    const error = await rejection('pn_session=forged-token')
    expect(error.data?.code).toBe('unauthenticated')
  })

  it('rejects an expired session', async () => {
    const client = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 minute'` })
    const error = await rejection(client.cookieHeader)
    expect(error.data?.code).toBe('unauthenticated')
  })

  it('rejects a user without a character', async () => {
    const client = await player('Player_one')
    const error = await rejection(client.cookieHeader)
    expect(error.data).toEqual({ code: 'no_character', message: 'Create your ninja first.' })
  })

  it('rejects a foreign origin', async () => {
    const client = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const error = await rejection(client.cookieHeader, { origin: 'https://evil.example' })
    expect(error.data?.code).toBe('bad_origin')
  })

  it('accepts the configured app origin', async () => {
    const client = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const tab = open(client.cookieHeader, { origin: 'http://localhost:5173' })
    await vi.waitFor(() => expect(tab.socket.connected).toBe(true))
  })

  it('disconnects the sockets of a session on logout', async () => {
    const client = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const tab = await connect(client)
    await client.post('/api/auth/logout')
    await vi.waitFor(() => expect(tab.socket.connected).toBe(false))
  })
})

describe('scene presence', () => {
  it('sends the scene player list on connect and when players join or leave', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const two = await player('Player_two', { name: 'Ninja_02', nation: 0 })

    const first = await connect(one)
    await vi.waitFor(() => expect(namesIn(first, VILLAGE)).toEqual(['Ninja_01']))

    const second = await connect(two)
    await vi.waitFor(() => expect(namesIn(first, VILLAGE)).toEqual(['Ninja_01', 'Ninja_02']))
    await vi.waitFor(() => expect(namesIn(second, VILLAGE)).toEqual(['Ninja_01', 'Ninja_02']))

    second.socket.disconnect()
    await vi.waitFor(() => expect(namesIn(first, VILLAGE)).toEqual(['Ninja_01']))
  })

  it('exposes only public character fields', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const tab = await connect(one)
    await vi.waitFor(() => expect(tab.players).toHaveLength(1))

    const [entry] = tab.players[0]!.players
    expect(entry).toEqual({
      characterId: expect.any(String),
      name: 'Ninja_01',
      level: 1,
      clothing: 3,
      gender: 0,
      nation: 0,
    })
    const me = (await one.get('/api/auth/me')).json().user
    const wire = JSON.stringify(tab.players)
    expect(wire).not.toContain(me.id)
    expect(wire).not.toContain(me.email)
  })

  it('keeps a player listed until their last tab disconnects', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const two = await player('Player_two', { name: 'Ninja_02', nation: 0 })
    const watcher = await connect(two)
    const tabA = await connect(one)
    const tabB = await connect(one)
    await vi.waitFor(() => expect(namesIn(watcher, VILLAGE)).toEqual(['Ninja_01', 'Ninja_02']))

    tabA.socket.disconnect()
    // A later broadcast proves the first disconnect did not remove the player.
    const three = await player('Player_three', { name: 'Ninja_03', nation: 0 })
    await connect(three)
    await vi.waitFor(() =>
      expect(namesIn(watcher, VILLAGE)).toEqual(['Ninja_01', 'Ninja_02', 'Ninja_03']),
    )

    tabB.socket.disconnect()
    await vi.waitFor(() => expect(namesIn(watcher, VILLAGE)).toEqual(['Ninja_02', 'Ninja_03']))
  })

  it('moves every tab to the new scene on travel and updates both lists', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const two = await player('Player_two', { name: 'Ninja_02', nation: 0 })
    const traveller = await connect(one)
    const secondTab = await connect(one)
    const stayer = await connect(two)
    await vi.waitFor(() => expect(namesIn(stayer, VILLAGE)).toEqual(['Ninja_01', 'Ninja_02']))

    expect((await one.post('/api/game/travel', { sceneId: FIELD })).statusCode).toBe(200)

    await vi.waitFor(() => expect(namesIn(stayer, VILLAGE)).toEqual(['Ninja_02']))
    await vi.waitFor(() => expect(namesIn(traveller, FIELD)).toEqual(['Ninja_01']))
    await vi.waitFor(() => expect(namesIn(secondTab, FIELD)).toEqual(['Ninja_01']))
    expect(namesIn(stayer, FIELD)).toBeUndefined()
  })

  it('leaves rooms untouched when travel fails', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const tab = await connect(one)
    await vi.waitFor(() => expect(tab.players).toHaveLength(1))

    expect((await one.post('/api/game/travel', { sceneId: 2201 })).statusCode).toBe(400)
    const ack = await send(tab, { channel: 'scene', text: 'still here' })
    expect(ack).toMatchObject({ ok: true, message: { sceneId: VILLAGE } })
    expect(tab.players).toHaveLength(1)
  })
})

describe('chat', () => {
  async function villagers() {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const two = await player('Player_two', { name: 'Ninja_02', nation: 0 })
    const a = await connect(one)
    const b = await connect(two)
    await vi.waitFor(() => expect(namesIn(a, VILLAGE)).toEqual(['Ninja_01', 'Ninja_02']))
    return { one, a, b }
  }

  it('acks a message with server-assigned fields and delivers it to the scene', async () => {
    const { a, b } = await villagers()
    const ack = await send(a, { channel: 'scene', text: '  Hello village  ' })

    expect(ack).toEqual({
      ok: true,
      message: {
        id: expect.any(String),
        channel: 'scene',
        sceneId: VILLAGE,
        sender: { characterId: expect.any(String), name: 'Ninja_01' },
        text: 'Hello village',
        sentAt: expect.any(String),
      },
    })
    await vi.waitFor(() => expect(b.chat).toEqual([ack.ok && ack.message]))
    await vi.waitFor(() => expect(a.chat).toHaveLength(1))
  })

  it('delivers scene chat only to the scene and world chat to everyone', async () => {
    const { one, a, b } = await villagers()
    await one.post('/api/game/travel', { sceneId: FIELD })
    await vi.waitFor(() => expect(namesIn(a, FIELD)).toEqual(['Ninja_01']))

    await send(a, { channel: 'scene', text: 'field only' })
    await send(a, { channel: 'world', text: 'hello world' })

    await vi.waitFor(() => expect(b.chat.map((m) => m.text)).toEqual(['hello world']))
    expect(a.chat.map((m) => m.text)).toEqual(['field only', 'hello world'])
    expect(b.chat[0]).not.toHaveProperty('sceneId')
  })

  it('delivers HTML verbatim as plain text', async () => {
    const { a, b } = await villagers()
    const html = '<b>hi</b><script>alert("x")</script> &amp;'
    await send(a, { channel: 'world', text: html })
    await vi.waitFor(() => expect(b.chat[0]?.text).toBe(html))
  })

  it('strips control characters', async () => {
    const { a } = await villagers()
    const ack = await send(a, { channel: 'world', text: 'a\u0000b\nc‮d' })
    expect(ack.ok && ack.message.text).toBe('a b c d')
  })

  it(`accepts ${CHAT_MAX_LENGTH} characters and rejects more`, async () => {
    const { a, b } = await villagers()
    expect((await send(a, { channel: 'world', text: 'x'.repeat(CHAT_MAX_LENGTH) })).ok).toBe(true)
    const tooLong = await send(a, { channel: 'world', text: 'x'.repeat(CHAT_MAX_LENGTH + 1) })
    expect(tooLong).toEqual({ ok: false, error: { code: 'too_long', message: expect.any(String) } })
    await vi.waitFor(() => expect(b.chat).toHaveLength(1))
  })

  it('rejects empty and invalid payloads', async () => {
    const { a } = await villagers()
    const code = async (payload: unknown) => {
      const ack = await send(a, payload)
      return ack.ok ? 'ok' : ack.error.code
    }
    expect(await code({ channel: 'world', text: ' \n\u0000 ' })).toBe('empty')
    expect(await code({ channel: 'guild', text: 'hi' })).toBe('invalid_payload')
    expect(await code({ channel: 'world', text: 42 })).toBe('invalid_payload')
    expect(await code(null)).toBe('invalid_payload')
    expect(a.chat).toEqual([])
  })

  it('still delivers a send without an ack callback', async () => {
    const { a, b } = await villagers()
    const untyped = a.socket as unknown as Socket
    untyped.emit(REALTIME_EVENTS.chatSend, { channel: 'world', text: 'no ack' })
    await vi.waitFor(() => expect(b.chat.map((m) => m.text)).toEqual(['no ack']))
  })

  it('rate limits each player across tabs', async () => {
    const { one, a, b } = await villagers()
    const otherTab = await connect(one)
    const results = []
    for (let i = 0; i < 5; i++)
      results.push(await send(i % 2 ? otherTab : a, { channel: 'world', text: `m${i}` }))
    expect(results.every((r) => r.ok)).toBe(true)

    const limited = await send(a, { channel: 'world', text: 'one too many' })
    expect(limited).toEqual({
      ok: false,
      error: { code: 'rate_limited', message: expect.any(String) },
    })
    // Another player is not affected.
    expect((await send(b, { channel: 'world', text: 'me too' })).ok).toBe(true)
  })
})
