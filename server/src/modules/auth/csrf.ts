import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { Env } from '../../env.js'
import { HttpError } from '../../http.js'

export const CSRF_COOKIE = 'pn_csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function sameToken(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Double-submit CSRF protection: GET /api/auth/csrf hands out a token that is also stored in an
 * httpOnly cookie; every state-changing request must echo it in the x-csrf-token header.
 * Requests that carry a foreign Origin header are rejected outright.
 */
export const csrfPlugin = fp(async (app: FastifyInstance, { env }: { env: Env }) => {
  app.get('/api/auth/csrf', async (request, reply) => {
    let token = request.cookies[CSRF_COOKIE]
    if (!token) {
      token = randomBytes(32).toString('base64url')
      reply.setCookie(CSRF_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
      })
    }
    return { token }
  })

  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return

    const origin = request.headers.origin
    if (origin && origin !== env.APP_ORIGIN) {
      throw new HttpError(403, 'bad_origin', 'This request came from an unknown site.')
    }
    const cookie = request.cookies[CSRF_COOKIE]
    const header = request.headers['x-csrf-token']
    if (!cookie || typeof header !== 'string' || !sameToken(cookie, header)) {
      throw new HttpError(403, 'csrf', 'Your session expired. Refresh the page and try again.')
    }
  })
})
