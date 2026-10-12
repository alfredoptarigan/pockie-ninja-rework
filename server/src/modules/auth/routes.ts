import { loginSchema, registerSchema } from '@pockie/shared'
import { eq, or, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import type { Env } from '../../env.js'
import type { Realtime } from '../realtime/realtime.js'
import { HttpError } from '../../http.js'
import { cookieConfig } from './cookies.js'
import { createLoginLimiter } from './login-limiter.js'
import { getDummyHash, hashPassword, verifyPassword } from './password.js'
import {
  createSession,
  deleteSession,
  findSession,
  publicUserColumns,
  REMEMBER_ME_SECONDS,
  toPublicUser,
  type AuthContext,
} from './sessions.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
  }
}

interface Options {
  db: Db
  env: Env
}

const USERNAME_TAKEN = 'That username is already taken.'
const EMAIL_TAKEN = 'An account with that email already exists.'

function rateLimit(max: number, timeWindow: string) {
  return { rateLimit: { max, timeWindow } }
}

function uniqueViolation(error: unknown): string | undefined {
  const pg = (error as { cause?: { code?: string; constraint_name?: string } }).cause
  return pg?.code === '23505' ? pg.constraint_name : undefined
}

/** Resolves the session cookie on every request into request.auth. */
export const sessionPlugin = fp(async (app: FastifyInstance, { db, env }: Options) => {
  const cookieName = cookieConfig(env).session
  app.decorateRequest('auth', null)
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[cookieName]
    request.auth = token ? await findSession(db, token) : null
  })
})

export async function authRoutes(
  app: FastifyInstance,
  { db, env, realtime }: Options & { realtime: Pick<Realtime, 'endSession'> },
) {
  const cookies = cookieConfig(env)
  const loginLimiter = createLoginLimiter()
  const setSessionCookie = (reply: FastifyReply, token: string, rememberMe: boolean) =>
    reply.setCookie(cookies.session, token, {
      ...cookies.options,
      ...(rememberMe ? { maxAge: REMEMBER_ME_SECONDS } : {}),
    })

  app.post('/register', { config: rateLimit(10, '1 hour') }, async (request, reply) => {
    const input = registerSchema.parse(request.body)

    const taken = await db
      .select({ usernameLower: users.usernameLower, email: users.email })
      .from(users)
      .where(
        or(eq(users.usernameLower, input.username.toLowerCase()), eq(users.email, input.email)),
      )
    const fields: Record<string, string> = {}
    for (const row of taken) {
      if (row.usernameLower === input.username.toLowerCase()) fields.username = USERNAME_TAKEN
      if (row.email === input.email) fields.email = EMAIL_TAKEN
    }
    if (Object.keys(fields).length > 0) {
      throw new HttpError(409, 'conflict', 'That account already exists.', fields)
    }

    const passwordHash = await hashPassword(input.password)
    const user = await db
      .insert(users)
      .values({ username: input.username, email: input.email, passwordHash })
      .returning(publicUserColumns)
      .then((rows) => rows[0])
      .catch((error: unknown) => {
        const constraint = uniqueViolation(error)
        if (!constraint) throw error
        const field: Record<string, string> = constraint.includes('email')
          ? { email: EMAIL_TAKEN }
          : { username: USERNAME_TAKEN }
        throw new HttpError(409, 'conflict', 'That account already exists.', field)
      })
    if (!user) throw new Error('Insert returned no row')

    setSessionCookie(reply, await createSession(db, user.id, false), false)
    return reply.code(201).send({ user: toPublicUser(user) })
  })

  app.post('/login', { config: rateLimit(10, '15 minutes') }, async (request, reply) => {
    const { login, password, rememberMe } = loginSchema.parse(request.body)
    const key = login.toLowerCase()
    if (loginLimiter.isLocked(key)) {
      throw new HttpError(
        429,
        'account_locked',
        'Too many failed attempts for this account. Try again in 15 minutes.',
      )
    }

    const [user] = await db
      .select({ ...publicUserColumns, passwordHash: users.passwordHash })
      .from(users)
      .where(or(eq(users.usernameLower, key), eq(users.email, key)))
    const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password)
    if (!user || !valid) {
      loginLimiter.fail(key)
      throw new HttpError(401, 'invalid_credentials', 'Wrong username, email or password.')
    }

    loginLimiter.reset(key)
    // Never keep the session the browser presented: a fresh token on every login.
    if (request.auth) await deleteSession(db, request.auth.sessionId)
    await db
      .update(users)
      .set({ lastLoginAt: sql`now()` })
      .where(eq(users.id, user.id))
    setSessionCookie(reply, await createSession(db, user.id, rememberMe), rememberMe)
    const { passwordHash, ...publicUser } = user
    return { user: toPublicUser(publicUser) }
  })

  app.post('/logout', async (request, reply) => {
    if (request.auth) {
      await deleteSession(db, request.auth.sessionId)
      realtime.endSession(request.auth.sessionId)
    }
    reply.clearCookie(cookies.session, cookies.options)
    return reply.code(204).send()
  })

  app.get('/me', async (request) => {
    if (!request.auth) throw new HttpError(401, 'unauthenticated', 'Please log in.')
    return { user: request.auth.user }
  })
}
