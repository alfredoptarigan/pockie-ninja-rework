import { createHash, randomBytes } from 'node:crypto'
import type { PublicUser } from '@pockie/shared'
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { sessions, users } from '../../db/schema.js'

export const SESSION_COOKIE = 'pn_session'
export const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60
const BROWSER_SESSION_SECONDS = 24 * 60 * 60
const TOUCH_INTERVAL_MS = 60_000

export interface AuthContext {
  sessionId: string
  user: PublicUser
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const publicUserColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  role: users.role,
  createdAt: users.createdAt,
}

export function toPublicUser(row: {
  id: string
  username: string
  email: string
  role: PublicUser['role']
  createdAt: Date
}): PublicUser {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

export async function createSession(db: Db, userId: string, rememberMe: boolean) {
  const token = randomBytes(32).toString('base64url')
  const ttl = rememberMe ? REMEMBER_ME_SECONDS : BROWSER_SESSION_SECONDS
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, sql`now()`)))
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + ttl * 1000),
  })
  return token
}

export async function findSession(db: Db, token: string): Promise<AuthContext | null> {
  const [row] = await db
    .select({ sessionId: sessions.id, lastSeenAt: sessions.lastSeenAt, ...publicUserColumns })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, sql`now()`)))
  if (!row) return null

  const { sessionId, lastSeenAt, ...user } = row
  if (Date.now() - lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(sessions.id, sessionId))
  }
  return { sessionId, user: toPublicUser(user) }
}

export async function deleteSession(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}
