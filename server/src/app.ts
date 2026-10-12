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

  app.get('/api/health', async () => ({ ok: true }))
  app.register(authRoutes, { db, env, prefix: '/api/auth' })
  app.register(contentRoutes, { db, prefix: '/api' })
  app.register(statusRoutes, { db, prefix: '/api' })
  app.register(characterRoutes, { db, prefix: '/api/game' })

  return app
}
