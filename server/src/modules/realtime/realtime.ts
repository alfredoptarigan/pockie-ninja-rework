// Socket.IO presence (one room per scene) and world/scene chat, attached to the Fastify server.
import { randomUUID } from 'node:crypto'
import {
  chatSendSchema,
  REALTIME_EVENTS,
  type Character,
  type ChatAck,
  type ChatErrorCode,
  type ChatMessage,
  type ClientToServerEvents,
  type RealtimeConnectErrorCode,
  type ScenePlayer,
  type ServerToClientEvents,
} from '@pockie/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'
import type { ZodError } from 'zod'
import type { Db } from '../../db/client.js'
import { characters } from '../../db/schema.js'
import type { Env } from '../../env.js'
import { cookieConfig } from '../auth/cookies.js'
import { findSession } from '../auth/sessions.js'
import { toCharacter } from '../game/characters.js'

interface SocketData {
  sessionId: string
  character: Character
}
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>

interface Presence {
  player: ScenePlayer
  sceneId: number
  sockets: Set<GameSocket>
}

const CHAT_RATE_MAX = 5
const CHAT_RATE_WINDOW_MS = 5_000
const MAX_PACKET_BYTES = 16 * 1024

const sceneRoom = (sceneId: number) => `scene:${sceneId}`
const sessionRoom = (sessionId: string) => `session:${sessionId}`

const toPlayer = (c: Character): ScenePlayer => ({
  characterId: c.id,
  name: c.name,
  level: c.level,
  clothing: c.clothing,
  gender: c.gender,
  nation: c.nation,
})

function connectError(code: RealtimeConnectErrorCode, message: string) {
  return Object.assign(new Error(message), { data: { code, message } })
}

const fail = (code: ChatErrorCode, message: string): ChatAck => ({
  ok: false,
  error: { code, message },
})

function chatError(error: ZodError): ChatAck {
  const issue = error.issues[0]
  if (issue?.path[0] === 'text' && issue.code === 'too_small') return fail('empty', issue.message)
  if (issue?.path[0] === 'text' && issue.code === 'too_big') return fail('too_long', issue.message)
  return fail('invalid_payload', 'That message could not be sent.')
}

export type Realtime = ReturnType<typeof attachRealtime>

export function attachRealtime(app: FastifyInstance, { db, env }: { db: Db; env: Env }) {
  const io: GameServer = new Server(app.server, {
    serveClient: false,
    maxHttpBufferSize: MAX_PACKET_BYTES,
  })
  // ponytail: presence and chat limits live in this process; move to the Socket.IO Redis adapter
  // and a shared store before running more than one server.
  const online = new Map<string, Presence>()
  const chatLog = new Map<string, number[]>()
  const cookieName = cookieConfig(env).session

  // Close live connections first, otherwise the HTTP server waits for them forever.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true)
  })

  io.use(async (socket, next) => {
    const { origin, cookie } = socket.handshake.headers
    // Same rule as the CSRF check: a foreign Origin is refused outright.
    if (origin && origin !== env.APP_ORIGIN) {
      return next(connectError('bad_origin', 'This connection came from an unknown site.'))
    }
    try {
      const token = cookie ? app.parseCookie(cookie)[cookieName] : undefined
      const auth = token ? await findSession(db, token) : null
      if (!auth) return next(connectError('unauthenticated', 'Please log in.'))
      const [row] = await db.select().from(characters).where(eq(characters.userId, auth.user.id))
      if (!row) return next(connectError('no_character', 'Create your ninja first.'))
      socket.data = { sessionId: auth.sessionId, character: toCharacter(row) }
      next()
    } catch (error) {
      app.log.error(error)
      next(new Error('Something went wrong. Please try again.'))
    }
  })

  function broadcastScene(sceneId: number) {
    // ponytail: scans every online player per broadcast; index by scene if the world gets busy.
    const players = [...online.values()].filter((p) => p.sceneId === sceneId).map((p) => p.player)
    io.to(sceneRoom(sceneId)).emit(REALTIME_EVENTS.scenePlayers, { sceneId, players })
  }

  function allowChat(characterId: string) {
    const now = Date.now()
    const recent = (chatLog.get(characterId) ?? []).filter((t) => now - t < CHAT_RATE_WINDOW_MS)
    const allowed = recent.length < CHAT_RATE_MAX
    chatLog.set(characterId, allowed ? [...recent, now] : recent)
    return allowed
  }

  function sendChat(characterId: string, payload: unknown): ChatAck {
    if (!allowChat(characterId)) {
      return fail('rate_limited', 'You are sending messages too fast. Wait a moment.')
    }
    const parsed = chatSendSchema.safeParse(payload)
    if (!parsed.success) return chatError(parsed.error)
    const presence = online.get(characterId)
    if (!presence) return fail('invalid_payload', 'That message could not be sent.')

    const { channel, text } = parsed.data
    const message: ChatMessage = {
      id: randomUUID(),
      channel,
      ...(channel === 'scene' ? { sceneId: presence.sceneId } : {}),
      sender: { characterId, name: presence.player.name },
      text,
      sentAt: new Date().toISOString(),
    }
    const target = channel === 'world' ? io : io.to(sceneRoom(presence.sceneId))
    target.emit(REALTIME_EVENTS.chatMessage, message)
    return { ok: true, message }
  }

  function leave(socket: GameSocket, characterId: string) {
    const presence = online.get(characterId)
    if (!presence) return
    presence.sockets.delete(socket)
    if (presence.sockets.size > 0) return
    online.delete(characterId)
    const now = Date.now()
    const recent = chatLog.get(characterId) ?? []
    if (!recent.some((t) => now - t < CHAT_RATE_WINDOW_MS)) chatLog.delete(characterId)
    broadcastScene(presence.sceneId)
  }

  io.on('connection', (socket) => {
    const { character, sessionId } = socket.data
    const presence = online.get(character.id) ?? {
      player: toPlayer(character),
      sceneId: character.sceneId,
      sockets: new Set<GameSocket>(),
    }
    presence.sockets.add(socket)
    online.set(character.id, presence)
    void socket.join([sceneRoom(presence.sceneId), sessionRoom(sessionId)])
    broadcastScene(presence.sceneId)

    socket.on('disconnect', () => leave(socket, character.id))
    socket.on(REALTIME_EVENTS.chatSend, (payload: unknown, ack: unknown) => {
      const result = sendChat(character.id, payload)
      if (typeof ack === 'function') ack(result)
    })
  })

  return {
    /** Moves every socket of the character to its (new) scene room; call after travel commits. */
    moveCharacter(character: Character) {
      const presence = online.get(character.id)
      if (!presence) return
      const from = presence.sceneId
      online.set(character.id, {
        player: toPlayer(character),
        sceneId: character.sceneId,
        sockets: presence.sockets,
      })
      if (from === character.sceneId) return
      for (const socket of presence.sockets) {
        void socket.leave(sceneRoom(from))
        void socket.join(sceneRoom(character.sceneId))
      }
      broadcastScene(from)
      broadcastScene(character.sceneId)
    },
    /** Drops every socket opened with this session (logout). */
    endSession(sessionId: string) {
      io.in(sessionRoom(sessionId)).disconnectSockets(true)
    },
  }
}
