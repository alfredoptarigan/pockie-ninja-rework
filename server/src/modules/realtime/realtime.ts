// Socket.IO presence (one room per scene, one per character), chat (world, scene, team,
// whispers), friend presence, push notices and chat reports, attached to the Fastify server.
import { randomUUID } from 'node:crypto'
import {
  chatReportSchema,
  chatSendSchema,
  REALTIME_EVENTS,
  TEAM_CHAT_COOLDOWN_MS,
  WHISPER_MIN_LEVEL,
  type Character,
  type ChatAck,
  type ChatErrorCode,
  type ChatMessage,
  type ClientToServerEvents,
  type RealtimeAdmissionErrorCode,
  type RealtimeConnectErrorCode,
  type ReportAck,
  type ScenePlayer,
  type ScenePlayersEvent,
  type ServerToClientEvents,
} from '@pockie/shared'
import { and, eq, inArray, or } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'
import type { ZodError } from 'zod'
import type { Db } from '../../db/client.js'
import { blocks, characters, friends, reports, teamMembers } from '../../db/schema.js'
import type { Env } from '../../env.js'
import { filterText } from '../../game/text-filter.js'
import { cookieConfig } from '../auth/cookies.js'
import { findSession, isSessionActive } from '../auth/sessions.js'
import { toCharacter } from '../game/characters.js'
import { createChatLimiter } from './chat-limiter.js'
import { presence as presenceBus } from './events.js'

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

/** Reports one character may send per window. */
export const REPORT_RATE_MAX = 5
export const REPORT_RATE_WINDOW_MS = 60_000

const sceneRoom = (sceneId: number) => `scene:${sceneId}`
const sessionRoom = (sessionId: string) => `session:${sessionId}`
/** Every tab of one character: whispers, team chat, friend presence and notices. */
const characterRoom = (characterId: string) => `character:${characterId}`

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
  const isOnline = (characterId: string) => online.has(characterId)
  // World chat budget, shared by scene chat and whispers.
  const chat = createChatLimiter(isOnline)
  const teamChat = createChatLimiter(isOnline, { max: 1, windowMs: TEAM_CHAT_COOLDOWN_MS })
  const reportLimit = createChatLimiter(isOnline, {
    max: REPORT_RATE_MAX,
    windowMs: REPORT_RATE_WINDOW_MS,
  })
  const cookieName = cookieConfig(env).session

  const offNotice = presenceBus.onNotice((characterId, notice) =>
    io.to(characterRoom(characterId)).emit(REALTIME_EVENTS.notice, notice),
  )
  // Close live connections first, otherwise the HTTP server waits for them forever.
  app.addHook('preClose', async () => {
    offNotice()
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
      announce(toPlayer(character), true)
    }
    socket.conn.once('close', () => leave(socket, character.id))
    return true
  }

  /** Frees a socket slot; only the character's last socket tells the scene. Safe to repeat. */
  function leave(socket: GameSocket, characterId: string) {
    const presence = online.get(characterId)
    if (!presence?.sockets.delete(socket) || presence.sockets.size > 0) return
    online.delete(characterId)
    for (const limiter of [chat, teamChat, reportLimit]) limiter.forgetWhenStale(characterId)
    broadcastScene(presence.sceneId)
    announce(presence.player, false)
  }

  /**
   * First socket in or last socket out: runs the module hooks (team grace) and tells every player
   * who lists this character as a friend. Never throws into the connection flow.
   */
  function announce({ characterId, name }: ScenePlayer, isNowOnline: boolean) {
    try {
      if (isNowOnline) presenceBus.online(characterId)
      else presenceBus.offline(characterId)
    } catch (error) {
      app.log.error(error)
    }
    db.select({ ownerId: friends.ownerId })
      .from(friends)
      .where(eq(friends.friendId, characterId))
      .then((rows) => {
        if (rows.length === 0) return
        // The state at send time: a quick reconnect cannot leave friends with a stale event.
        io.to(rows.map((row) => characterRoom(row.ownerId))).emit(REALTIME_EVENTS.friendPresence, {
          characterId,
          name,
          online: isOnline(characterId),
        })
      })
      .catch((error: unknown) => app.log.error(error))
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

    const input = parsed.data
    const message: ChatMessage = {
      id: randomUUID(),
      channel: input.channel,
      ...(input.channel === 'scene' ? { sceneId: presence.sceneId } : {}),
      sender: { characterId: character.id, name: presence.player.name },
      text: filterText(input.text),
      sentAt: new Date().toISOString(),
    }
    if (input.channel === 'whisper') return whisper(message, input.to)
    if (input.channel === 'team') return sendTeam(message)
    const target = input.channel === 'world' ? io : io.to(sceneRoom(presence.sceneId))
    target.emit(REALTIME_EVENTS.chatMessage, message)
    return { ok: true, message } satisfies ChatAck
  }

  /** Online only, by name (case-insensitive); the sender's tabs get the same message as an echo. */
  async function whisper(message: ChatMessage, to: string): Promise<ChatAck> {
    const senderId = message.sender.characterId
    const [sender] = await db
      .select({ level: characters.level })
      .from(characters)
      .where(eq(characters.id, senderId))
    if (!sender || sender.level < WHISPER_MIN_LEVEL) {
      return fail('level_too_low', `You need level ${WHISPER_MIN_LEVEL} to whisper.`)
    }
    // Names are unique case-insensitively (characters.name_lower).
    // ponytail: scans every online player per whisper; index by name if the world gets busy.
    const name = to.toLowerCase()
    const target = [...online.values()].find((p) => p.player.name.toLowerCase() === name)?.player
    if (!target) return fail('offline', 'The player is offline.')
    if (target.characterId === senderId) {
      return fail('invalid_payload', 'You cannot whisper to yourself.')
    }
    const pair = (owner: string, blocked: string) =>
      and(eq(blocks.ownerId, owner), eq(blocks.blockedId, blocked))
    const [block] = await db
      .select({ ownerId: blocks.ownerId })
      .from(blocks)
      .where(or(pair(senderId, target.characterId), pair(target.characterId, senderId)))
      .limit(1)
    // One neutral line for both directions: the sender cannot tell who blocked whom.
    if (block) return fail('refused', 'You cannot whisper to this player.')

    const delivered = { ...message, to: { characterId: target.characterId, name: target.name } }
    io.to([characterRoom(senderId), characterRoom(target.characterId)]).emit(
      REALTIME_EVENTS.chatMessage,
      delivered,
    )
    return { ok: true, message: delivered }
  }

  /** Team channel (channel 4): membership is read at send time, sender included. */
  async function sendTeam(message: ChatMessage): Promise<ChatAck> {
    const senderId = message.sender.characterId
    const ownTeam = db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.characterId, senderId))
    const members = await db
      .select({ characterId: teamMembers.characterId })
      .from(teamMembers)
      .where(inArray(teamMembers.teamId, ownTeam))
    if (members.length === 0) return fail('not_in_team', 'You are not in a team.')
    if (!teamChat.allow(senderId)) {
      return fail('rate_limited', 'Wait 5 seconds between team messages.')
    }
    io.to(members.map((m) => characterRoom(m.characterId))).emit(
      REALTIME_EVENTS.chatMessage,
      message,
    )
    return { ok: true, message }
  }

  const reportFail = (
    code: Extract<ReportAck, { ok: false }>['error']['code'],
    message: string,
  ): ReportAck => ({ ok: false, error: { code, message } })

  /** Stores a report of a chat line or whisper, with the text the reporter saw. */
  async function sendReport({ character, sessionId }: SocketData, payload: unknown) {
    const parsed = chatReportSchema.safeParse(payload)
    if (!parsed.success || parsed.data.characterId === character.id) {
      return reportFail('invalid_payload', 'That report could not be sent.')
    }
    if (!reportLimit.allow(character.id)) {
      return reportFail('rate_limited', 'You are sending reports too fast. Wait a moment.')
    }
    if (!(await isSessionActive(db, sessionId))) {
      return reportFail('unauthenticated', 'Your session ended. Please log in again.')
    }
    const { channel, characterId, text } = parsed.data
    const [reported] = await db
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.id, characterId))
    if (!reported) return reportFail('invalid_payload', 'That report could not be sent.')
    const whispered = channel === 'whisper'
    await db.insert(reports).values({
      reporterId: character.id,
      reportedId: reported.id,
      kind: whispered ? 'whisper' : 'chat',
      channel: whispered ? null : channel,
      text,
    })
    return { ok: true } satisfies ReportAck
  }

  /** Answers a client request's ack (if any) and drops the session when it ended. */
  function answer<A extends ChatAck | ReportAck>(
    socket: GameSocket,
    request: Promise<A>,
    failed: A,
    ack: unknown,
  ) {
    void request
      .catch((error: unknown) => {
        app.log.error(error)
        return failed
      })
      .then((result) => {
        if (typeof ack === 'function') ack(result)
        if (!result.ok && result.error.code === 'unauthenticated') endSession(socket.data.sessionId)
      })
  }

  io.on('connection', (socket) => {
    const { character, sessionId } = socket.data
    const sceneId = online.get(character.id)?.sceneId ?? character.sceneId
    void socket.join([sceneRoom(sceneId), sessionRoom(sessionId), characterRoom(character.id)])
    // The scene already heard about this character if it has another tab open.
    socket.emit(REALTIME_EVENTS.scenePlayers, scenePlayers(sceneId))
    disconnectAtExpiry(socket)

    socket.on('disconnect', () => leave(socket, character.id))
    socket.on(REALTIME_EVENTS.chatSend, (payload: unknown, ack: unknown) =>
      answer(
        socket,
        sendChat(socket.data, payload),
        fail('invalid_payload', 'That message could not be sent.'),
        ack,
      ),
    )
    socket.on(REALTIME_EVENTS.chatReport, (payload: unknown, ack: unknown) =>
      answer(
        socket,
        sendReport(socket.data, payload),
        reportFail('invalid_payload', 'That report could not be sent.'),
        ack,
      ),
    )
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
