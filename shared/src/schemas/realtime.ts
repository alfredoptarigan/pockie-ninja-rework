import { z } from 'zod'
import type { Nation } from './game.js'

/** Socket.IO event names shared by the server and the client. */
export const REALTIME_EVENTS = {
  /** Server → client: the full player list of the socket's current scene. */
  scenePlayers: 'scene:players',
  /** Server → client: a chat message (world, scene, team, trade or a whisper). */
  chatMessage: 'chat:message',
  /** Client → server: send a chat message or a whisper; answered with a ChatAck. */
  chatSend: 'chat:send',
  /** Client → server: report a chat line or whisper; answered with a ReportAck. */
  chatReport: 'chat:report',
  /** Server → client: a friend (someone the player listed) came online or went offline. */
  friendPresence: 'friend:presence',
  /** Server → client: a push notice for this character (new mail, team prompt, ...). */
  notice: 'notice',
} as const

/** Reborn's chat counter reads "n/250". */
export const CHAT_MAX_LENGTH = 250
/**
 * `team`: the sender's team only (channel 4). `trade`: Reborn's Trade channel, sent to everyone
 * like `world`. `clan`: the sender's clan only (Reborn's Clan tab). `whisper`: one online player,
 * by ninja name.
 */
export const CHAT_CHANNELS = ['world', 'scene', 'team', 'trade', 'clan', 'whisper'] as const
export type ChatChannel = (typeof CHAT_CHANNELS)[number]
/** Level needed to whisper (decision: same gate as player mail). */
export const WHISPER_MIN_LEVEL = 10
/** Wait between two team chat messages of one player (FeedBack_Common_075). */
export const TEAM_CHAT_COOLDOWN_MS = 5_000

// C0/C1 control characters and bidirectional overrides that could spoof how a message reads.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g

/** Plain text only: control characters become spaces, then the text is trimmed. */
export const chatTextSchema = z
  .string()
  .transform((text) => text.replace(CONTROL_CHARACTERS, ' ').trim())
  .pipe(
    z
      .string()
      .min(1, 'Type a message first.')
      .max(CHAT_MAX_LENGTH, `Messages can be at most ${CHAT_MAX_LENGTH} characters.`),
  )

export const chatSendSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.enum(['world', 'scene', 'team', 'trade', 'clan']), text: chatTextSchema }),
  // Any string: an invalid or unknown name answers "The player is offline." like the original.
  z.object({ channel: z.literal('whisper'), to: z.string().trim().max(32), text: chatTextSchema }),
])

export type ChatSendInput = z.input<typeof chatSendSchema>

/** Public fields of a connected player. Never carries user ids or emails. */
export interface ScenePlayer {
  characterId: string
  name: string
  level: number
  clothing: number
  gender: 0 | 1
  nation: Nation
}

export interface ScenePlayersEvent {
  sceneId: number
  players: ScenePlayer[]
}

export interface ChatMessage {
  id: string
  channel: ChatChannel
  /** Set for scene messages. */
  sceneId?: number
  sender: { characterId: string; name: string }
  /** Set for whispers: the recipient (the sender's tabs get the same message as an echo). */
  to?: { characterId: string; name: string }
  /** Plain text: render it as text, never as HTML. */
  text: string
  sentAt: string
}

/**
 * `unauthenticated`: the session ended; the server then drops the session's sockets.
 * `offline`: the whisper target is offline or does not exist.
 * `refused`: a whisper between two players where either one blocked the other. The message is the
 * same neutral line in both directions, so the sender cannot tell who blocked whom.
 */
export type ChatErrorCode =
  | 'invalid_payload'
  | 'empty'
  | 'too_long'
  | 'rate_limited'
  | 'unauthenticated'
  | 'offline'
  | 'refused'
  | 'level_too_low'
  | 'not_in_team'
  | 'not_in_clan'

export type ChatAck =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: { code: ChatErrorCode; message: string } }

/**
 * Handshake rejections arrive as connect_error with `data.code` set to one of these
 * (`too_many_connections`: the character already has the maximum number of open sockets).
 * A foreign Origin is refused at the transport (HTTP 403), which reaches the client as a
 * connect_error without `data`, like an unreachable server.
 */
export type RealtimeConnectErrorCode = 'unauthenticated' | 'no_character' | 'too_many_connections'

/** @deprecated Folded into RealtimeConnectErrorCode; kept until the server stops importing it. */
export type RealtimeAdmissionErrorCode = Extract<RealtimeConnectErrorCode, 'too_many_connections'>

/** A report of a line as the reporter saw it (after the server's filter). */
export const chatReportSchema = z.object({
  channel: z.enum(CHAT_CHANNELS),
  /** The sender of the reported line. */
  characterId: z.uuid(),
  text: z.string().min(1).max(CHAT_MAX_LENGTH),
})
export type ChatReportInput = z.input<typeof chatReportSchema>
export type ReportAck =
  | { ok: true }
  | {
      ok: false
      error: { code: 'invalid_payload' | 'rate_limited' | 'unauthenticated'; message: string }
    }

export interface FriendPresenceEvent {
  characterId: string
  name: string
  online: boolean
}

const noticePlayerSchema = z.object({
  characterId: z.uuid(),
  name: z.string(),
  level: z.number().int(),
})

/**
 * Server → client push notices. The server parses every notice with this schema, which also drops
 * fields it does not list (no private data leaks through a careless caller).
 */
export const noticeSchema = z.discriminatedUnion('kind', [
  /** A new mail arrived: blink the minimap Mail button. */
  z.object({ kind: z.literal('mail'), mailId: z.uuid(), category: z.string() }),
  /** A team invite (to the invited player) or an application (to the captain), 60 s to answer. */
  z.object({
    kind: z.literal('teamPrompt'),
    promptId: z.uuid(),
    prompt: z.enum(['invite', 'apply']),
    from: noticePlayerSchema,
    expiresAt: z.iso.datetime({ offset: true }),
  }),
  /** The team changed (join, leave, kick, captain, disband): refetch it. `teamId` null = no team. */
  z.object({
    kind: z.literal('teamChanged'),
    teamId: z.uuid().nullable(),
    /** Optional English line for the chat, e.g. "Sasuke_1 has joined your team." */
    message: z.string().max(CHAT_MAX_LENGTH).optional(),
  }),
  /** One of the player's Market listings sold. */
  z.object({
    kind: z.literal('marketSale'),
    itemId: z.number().int(),
    quantity: z.number().int().positive(),
  }),
  /**
   * The player's clan changed (joined, removed, role, leader): refetch it. `clanId` null = no clan.
   */
  z.object({
    kind: z.literal('clanChanged'),
    clanId: z.uuid().nullable(),
    /** Optional English line for the chat, e.g. "You joined the clan Konoha." */
    message: z.string().max(CHAT_MAX_LENGTH).optional(),
  }),
  /** Someone added the player as a friend: the add-back prompt. */
  z.object({ kind: z.literal('friendAdded'), from: noticePlayerSchema }),
  /**
   * A trade request or trade of the player changed: refetch it. `done` = a trade completed (the
   * bag and currencies changed). Optional English line for the chat.
   */
  z.object({
    kind: z.literal('trade'),
    done: z.boolean().optional(),
    message: z.string().max(CHAT_MAX_LENGTH).optional(),
  }),
  /**
   * A master / apprentice request or bond of the player changed: refetch it. `rewarded` = a
   * graduation paid out (the currencies changed). Optional English line for the chat.
   */
  z.object({
    kind: z.literal('apprentice'),
    rewarded: z.boolean().optional(),
    message: z.string().max(CHAT_MAX_LENGTH).optional(),
  }),
])
export type Notice = z.infer<typeof noticeSchema>
export type NoticeKind = Notice['kind']

export interface ServerToClientEvents {
  [REALTIME_EVENTS.scenePlayers]: (event: ScenePlayersEvent) => void
  [REALTIME_EVENTS.chatMessage]: (message: ChatMessage) => void
  [REALTIME_EVENTS.friendPresence]: (event: FriendPresenceEvent) => void
  [REALTIME_EVENTS.notice]: (notice: Notice) => void
}

export interface ClientToServerEvents {
  [REALTIME_EVENTS.chatSend]: (input: ChatSendInput, ack: (result: ChatAck) => void) => void
  [REALTIME_EVENTS.chatReport]: (input: ChatReportInput, ack: (result: ReportAck) => void) => void
}
