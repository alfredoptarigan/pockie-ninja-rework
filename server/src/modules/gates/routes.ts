// Demon City instances and pub fights, registered under /api/game/gates.
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { cardRoutes } from './cards.js'
import { lasNochesRoutes } from './las-noches.js'
import { pubFightRoutes } from './pub-fights.js'
import { tollGateRoutes } from './toll-gates.js'

export async function gateRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Only `db` is passed on: the parent options carry the prefix, which would apply twice.
  const options = { db }
  await app.register(tollGateRoutes, options)
  await app.register(cardRoutes, options)
  await app.register(lasNochesRoutes, options)
  await app.register(pubFightRoutes, options)
}
