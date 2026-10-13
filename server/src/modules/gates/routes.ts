// Demon City instances and pub fights, registered under /api/game/gates.
import { gateLayout } from '@pockie/game-core'
import { enterGateSchema } from '@pockie/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import { teamGateEnter, teamGateExit, teamGateFight, teamPubFight } from '../teams/index.js'
import { cardRoutes } from './cards.js'
import { tollGateTables } from './data.js'
import { lasNochesRoutes } from './las-noches.js'
import { pubFightRoutes } from './pub-fights.js'
import { tollGateRoutes } from './toll-gates.js'

/**
 * The team versions of these routes (teams/runs.ts). Each answers undefined for a ninja without
 * a team, and the solo route runs as before.
 */
const TEAM_ROUTES: Record<string, (db: Db, request: FastifyRequest) => Promise<unknown>> = {
  '/enter': (db, request) => {
    const input = enterGateSchema.safeParse(request.body)
    // Bad input and unknown gates get the solo route's errors.
    const known =
      input.success &&
      tollGateTables().gates[String(input.data.gateId)] &&
      gateLayout(input.data.gateId, tollGateTables()).length > 0
    if (!known) return Promise.resolve(undefined)
    return teamGateEnter(db, request, input.data.gateId)
  },
  '/run/fight': teamGateFight,
  '/run/exit': teamGateExit,
  '/pub/fight': teamPubFight,
}

export async function gateRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.addHook('preHandler', async (request, reply) => {
    const path = request.routeOptions.url?.slice(app.prefix.length) ?? ''
    const team = request.method === 'POST' ? TEAM_ROUTES[path] : undefined
    const result = team && (await team(db, request))
    if (result) return reply.send(result)
  })
  // Only `db` is passed on: the parent options carry the prefix, which would apply twice.
  const options = { db }
  await app.register(tollGateRoutes, options)
  await app.register(cardRoutes, options)
  await app.register(lasNochesRoutes, options)
  await app.register(pubFightRoutes, options)
}
