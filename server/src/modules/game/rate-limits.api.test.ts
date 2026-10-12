import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { RATE_LIMITS } from './rate-limits.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
const routes: string[] = []

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  routes.length = 0
  app.addHook('onRoute', (route) => {
    if (route.url.startsWith('/api/game/') && route.method !== 'HEAD') {
      const limited = Boolean((route.config as { rateLimit?: unknown } | undefined)?.rateLimit)
      routes.push(`${String(route.method)} ${route.url}${limited ? '' : ' (unlimited)'}`)
    }
  })
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Player_one',
    email: 'player@example.com',
    password: 'believe-it',
  })
})
afterEach(() => app.close())
afterAll(() => close())

describe('game API rate limits', () => {
  it('limits every game route', async () => {
    await app.ready()
    expect(routes.length).toBeGreaterThan(10)
    expect(routes.filter((route) => route.endsWith('(unlimited)'))).toEqual([])
  })

  it.each([
    ['POST', '/api/game/travel', RATE_LIMITS.travel.max],
    ['POST', '/api/game/quests/1/accept', RATE_LIMITS.acceptQuest.max],
    ['POST', '/api/game/explore/1', RATE_LIMITS.explore.max],
    ['GET', '/api/game/scene', RATE_LIMITS.read.max],
  ])('answers 429 after %s %s is called %i times in a minute', async (method, url, max) => {
    const send = () => (method === 'GET' ? client.get(url) : client.post(url, {}))
    for (let i = 0; i < max; i++) expect((await send()).statusCode).not.toBe(429)
    const limited = await send()
    expect(limited.statusCode).toBe(429)
    expect(limited.json().error.code).toBe('rate_limited')
  })
})
