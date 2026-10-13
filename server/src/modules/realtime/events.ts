// In-process hooks between the realtime server and other modules: presence for the team grace
// (decision 15) and push notices (mail, team prompts, Market sales, friend adds).
// ponytail: a process-local EventEmitter; with several server processes, presence and notices
// must go through a shared bus (Redis pub/sub or the Socket.IO Redis adapter).
import { EventEmitter } from 'node:events'
import { noticeSchema, type Notice } from '@pockie/shared'

type CharacterListener = (characterId: string) => void
type NoticeListener = (characterId: string, notice: Notice) => void

const bus = new EventEmitter()
// One listener per attached realtime server plus any module hooks; no leak warning needed.
bus.setMaxListeners(0)

function subscribe(event: string, listener: CharacterListener | NoticeListener) {
  bus.on(event, listener)
  return () => void bus.off(event, listener)
}

/** Runs when a character's first socket connects. Returns an unsubscribe function. */
export const onCharacterOnline = (listener: CharacterListener) => subscribe('online', listener)

/** Runs when a character's last socket closes. Returns an unsubscribe function. */
export const onCharacterOffline = (listener: CharacterListener) => subscribe('offline', listener)

/**
 * Pushes a notice to every open tab of the character; a no-op when it is offline (mail and prompts
 * are stored, so nothing is lost). Throws on a malformed notice; unlisted fields are dropped.
 */
export function notifyCharacter(characterId: string, notice: Notice) {
  bus.emit('notice', characterId, noticeSchema.parse(notice))
}

/** For the realtime server only. */
export const presence = {
  online: (characterId: string) => bus.emit('online', characterId),
  offline: (characterId: string) => bus.emit('offline', characterId),
  onNotice: (listener: NoticeListener) => subscribe('notice', listener),
}
