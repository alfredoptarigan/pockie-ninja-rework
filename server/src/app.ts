import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { Db } from './db/client.js'
import type { Env } from './env.js'
import { errorHandler } from './http.js'
import { csrfPlugin } from './modules/auth/csrf.js'
import { authRoutes, sessionPlugin } from './modules/auth/routes.js'

interface AppOptions {
  env: Env
  db: Db
  logger?: boolean
}

export function buildApp({ env, db, logger = false }: AppOptions) {
  const app = Fastify({ logger, bodyLimit: 64 * 1024 })

  app.setErrorHandler(errorHandler)
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

  return app
}
