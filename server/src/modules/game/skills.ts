import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { learningView, learnThroughLevel } from '../../game/learning.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { lockCharacter, requireUser } from './characters.js'
import { RATE_LIMITS } from './rate-limits.js'

export async function skillRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/skills', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      if (await learnThroughLevel(tx, character)) await refreshArenaSnapshot(tx, character.id)
      return learningView(tx, character.id)
    }),
  )
}
