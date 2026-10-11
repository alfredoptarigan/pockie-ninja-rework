import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, createTestDb, truncateAll } from '../../../test/helpers.js'
import { sessions, users } from '../../db/schema.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
})
afterEach(() => app.close())
afterAll(() => close())

async function user(username: string) {
  const [row] = await db
    .insert(users)
    .values({ username, email: `${username.toLowerCase()}@example.com`, passwordHash: 'x' })
    .returning()
  return row!.id
}

function session(userId: string, lastSeen: string, expires = "interval '1 day'") {
  return db.insert(sessions).values({
    userId,
    tokenHash: `${userId}-${lastSeen}-${expires}`,
    lastSeenAt: sql.raw(`now() - interval '${lastSeen}'`),
    expiresAt: sql.raw(`now() + ${expires}`),
  })
}

describe('GET /api/status', () => {
  it('reports online with zero players on an empty server', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/status' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ online: true, playersActiveNow: 0 })
  })

  it('counts distinct players seen in the last 5 minutes with a live session', async () => {
    const naruto = await user('Naruto')
    const sasuke = await user('Sasuke')
    const sakura = await user('Sakura')
    const kakashi = await user('Kakashi')
    await session(naruto, '1 minute')
    await session(naruto, '2 minutes') // second device, same player
    await session(sasuke, '4 minutes')
    await session(sakura, '6 minutes') // idle too long
    await session(kakashi, '1 minute', "interval '-1 second'") // expired

    const response = await app.inject({ method: 'GET', url: '/api/status' })
    expect(response.json().playersActiveNow).toBe(2)
  })
})
