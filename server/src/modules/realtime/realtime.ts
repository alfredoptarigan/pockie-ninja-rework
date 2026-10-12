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
  type RealtimeAdmissionErrorCode,
  type RealtimeConnectErrorCode,
  type ScenePlayer,
  type ScenePlayersEvent,
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
import { findSession, isSessionActive } from '../auth/sessions.js'
import { toCharacter } from '../game/characters.js'
import { createChatLimiter } from './chat-limiter.js'

interface SocketData {
  sessionId: string
  expiresAt: Date
  character: Character
}
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>

interface Presence {
  player: ScenePlayer
  sceneId: number
  sockets: Set<GameSocket>
}

/** Open sockets (game tabs) one character may hold at once. */
export const MAX_SOCKETS_PER_CHARACTER = 5
const MAX_PACKET_BYTES = 16 * 1024
// setTimeout overflows past ~24.8 days (30-day sessions exist), so longer waits are re-armed.
const MAX_TIMER_MS = 2 ** 31 - 1

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

function connectError(
  code: RealtimeConnectErrorCode | RealtimeAdmissionErrorCode,
  message: string,
) {
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
    // Same rule as the CSRF check, applied to the transport handshake before any DB work:
    // a foreign Origin gets a 403; a missing one (non-browser client) is allowed.
    allowRequest: ({ headers: { origin } }, done) => {
      const allowed = !origin || origin === env.APP_ORIGIN
      done(allowed ? null : 'This connection came from an unknown site.', allowed)
    },
  })
  // ponytail: presence, socket slots and chat limits live in this process; move to the Socket.IO
  // Redis adapter and a shared store (publishing session revocations) before running more than
  // one server.
  const online = new Map<string, Presence>()
  const chat = createChatLimiter((characterId) => online.has(characterId))
  const cookieName = cookieConfig(env).session

  // Close live connections first, otherwise the HTTP server waits for them forever.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true)
  })

  io.use(async (socket, next) => {
    const { cookie } = socket.handshake.headers
    try {
      const token = cookie ? app.parseCookie(cookie)[cookieName] : undefined
      const auth = token ? await findSession(db, token) : null
      if (!auth) return next(connectError('unauthenticated', 'Please log in.'))
      const [row] = await db.select().from(characters).where(eq(characters.userId, auth.user.id))
      if (!row) return next(connectError('no_character', 'Create your ninja first.'))
      const character = toCharacter(row)
      if (!admit(socket, character)) {
        return next(
          connectError('too_many_connections', 'Too many game tabs are open. Close one first.'),
        )
      }
      socket.data = { sessionId: auth.sessionId, expiresAt: auth.expiresAt, character }
      next()
    } catch (error) {
      app.log.error(error)
      next(new Error('Something went wrong. Please try again.'))
    }
  })

  const scenePlayers = (sceneId: number): ScenePlayersEvent => ({
    sceneId,
    // ponytail: scans every online player per broadcast; index by scene if the world gets busy.
    players: [...online.values()].filter((p) => p.sceneId === sceneId).map((p) => p.player),
  })

  function broadcastScene(sceneId: number) {
    io.to(sceneRoom(sceneId)).emit(REALTIME_EVENTS.scenePlayers, scenePlayers(sceneId))
  }

  /**
   * Takes one of the character's socket slots in the same synchronous step as the cap check, so
   * racing handshakes cannot overshoot it. Only the first slot tells the scene. leave() frees the
   * slot on disconnect, or when the transport closes before the connection completes (Socket.IO
   * fires no disconnect event then).
   */
  function admit(socket: GameSocket, character: Character) {
    if (socket.conn.readyState !== 'open') return false
    const presence = online.get(character.id)
    if (presence && presence.sockets.size >= MAX_SOCKETS_PER_CHARACTER) return false
    if (presence) {
      presence.sockets.add(socket)
    } else {
      online.set(character.id, {
        player: toPlayer(character),
        sceneId: character.sceneId,
        sockets: new Set([socket]),
      })
      broadcastScene(character.sceneId)
    }
    socket.conn.once('close', () => leave(socket, character.id))
    return true
  }

  /** Frees a socket slot; only the character's last socket tells the scene. Safe to repeat. */
  function leave(socket: GameSocket, characterId: string) {
    const presence = online.get(characterId)
    if (!presence?.sockets.delete(socket) || presence.sockets.size > 0) return
    online.delete(characterId)
    chat.forgetWhenStale(characterId)
    broadcastScene(presence.sceneId)
  }

  /** Disconnects the socket when its session expires. */
  function disconnectAtExpiry(socket: GameSocket) {
    const wait = socket.data.expiresAt.getTime() - Date.now()
    const timer = setTimeout(
      () => (wait > MAX_TIMER_MS ? disconnectAtExpiry(socket) : socket.disconnect(true)),
      Math.min(wait, MAX_TIMER_MS),
    )
    socket.once('disconnect', () => clearTimeout(timer))
  }

  const endSession = (sessionId: string) => io.in(sessionRoom(sessionId)).disconnectSockets(true)

  async function sendChat({ character, sessionId }: SocketData, payload: unknown) {
    if (!chat.allow(character.id)) {
      return fail('rate_limited', 'You are sending messages too fast. Wait a moment.')
    }
    // The handshake checked the session once; a revoked or expired one must not keep talking.
    if (!(await isSessionActive(db, sessionId))) {
      return fail('unauthenticated', 'Your session ended. Please log in again.')
    }
    const parsed = chatSendSchema.safeParse(payload)
    if (!parsed.success) return chatError(parsed.error)
    const presence = online.get(character.id)
    if (!presence) return fail('invalid_payload', 'That message could not be sent.')

    const { channel, text } = parsed.data
    const message: ChatMessage = {
      id: randomUUID(),
      channel,
      ...(channel === 'scene' ? { sceneId: presence.sceneId } : {}),
      sender: { characterId: character.id, name: presence.player.name },
      text,
      sentAt: new Date().toISOString(),
    }
    const target = channel === 'world' ? io : io.to(sceneRoom(presence.sceneId))
    target.emit(REALTIME_EVENTS.chatMessage, message)
    return { ok: true, message } satisfies ChatAck
  }

  io.on('connection', (socket) => {
    const { character, sessionId } = socket.data
    const sceneId = online.get(character.id)?.sceneId ?? character.sceneId
    void socket.join([sceneRoom(sceneId), sessionRoom(sessionId)])
    // The scene already heard about this character if it has another tab open.
    socket.emit(REALTIME_EVENTS.scenePlayers, scenePlayers(sceneId))
    disconnectAtExpiry(socket)

    socket.on('disconnect', () => leave(socket, character.id))
    socket.on(REALTIME_EVENTS.chatSend, (payload: unknown, ack: unknown) => {
      void sendChat(socket.data, payload)
        .catch((error: unknown): ChatAck => {
          app.log.error(error)
          return fail('invalid_payload', 'That message could not be sent.')
        })
        .then((result) => {
          if (typeof ack === 'function') ack(result)
          if (!result.ok && result.error.code === 'unauthenticated') endSession(sessionId)
        })
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
    /** Drops every socket opened with this session (logout, login rotation, revocation). */
    endSession,
  }
}
