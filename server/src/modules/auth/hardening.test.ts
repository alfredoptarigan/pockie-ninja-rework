import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { sessions } from '../../db/schema.js'
import { loadEnv } from '../../env.js'
import { createSession } from './sessions.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>

const naruto = { username: 'Naruto', email: 'naruto@konoha.example', password: 'believe-it' }

beforeEach(() => truncateAll(db))
afterEach(() => app?.close())
afterAll(() => close())

async function registered() {
  app = buildTestApp(db)
  const client = new Client(app)
  await client.post('/api/auth/register', naruto)
  return client
}

describe('per-account login limit', () => {
  const attempt = (client: Client, login: string, password: string, ip: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: ip,
      payload: { login, password },
      headers: { cookie: client.cookieHeader, 'x-csrf-token': client.csrfToken },
    })

  it('locks an account after 10 failed logins even when they come from different IPs', async () => {
    const client = await registered()
    for (let i = 0; i < 10; i++) {
      const failed = await attempt(client, 'NARUTO', 'wrong-password', `10.0.0.${i}`)
      expect(failed.statusCode).toBe(401)
    }
    const locked = await attempt(client, 'NARUTO', naruto.password, '10.0.1.1')
    expect(locked.statusCode).toBe(429)
  })

  it('shares one budget between the username and the email of an account', async () => {
    const client = await registered()
    for (let i = 0; i < 10; i++) {
      const login = i % 2 ? naruto.username : naruto.email.toUpperCase()
      expect((await attempt(client, login, 'wrong-password', `10.0.0.${i}`)).statusCode).toBe(401)
    }
    expect((await attempt(client, naruto.email, naruto.password, '10.0.1.1')).statusCode).toBe(429)
  })

  it('counts simultaneous failures before any password is checked', async () => {
    const client = await registered()
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        attempt(client, naruto.username, 'wrong-password', `10.0.2.${i}`),
      ),
    )
    const statuses = results.map((r) => r.statusCode)
    expect(statuses.filter((s) => s === 401)).toHaveLength(10)
    expect(statuses.filter((s) => s === 429)).toHaveLength(5)
  })

  it('locks unknown logins the same way, so a lockout does not reveal an account', async () => {
    const client = await registered()
    for (let i = 0; i < 10; i++) {
      expect((await attempt(client, 'Ghost', 'wrong-password', `10.0.3.${i}`)).statusCode).toBe(401)
    }
    expect((await attempt(client, 'GHOST', 'wrong-password', '10.0.4.1')).statusCode).toBe(429)
  })

  it('does not trust X-Forwarded-For unless TRUST_PROXY is set', async () => {
    const client = await registered()
    for (let i = 0; i < 10; i++) {
      await client.post(
        '/api/auth/login',
        { login: `nobody_${i}`, password: 'wrong-password' },
        { 'x-forwarded-for': `203.0.113.${i}` },
      )
    }
    const response = await client.post(
      '/api/auth/login',
      { login: 'nobody_x', password: 'wrong-password' },
      { 'x-forwarded-for': '203.0.113.99' },
    )
    expect(response.statusCode).toBe(429)
  })
})

describe('sessions', () => {
  it('revokes the session the browser presented when it logs in again', async () => {
    const client = await registered()
    await client.post('/api/auth/login', { login: naruto.username, password: naruto.password })
    expect(await db.select().from(sessions)).toHaveLength(1)
  })

  it('purges every expired session when a new one is created', async () => {
    const client = await registered()
    const [row] = await db.select().from(sessions)
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) })
    await createSession(db, row!.userId, false)
    expect(await db.select().from(sessions)).toHaveLength(1)
    expect(client.cookie('pn_session')).toBeDefined()
  })
})

describe('production cookies', () => {
  it('uses __Host- prefixed, Secure cookies', async () => {
    app = buildTestApp(db, { NODE_ENV: 'production', APP_ORIGIN: 'https://play.example' })
    const client = new Client(app)
    await client.fetchCsrf()
    const response = await client.post('/api/auth/register', naruto, {
      origin: 'https://play.example',
    })

    expect(response.statusCode).toBe(201)
    const session = response.cookies.find((cookie) => cookie.name === '__Host-pn_session')
    expect(session).toMatchObject({ secure: true, httpOnly: true, path: '/' })
    expect(client.cookie('__Host-pn_csrf')).toBeDefined()
  })
})

describe('responses', () => {
  it('does not echo parser internals for malformed JSON', async () => {
    const client = await registered()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: '{"login":',
      headers: {
        'content-type': 'application/json',
        cookie: client.cookieHeader,
        'x-csrf-token': client.csrfToken,
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.message).toBe('The request could not be understood.')
  })

  it('sends security headers and never caches auth responses', async () => {
    const client = await registered()
    const response = await client.get('/api/auth/me')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-frame-options']).toBe('DENY')
    expect(response.headers['cache-control']).toBe('no-store')
  })
})

describe('env', () => {
  const base = { DATABASE_URL: 'postgres://localhost/x' }

  it('normalizes APP_ORIGIN to a bare origin', () => {
    expect(loadEnv({ ...base, APP_ORIGIN: 'http://localhost:5173/' }).APP_ORIGIN).toBe(
      'http://localhost:5173',
    )
  })

  it('requires an https APP_ORIGIN in production', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', APP_ORIGIN: 'http://play.example' }),
    ).toThrow(/APP_ORIGIN/)
  })
})
