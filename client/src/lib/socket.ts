import type { ClientToServerEvents, ServerToClientEvents } from '@pockie/shared'
import { io, type Socket } from 'socket.io-client'

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/**
 * Connects to the realtime server on the page's own origin; the pn_session cookie authenticates
 * the handshake. Rejections arrive as `connect_error` with `error.data.code`.
 */
export function createGameSocket(): GameSocket {
  return io({ withCredentials: true })
}
