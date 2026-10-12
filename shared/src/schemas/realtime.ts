import { z } from 'zod'
import type { Nation } from './game.js'

/** Socket.IO event names shared by the server and the client. */
export const REALTIME_EVENTS = {
  /** Server → client: the full player list of the socket's current scene. */
  scenePlayers: 'scene:players',
  /** Server → client: a chat message on the world or scene channel. */
  chatMessage: 'chat:message',
  /** Client → server: send a chat message; answered with a ChatAck. */
  chatSend: 'chat:send',
} as const

export const CHAT_MAX_LENGTH = 200
export const CHAT_CHANNELS = ['world', 'scene'] as const
export type ChatChannel = (typeof CHAT_CHANNELS)[number]

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

export const chatSendSchema = z.object({
  channel: z.enum(CHAT_CHANNELS),
  text: chatTextSchema,
})

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
  /** Plain text: render it as text, never as HTML. */
  text: string
  sentAt: string
}

/** `unauthenticated`: the session ended; the server then drops the session's sockets. */
export type ChatErrorCode =
  'invalid_payload' | 'empty' | 'too_long' | 'rate_limited' | 'unauthenticated'

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

export interface ServerToClientEvents {
  [REALTIME_EVENTS.scenePlayers]: (event: ScenePlayersEvent) => void
  [REALTIME_EVENTS.chatMessage]: (message: ChatMessage) => void
}

export interface ClientToServerEvents {
  [REALTIME_EVENTS.chatSend]: (input: ChatSendInput, ack: (result: ChatAck) => void) => void
}
