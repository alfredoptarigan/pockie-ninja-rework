// Lookups and locks shared by friends, blocks and mail.
import type { Notice } from '@pockie/shared'
import { and, eq, inArray, or } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { blocks, characters } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { notifyCharacter, onCharacterOffline, onCharacterOnline } from '../realtime/events.js'
import type { SocialPlayer } from '../../../../shared/src/schemas/social.js'

export type CharacterRow = typeof characters.$inferSelect
/** Notices to push once the transaction has committed. */
export type Outbox = [characterId: string, notice: Notice][]

export const bad = (code: string, message: string, status = 400) =>
  new HttpError(status, code, message)

// ponytail: process-local presence from the realtime bus, like realtime's own map; move to a
// shared store together with realtime before running more than one server.
const onlineNow = new Set<string>()
onCharacterOnline((id) => void onlineNow.add(id))
onCharacterOffline((id) => void onlineNow.delete(id))
export const isOnline = (characterId: string) => onlineNow.has(characterId)

export const toPlayer = (row: CharacterRow): SocialPlayer => ({
  characterId: row.id,
  name: row.name,
  level: row.level,
  nation: row.nation as SocialPlayer['nation'],
  gender: row.gender as 0 | 1,
  clothing: row.clothing,
  avatarId: row.avatarId,
})

const UNKNOWN_NAME = 'There is no ninja with that name.'

/** Names are unique case-insensitively (characters.name_lower). */
export async function characterByName(db: Tx | Db, name: string) {
  const [row] = await db
    .select()
    .from(characters)
    .where(eq(characters.nameLower, name.toLowerCase()))
  if (!row) throw bad('unknown_name', UNKNOWN_NAME, 404)
  return row
}

export async function characterById(db: Tx | Db, id: string) {
  const [row] = await db.select().from(characters).where(eq(characters.id, id))
  if (!row) throw bad('unknown_name', UNKNOWN_NAME, 404)
  return row
}

/**
 * Locks both characters in id order (the fixed lock order of every M4 action) and returns them
 * fresh, `[me, them]`.
 */
export async function lockPair(tx: Tx, meId: string, themId: string) {
  const rows = await tx
    .select()
    .from(characters)
    .where(inArray(characters.id, [meId, themId]))
    .orderBy(characters.id)
    .for('update')
  const me = rows.find((row) => row.id === meId)
  const them = rows.find((row) => row.id === themId)
  if (!me || !them) throw bad('unknown_name', UNKNOWN_NAME, 404)
  return [me, them] as const
}

/**
 * True when either character blocked the other (decision 17). Team invites and duels call this
 * too; the refusal they show must be the same in both directions.
 */
export async function isBlocked(db: Tx | Db, a: string, b: string) {
  const pair = (owner: string, blocked: string) =>
    and(eq(blocks.ownerId, owner), eq(blocks.blockedId, blocked))
  const [row] = await db
    .select({ ownerId: blocks.ownerId })
    .from(blocks)
    .where(or(pair(a, b), pair(b, a)))
    .limit(1)
  return Boolean(row)
}

export function deliver(outbox: Outbox) {
  for (const [characterId, notice] of outbox) notifyCharacter(characterId, notice)
}
