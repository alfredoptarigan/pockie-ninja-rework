import type { ServerStatus } from '@pockie/shared'
import { and, countDistinct, gt, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { sessions } from '../../db/schema.js'

export async function statusRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // A player is "active now" when one of their live sessions made a request in the last 5 minutes.
  app.get('/status', async (): Promise<ServerStatus> => {
    const [row] = await db
      .select({ count: countDistinct(sessions.userId) })
      .from(sessions)
      .where(
        and(
          gt(sessions.lastSeenAt, sql`now() - interval '5 minutes'`),
          gt(sessions.expiresAt, sql`now()`),
        ),
      )
    return { online: true, playersActiveNow: row?.count ?? 0 }
  })
}
