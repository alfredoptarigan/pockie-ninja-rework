import {
  CHAT_MAX_LENGTH,
  REALTIME_EVENTS,
  type ChatAck,
  type ChatMessage,
  type ClientToServerEvents,
  type FriendPresenceEvent,
  type Notice,
  type ReportAck,
  type ScenePlayersEvent,
  type ServerToClientEvents,
} from '@pockie/shared'
import { eq, sql } from 'drizzle-orm'
import type { AddressInfo } from 'node:net'
import { io as connectClient, type Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  blocks,
  characterWeeklyRewards,
  characters,
  friends,
  reports,
  sessions,
  teamMembers,
  teams,
} from '../../db/schema.js'
import { notifyCharacter, onCharacterOffline, onCharacterOnline } from './events.js'
import { MAX_SOCKETS_PER_CHARACTER } from './realtime.js'

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>
interface Tab {
  socket: TestSocket
  players: ScenePlayersEvent[]
  chat: ChatMessage[]
  presence: FriendPresenceEvent[]
  notices: Notice[]
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
  const tab: Tab = { socket, players: [], chat: [], presence: [], notices: [] }
  socket.on(REALTIME_EVENTS.scenePlayers, (event) => tab.players.push(event))
  socket.on(REALTIME_EVENTS.chatMessage, (message) => tab.chat.push(message))
  socket.on(REALTIME_EVENTS.friendPresence, (event) => tab.presence.push(event))
  socket.on(REALTIME_EVENTS.notice, (notice) => tab.notices.push(notice))
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

/** 'connected', or the connect_error code (message when there is none). */
function outcome(cookie?: string) {
  const tab = open(cookie)
  return new Promise<string>((resolve) => {
    tab.socket.once('connect', () => resolve('connected'))
    tab.socket.once('connect_error', (error: ConnectError) =>
      resolve(error.data?.code ?? error.message),
    )
  })
}

/** Names in the latest player list the tab received for a scene. */
function namesIn(tab: Tab, sceneId: number) {
  const latest = tab.players.filter((event) => event.sceneId === sceneId).at(-1)
  return latest?.players.map((p) => p.name).sort()
}

const send = (tab: Tab, payload: unknown): Promise<ChatAck> =>
  tab.socket.emitWithAck(REALTIME_EVENTS.chatSend, payload as never)
const report = (tab: Tab, payload: unknown): Promise<ReportAck> =>
  tab.socket.emitWithAck(REALTIME_EVENTS.chatReport, payload as never)
const errorOf = (ack: ChatAck | ReportAck) => (ack.ok ? 'ok' : ack.error.code)

async function idOf(name: string) {
  const [row] = await db.select().from(characters).where(eq(characters.name, name))
  return row!.id
}
const setLevel = (name: string, level: number) =>
  db.update(characters).set({ level }).where(eq(characters.name, name))

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

  it('refuses a foreign origin at the transport handshake, before any session lookup', async () => {
    const client = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    // Engine.IO answers 403 itself, so the Socket.IO middleware (and its queries) never runs.
    const response = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
      headers: { origin: 'https://evil.example', cookie: client.cookieHeader },
    })
    expect(response.status).toBe(403)
    await expect(
      rejection(client.cookieHeader, { origin: 'https://evil.example' }),
    ).resolves.toBeInstanceOf(Error)
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

describe('session lifecycle', () => {
  it('disconnects a socket when its session expires', async () => {
    const client = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    await db.update(sessions).set({ expiresAt: sql`now() + interval '1 second'` })
    const tab = await connect(client)
    expect(tab.socket.connected).toBe(true)
    await vi.waitFor(() => expect(tab.socket.connected).toBe(false), { timeout: 3_000 })
  })

  it('rejects chat and drops the socket once its session is revoked', async () => {
    const client = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const tab = await connect(client)
    await db.delete(sessions)

    expect(await send(tab, { channel: 'world', text: 'still here?' })).toEqual({
      ok: false,
      error: { code: 'unauthenticated', message: expect.any(String) },
    })
    await vi.waitFor(() => expect(tab.socket.connected).toBe(false))
    expect(tab.chat).toEqual([])
  })

  it('disconnects the old session when the browser logs in again', async () => {
    const client = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const tab = await connect(client)
    const login = await client.post('/api/auth/login', {
      login: 'Player_one',
      password: 'believe-it',
    })
    expect(login.statusCode).toBe(200)
    await vi.waitFor(() => expect(tab.socket.connected).toBe(false))
  })
})

describe('admission', () => {
  it(`caps a character at ${MAX_SOCKETS_PER_CHARACTER} sockets, even when they race`, async () => {
    const client = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const attempts = Array.from({ length: MAX_SOCKETS_PER_CHARACTER + 2 }, () =>
      outcome(client.cookieHeader),
    )
    const results = await Promise.all(attempts)
    expect(results.filter((r) => r === 'connected')).toHaveLength(MAX_SOCKETS_PER_CHARACTER)
    expect(results.filter((r) => r === 'too_many_connections')).toHaveLength(2)

    // Closing a tab frees its slot.
    opened.find((socket) => socket.connected)!.disconnect()
    expect(await outcome(client.cookieHeader)).toBe('connected')
  })

  it('broadcasts presence only on the first join and the last leave of a character', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const two = await player('Player_two', { name: 'Ninja_02', nation: 0 })
    const three = await player('Player_three', { name: 'Ninja_03', nation: 0 })
    const watcher = await connect(two)
    await vi.waitFor(() => expect(namesIn(watcher, VILLAGE)).toEqual(['Ninja_02']))

    const tabA = await connect(one)
    await vi.waitFor(() => expect(namesIn(watcher, VILLAGE)).toEqual(['Ninja_01', 'Ninja_02']))
    const tabB = await connect(one)
    // The extra tab still gets the current list, just for itself.
    await vi.waitFor(() => expect(namesIn(tabB, VILLAGE)).toEqual(['Ninja_01', 'Ninja_02']))
    tabB.socket.disconnect()

    await connect(three)
    await vi.waitFor(() =>
      expect(namesIn(watcher, VILLAGE)).toEqual(['Ninja_01', 'Ninja_02', 'Ninja_03']),
    )
    tabA.socket.disconnect()
    await vi.waitFor(() => expect(namesIn(watcher, VILLAGE)).toEqual(['Ninja_02', 'Ninja_03']))
    expect(watcher.players.map((event) => event.players.length)).toEqual([1, 2, 3, 2])
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

  it('counts world chat, not scene chat, for Weekly Rewards', async () => {
    const { a } = await villagers()
    const counters = async () => (await db.select().from(characterWeeklyRewards))[0]?.counters ?? {}
    await send(a, { channel: 'scene', text: 'scene line' })
    await send(a, { channel: 'world', text: 'world line' })
    await vi.waitFor(async () => expect(await counters()).toEqual({ globalChat: 1 }))
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

  it('keeps the chat budget when a player reconnects within the window', async () => {
    const { one, a } = await villagers()
    for (let i = 0; i < 5; i++) await send(a, { channel: 'world', text: `m${i}` })
    a.socket.disconnect()

    const again = await connect(one)
    expect(await send(again, { channel: 'world', text: 'fresh start?' })).toMatchObject({
      ok: false,
      error: { code: 'rate_limited' },
    })
  })
})

describe('chat filter', () => {
  it('masks profanity on world and scene lines', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const a = await connect(one)
    const world = await send(a, { channel: 'world', text: 'what the fuck' })
    const scene = await send(a, { channel: 'scene', text: 'shit happens' })
    expect(world.ok && world.message.text).toBe('what the ****')
    expect(scene.ok && scene.message.text).toBe('**** happens')
    await vi.waitFor(() => expect(a.chat.map((m) => m.text)).toContain('what the ****'))
  })
})

describe('whispers', () => {
  async function trio() {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const two = await player('Player_two', { name: 'Ninja_02', nation: 0 })
    const three = await player('Player_three', { name: 'Ninja_03', nation: 0 })
    await setLevel('Ninja_01', 10)
    return { one, a: await connect(one), b: await connect(two), c: await connect(three) }
  }

  it('delivers by name, case-insensitive, with an echo to every tab of the sender', async () => {
    const { one, a, b, c } = await trio()
    const otherTab = await connect(one)
    const ack = await send(a, { channel: 'whisper', to: 'ninja_02', text: 'psst, fuck' })

    expect(ack).toEqual({
      ok: true,
      message: {
        id: expect.any(String),
        channel: 'whisper',
        sender: { characterId: await idOf('Ninja_01'), name: 'Ninja_01' },
        to: { characterId: await idOf('Ninja_02'), name: 'Ninja_02' },
        text: 'psst, ****',
        sentAt: expect.any(String),
      },
    })
    await vi.waitFor(() => expect(b.chat).toEqual([ack.ok && ack.message]))
    await vi.waitFor(() => expect(a.chat).toHaveLength(1))
    await vi.waitFor(() => expect(otherTab.chat).toHaveLength(1))
    // A later world line proves the third player never got the whisper.
    await send(b, { channel: 'world', text: 'done' })
    await vi.waitFor(() => expect(c.chat.map((m) => m.text)).toEqual(['done']))
  })

  it('answers "The player is offline." for offline and unknown names', async () => {
    const { a, b } = await trio()
    await player('Player_four', { name: 'Ninja_04', nation: 0 })
    for (const to of ['Ninja_04', 'Nobody_here', '']) {
      expect(await send(a, { channel: 'whisper', to, text: 'hi' })).toEqual({
        ok: false,
        error: { code: 'offline', message: 'The player is offline.' },
      })
    }
    b.socket.disconnect()
    await vi.waitFor(async () =>
      expect(errorOf(await send(a, { channel: 'whisper', to: 'Ninja_02', text: 'hi' }))).toBe(
        'offline',
      ),
    )
  })

  it('needs level 10 to send', async () => {
    const { b } = await trio()
    expect(await send(b, { channel: 'whisper', to: 'Ninja_01', text: 'hi' })).toEqual({
      ok: false,
      error: { code: 'level_too_low', message: 'You need level 10 to whisper.' },
    })
  })

  it('refuses yourself', async () => {
    const { a } = await trio()
    expect(errorOf(await send(a, { channel: 'whisper', to: 'NINJA_01', text: 'me' }))).toBe(
      'invalid_payload',
    )
  })

  it('refuses with the same neutral line whichever side blocked the other', async () => {
    const { a, b } = await trio()
    await setLevel('Ninja_02', 10)
    const [one, two] = [await idOf('Ninja_01'), await idOf('Ninja_02')]
    await db.insert(blocks).values({ ownerId: two, blockedId: one })

    const blockedByTarget = await send(a, { channel: 'whisper', to: 'Ninja_02', text: 'hi' })
    const blockedBySender = await send(b, { channel: 'whisper', to: 'Ninja_01', text: 'hi' })

    expect(blockedByTarget).toEqual({
      ok: false,
      error: { code: 'refused', message: 'You cannot whisper to this player.' },
    })
    expect(blockedBySender).toEqual(blockedByTarget)
    expect(a.chat).toEqual([])
    expect(b.chat).toEqual([])
  })

  it('shares the world chat rate limit', async () => {
    const { a } = await trio()
    for (let i = 0; i < 5; i++) await send(a, { channel: 'world', text: `m${i}` })
    expect(errorOf(await send(a, { channel: 'whisper', to: 'Ninja_02', text: 'hi' }))).toBe(
      'rate_limited',
    )
  })
})

describe('team chat', () => {
  async function team() {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const two = await player('Player_two', { name: 'Ninja_02', nation: 0 })
    const three = await player('Player_three', { name: 'Ninja_03', nation: 0 })
    const [captain, member] = [await idOf('Ninja_01'), await idOf('Ninja_02')]
    const [row] = await db
      .insert(teams)
      .values({ captainId: captain, sceneId: VILLAGE })
      .returning()
    await db.insert(teamMembers).values([
      { characterId: captain, teamId: row!.id, fightOrder: 0 },
      { characterId: member, teamId: row!.id, fightOrder: 1 },
    ])
    return { a: await connect(one), b: await connect(two), c: await connect(three) }
  }

  it('reaches the members only, sender included, filtered', async () => {
    const { a, b, c } = await team()
    const ack = await send(a, { channel: 'team', text: 'go go, shit' })
    expect(ack).toMatchObject({ ok: true, message: { channel: 'team', text: 'go go, ****' } })
    expect(ack.ok && ack.message).not.toHaveProperty('sceneId')
    await vi.waitFor(() => expect(b.chat).toEqual([ack.ok && ack.message]))
    await vi.waitFor(() => expect(a.chat).toHaveLength(1))
    await send(c, { channel: 'world', text: 'done' })
    await vi.waitFor(() => expect(c.chat.map((m) => m.text)).toEqual(['done']))
  })

  it('refuses a player without a team', async () => {
    const { c } = await team()
    expect(await send(c, { channel: 'team', text: 'hello?' })).toEqual({
      ok: false,
      error: { code: 'not_in_team', message: 'You are not in a team.' },
    })
  })

  it('has a 5 second cooldown per player', async () => {
    const { a, b } = await team()
    expect((await send(a, { channel: 'team', text: 'one' })).ok).toBe(true)
    expect(errorOf(await send(a, { channel: 'team', text: 'two' }))).toBe('rate_limited')
    expect((await send(b, { channel: 'team', text: 'mine' })).ok).toBe(true)
  })
})

describe('friend presence', () => {
  it('tells everyone who lists the character, on its first and last socket', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const two = await player('Player_two', { name: 'Ninja_02', nation: 0 })
    const three = await player('Player_three', { name: 'Ninja_03', nation: 0 })
    const id = await idOf('Ninja_01')
    // Ninja_02 lists Ninja_01; Ninja_01 lists Ninja_03 (that direction tells nobody).
    await db.insert(friends).values([
      { ownerId: await idOf('Ninja_02'), friendId: id },
      { ownerId: id, friendId: await idOf('Ninja_03') },
    ])
    const watcher = await connect(two)
    const stranger = await connect(three)

    const tabA = await connect(one)
    const tabB = await connect(one)
    await vi.waitFor(() =>
      expect(watcher.presence).toEqual([{ characterId: id, name: 'Ninja_01', online: true }]),
    )
    tabA.socket.disconnect()
    tabB.socket.disconnect()
    await vi.waitFor(() => expect(watcher.presence.map((e) => e.online)).toEqual([true, false]))
    expect(stranger.presence).toEqual([])
  })

  it('runs the online and offline hooks on the first and last socket only', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const id = await idOf('Ninja_01')
    const events: string[] = []
    const offOnline = onCharacterOnline((characterId) => events.push(`online ${characterId}`))
    const offOffline = onCharacterOffline((characterId) => events.push(`offline ${characterId}`))
    try {
      const tabA = await connect(one)
      const tabB = await connect(one)
      tabA.socket.disconnect()
      await vi.waitFor(() => expect(tabA.socket.connected).toBe(false))
      tabB.socket.disconnect()
      await vi.waitFor(() => expect(events).toEqual([`online ${id}`, `offline ${id}`]))
    } finally {
      offOnline()
      offOffline()
    }
  })
})

describe('notices', () => {
  it('reach every tab of the character and nobody else, without unlisted fields', async () => {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    const two = await player('Player_two', { name: 'Ninja_02', nation: 0 })
    const [tabA, tabB, other] = [await connect(one), await connect(one), await connect(two)]
    const mailId = '00000000-0000-4000-8000-000000000001'

    notifyCharacter(await idOf('Ninja_01'), {
      kind: 'mail',
      mailId,
      category: 'system',
      secret: 'leak',
    } as Notice)
    notifyCharacter(await idOf('Ninja_02'), { kind: 'teamChanged', teamId: null })

    const mail = [{ kind: 'mail', mailId, category: 'system' }]
    await vi.waitFor(() => expect(tabA.notices).toEqual(mail))
    await vi.waitFor(() => expect(tabB.notices).toEqual(mail))
    await vi.waitFor(() => expect(other.notices).toEqual([{ kind: 'teamChanged', teamId: null }]))
  })

  it('throws on a malformed notice', () => {
    expect(() => notifyCharacter('x', { kind: 'mail' } as Notice)).toThrow()
  })
})

describe('reports', () => {
  async function reporter() {
    const one = await player('Player_one', { name: 'Ninja_01', nation: 0 })
    await player('Player_two', { name: 'Ninja_02', nation: 0 })
    return { a: await connect(one), reported: await idOf('Ninja_02') }
  }

  it('stores chat and whisper reports', async () => {
    const { a, reported } = await reporter()
    const line = { channel: 'world', characterId: reported, text: 'rude ****' }
    expect(await report(a, line)).toEqual({ ok: true })
    expect(await report(a, { channel: 'whisper', characterId: reported, text: 'spam' })).toEqual({
      ok: true,
    })

    const rows = await db.select().from(reports).orderBy(reports.createdAt)
    expect(rows).toMatchObject([
      {
        reporterId: await idOf('Ninja_01'),
        reportedId: reported,
        kind: 'chat',
        channel: 'world',
        text: 'rude ****',
        mailId: null,
      },
      { reportedId: reported, kind: 'whisper', channel: null, text: 'spam' },
    ])
  })

  it('rejects bad payloads, unknown players and yourself', async () => {
    const { a, reported } = await reporter()
    const unknown = '00000000-0000-4000-8000-000000000001'
    const payloads = [
      { channel: 'world', characterId: reported, text: '' },
      { channel: 'guild', characterId: reported, text: 'x' },
      { channel: 'world', characterId: 'not-a-uuid', text: 'x' },
      { channel: 'world', characterId: unknown, text: 'x' },
      { channel: 'world', characterId: await idOf('Ninja_01'), text: 'x' },
      null,
    ]
    for (const payload of payloads)
      expect(errorOf(await report(a, payload))).toBe('invalid_payload')
    expect(await db.select().from(reports)).toEqual([])
  })

  it('rate limits reports', async () => {
    const { a, reported } = await reporter()
    const results = []
    for (let i = 0; i < 6; i++)
      results.push(
        errorOf(await report(a, { channel: 'scene', characterId: reported, text: `l${i}` })),
      )
    expect(results).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'rate_limited'])
  })
})
