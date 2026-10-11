import { afterAll, describe, expect, it } from 'vitest'
import { buildTestApp, createTestDb } from '../test/helpers.js'

const { db, close } = createTestDb()
afterAll(() => close())

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const app = buildTestApp(db)
    const response = await app.inject({ method: 'GET', url: '/api/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    await app.close()
  })

  it('returns a JSON error for unknown routes', async () => {
    const app = buildTestApp(db)
    const response = await app.inject({ method: 'GET', url: '/api/nope' })
    expect(response.statusCode).toBe(404)
    await app.close()
  })
})
