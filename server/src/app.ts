import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { Db } from './db/client.js'
import type { Env } from './env.js'
import { errorHandler, notFoundHandler } from './http.js'
import { csrfPlugin } from './modules/auth/csrf.js'
import { getDummyHash } from './modules/auth/password.js'
import { authRoutes, sessionPlugin } from './modules/auth/routes.js'
import { contentRoutes } from './modules/content/routes.js'
import { characterRoutes } from './modules/game/characters.js'
import { clanRoutes } from './modules/clans/routes.js'
import { worldRoutes } from './modules/game/world.js'
import { skillRoutes } from './modules/game/skills.js'
import { nonfightBuffRoutes } from './modules/game/nonfight-buffs.js'
import { treasureRoutes } from './modules/game/treasure.js'
import { actionRoutes } from './modules/game/actions.js'
import { bagRoutes } from './modules/bag/routes.js'
import { outfitRoutes } from './modules/outfit/routes.js'
import { exploreRoutes } from './modules/game/explore.js'
import { forgeRoutes } from './modules/forge/routes.js'
import { gateRoutes } from './modules/gates/routes.js'
import { arenaRoutes } from './modules/arena/routes.js'
import { rankingRoutes } from './modules/rankings/routes.js'
import { attachRealtime } from './modules/realtime/realtime.js'
import { socialRoutes } from './modules/social/routes.js'
import { teamRoutes } from './modules/teams/index.js'
import { statusRoutes } from './modules/status/routes.js'

interface AppOptions {
  env: Env
  db: Db
  logger?: boolean
}

export function buildApp({ env, db, logger = false }: AppOptions) {
  const app = Fastify({
    logger,
    bodyLimit: 64 * 1024,
    // Trust X-Forwarded-For only for the configured number of proxy hops.
    trustProxy: (_address: string, hop: number) => hop < env.TRUST_PROXY,
  })
  // Hash the dummy password now so the first unknown-user login is not measurably slower.
  void getDummyHash()

  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    if (request.url.startsWith('/api/auth/')) reply.header('cache-control', 'no-store')
  })
  app.register(cookie)
  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      code: 'rate_limited',
      message: `Too many attempts. Try again in ${context.after}.`,
    }),
  })
  app.register(csrfPlugin, { env })
  app.register(sessionPlugin, { db, env })
  const realtime = attachRealtime(app, { db, env })

  app.get('/api/health', async () => ({ ok: true }))
  app.register(authRoutes, { db, env, realtime, prefix: '/api/auth' })
  app.register(contentRoutes, { db, prefix: '/api' })
  app.register(statusRoutes, { db, prefix: '/api' })
  app.register(characterRoutes, { db, prefix: '/api/game' })
  app.register(worldRoutes, { db, prefix: '/api/game' })
  app.register(skillRoutes, { db, prefix: '/api/game' })
  app.register(nonfightBuffRoutes, { db, prefix: '/api/game' })
  app.register(treasureRoutes, { db, prefix: '/api/game' })
  app.register(actionRoutes, { db, realtime, prefix: '/api/game' })
  app.register(bagRoutes, { db, prefix: '/api/game' })
  app.register(outfitRoutes, { db, prefix: '/api/game' })
  app.register(exploreRoutes, { db, prefix: '/api/game' })
  app.register(forgeRoutes, { db, prefix: '/api/game' })
  app.register(gateRoutes, { db, prefix: '/api/game/gates' })
  app.register(import('./modules/shop/routes.js'), { db, prefix: '/api/game/shop' })
  app.register(import('./modules/daily/routes.js'), { db, prefix: '/api/game/daily' })
  app.register(import('./modules/talents/routes.js'), { db, prefix: '/api/game/talents' })
  app.register(import('./modules/bloodlines/routes.js'), { db, prefix: '/api/game/bloodlines' })
  app.register(import('./modules/events/routes.js'), { db, prefix: '/api/game/events' })
  app.register(import('./modules/tailed-beast/routes.js'), { db, prefix: '/api/game/tailed-beast' })
  app.register(import('./modules/team-stone/routes.js'), { db, prefix: '/api/game/team-stone' })
  app.register(import('./modules/wings/routes.js'), { db, prefix: '/api/game/wings' })
  app.register(import('./modules/cards/routes.js'), { db, prefix: '/api/game/cards' })
  app.register(import('./modules/pets/routes.js'), { db, prefix: '/api/game/pets' })
  app.register(import('./modules/kennel/routes.js'), { db, prefix: '/api/game/kennel' })
  app.register(import('./modules/bankai/routes.js'), { db, prefix: '/api/game/bankai' })
  app.register(socialRoutes, { db, prefix: '/api/game/social' })
  app.register(import('./modules/market/routes.js'), { db, prefix: '/api/game/market' })
  app.register(arenaRoutes, { db, prefix: '/api/game/arena' })
  app.register(rankingRoutes, { db, prefix: '/api/game/rankings' })
  app.register(teamRoutes, { db, prefix: '/api/game/team' })
  app.register(clanRoutes, { db, prefix: '/api/game/clans' })

  return app
}
