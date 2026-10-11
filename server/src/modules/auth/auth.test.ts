import { eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { sessions, users } from '../../db/schema.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client

const naruto = {
  username: 'Naruto_Uzumaki',
  email: 'naruto@konoha.example',
  password: 'believe-it',
}
const THIRTY_DAYS = 30 * 24 * 60 * 60

function sessionCookie(response: { cookies: { name: string; maxAge?: number }[] }) {
  return response.cookies.find((cookie) => cookie.name === 'pn_session')
}

async function register(c = client, body: object = naruto) {
  return c.post('/api/auth/register', body)
}

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  client = new Client(app)
})
afterEach(() => app.close())
afterAll(() => close())

describe('POST /api/auth/register', () => {
  it('creates a player, logs them in and never returns the password hash', async () => {
    const response = await register()

    expect(response.statusCode).toBe(201)
    const { user } = response.json()
    expect(user).toMatchObject({ username: 'Naruto_Uzumaki', email: naruto.email, role: 'player' })
    expect(user).not.toHaveProperty('passwordHash')

    const cookie = sessionCookie(response)
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' })
    expect(cookie?.maxAge).toBeUndefined()

    const [row] = await db.select().from(users)
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('normalizes the email to lowercase', async () => {
    const response = await register(client, { ...naruto, email: '  Naruto@Konoha.Example ' })
    expect(response.statusCode).toBe(201)
    expect(response.json().user.email).toBe('naruto@konoha.example')
  })

  it('rejects a username taken with different casing', async () => {
    await register()
    const response = await register(new Client(app), {
      ...naruto,
      username: 'NARUTO_uzumaki',
      email: 'other@konoha.example',
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.fields).toHaveProperty('username')
  })

  it('rejects an email that is already registered', async () => {
    await register()
    const response = await register(new Client(app), {
      ...naruto,
      username: 'Sasuke',
      email: 'NARUTO@konoha.example',
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.fields).toHaveProperty('email')
  })

  it.each([
    ['password', { password: 'short' }],
    ['username', { username: 'ab' }],
    ['username', { username: 'no spaces' }],
    ['email', { email: 'not-an-email' }],
  ])('rejects an invalid %s', async (field, override) => {
    const response = await register(client, { ...naruto, ...override })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.fields).toHaveProperty(field)
  })

  it('is rate limited per IP', async () => {
    for (let i = 0; i < 10; i++) {
      await register(client, { ...naruto, username: `ninja_${i}`, email: `n${i}@konoha.example` })
    }
    const response = await register(client, {
      ...naruto,
      username: 'ninja_x',
      email: 'x@k.example',
    })
    expect(response.statusCode).toBe(429)
  })
})

describe('CSRF protection', () => {
  it('rejects a state-changing request without a CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: naruto,
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects a token that does not match the cookie', async () => {
    await client.fetchCsrf()
    client.csrfToken = 'forged'
    const response = await register()
    expect(response.statusCode).toBe(403)
  })

  it('rejects requests from a foreign origin', async () => {
    const response = await client.post('/api/auth/register', naruto, {
      origin: 'https://evil.example',
    })
    expect(response.statusCode).toBe(403)
  })

  it('accepts requests from the app origin', async () => {
    const response = await client.post('/api/auth/register', naruto, {
      origin: 'http://localhost:5173',
    })
    expect(response.statusCode).toBe(201)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await register(new Client(app))
  })

  it('logs in with the username in any casing', async () => {
    const response = await client.post('/api/auth/login', {
      login: 'naruto_UZUMAKI',
      password: naruto.password,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().user.username).toBe('Naruto_Uzumaki')
    expect(sessionCookie(response)?.maxAge).toBeUndefined()

    const [row] = await db.select().from(users)
    expect(row?.lastLoginAt).toBeInstanceOf(Date)
  })

  it('logs in with the email and keeps the cookie for 30 days when remembered', async () => {
    const response = await client.post('/api/auth/login', {
      login: 'Naruto@Konoha.example',
      password: naruto.password,
      rememberMe: true,
    })
    expect(response.statusCode).toBe(200)
    expect(sessionCookie(response)?.maxAge).toBe(THIRTY_DAYS)
  })

  it('returns the same generic error for a wrong password and an unknown user', async () => {
    const wrongPassword = await client.post('/api/auth/login', {
      login: naruto.username,
      password: 'wrong-password',
    })
    const unknownUser = await client.post('/api/auth/login', {
      login: 'Madara',
      password: 'wrong-password',
    })
    expect(wrongPassword.statusCode).toBe(401)
    expect(unknownUser.statusCode).toBe(401)
    expect(wrongPassword.json()).toEqual(unknownUser.json())
    expect(sessionCookie(wrongPassword)).toBeUndefined()
  })

  it('is rate limited per IP', async () => {
    for (let i = 0; i < 10; i++) {
      await client.post('/api/auth/login', { login: 'Madara', password: 'wrong-password' })
    }
    const response = await client.post('/api/auth/login', {
      login: naruto.username,
      password: naruto.password,
    })
    expect(response.statusCode).toBe(429)
  })
})

describe('GET /api/auth/me', () => {
  it('returns 401 without a session', async () => {
    const response = await client.get('/api/auth/me')
    expect(response.statusCode).toBe(401)
  })

  it('returns the current user and touches last_seen_at', async () => {
    await register()
    await db.update(sessions).set({ lastSeenAt: sql`now() - interval '10 minutes'` })

    const response = await client.get('/api/auth/me')

    expect(response.statusCode).toBe(200)
    expect(response.json().user.username).toBe('Naruto_Uzumaki')
    const [row] = await db
      .select({ stale: sql<boolean>`${sessions.lastSeenAt} < now() - interval '1 minute'` })
      .from(sessions)
    expect(row?.stale).toBe(false)
  })

  it('rejects an expired session', async () => {
    await register()
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 second'` })
    const response = await client.get('/api/auth/me')
    expect(response.statusCode).toBe(401)
  })

  it('rejects an unknown token', async () => {
    client.setCookie('pn_session', 'not-a-real-token')
    const response = await client.get('/api/auth/me')
    expect(response.statusCode).toBe(401)
  })

  it('stores only a hash of the session token', async () => {
    await register()
    const [row] = await db.select().from(sessions)
    expect(row?.tokenHash).not.toBe(client.cookie('pn_session'))
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('POST /api/auth/logout', () => {
  it('deletes the session and clears the cookie', async () => {
    await register()
    const token = client.cookie('pn_session')

    const response = await client.post('/api/auth/logout')

    expect(response.statusCode).toBe(204)
    expect(client.cookie('pn_session')).toBeUndefined()
    expect(await db.select().from(sessions)).toHaveLength(0)

    client.setCookie('pn_session', token ?? '')
    expect((await client.get('/api/auth/me')).statusCode).toBe(401)
  })

  it('only deletes the current session', async () => {
    await register()
    const other = new Client(app)
    await other.post('/api/auth/login', { login: naruto.username, password: naruto.password })

    await client.post('/api/auth/logout')

    const [user] = await db.select().from(users)
    const remaining = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user?.id ?? ''))
    expect(remaining).toHaveLength(1)
    expect((await other.get('/api/auth/me')).statusCode).toBe(200)
  })
})
