import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, createTestDb, truncateAll } from '../../../test/helpers.js'
import { faqItems, loreChapters, posts } from '../../db/schema.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
})
afterEach(() => app.close())
afterAll(() => close())

const get = (url: string) => app.inject({ method: 'GET', url })

function post(n: number, kind: 'news' | 'update' | 'event', daysAgo: number) {
  return {
    kind,
    slug: `post-${n}`,
    title: `Post ${n}`,
    summary: `Summary ${n}`,
    body: `Body ${n}`,
    publishedAt: new Date(Date.now() - daysAgo * 86_400_000),
  }
}

describe('GET /api/posts', () => {
  it('returns an empty page when there are no posts', async () => {
    const response = await get('/api/posts')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ items: [], nextCursor: null })
  })

  it('pages through posts newest first with a cursor', async () => {
    await db.insert(posts).values([1, 2, 3, 4, 5].map((n) => post(n, 'news', n)))

    const first = (await get('/api/posts?limit=2')).json()
    expect(first.items.map((p: { slug: string }) => p.slug)).toEqual(['post-1', 'post-2'])
    expect(first.nextCursor).toEqual(expect.any(String))

    const second = (await get(`/api/posts?limit=2&cursor=${first.nextCursor}`)).json()
    expect(second.items.map((p: { slug: string }) => p.slug)).toEqual(['post-3', 'post-4'])

    const last = (await get(`/api/posts?limit=2&cursor=${second.nextCursor}`)).json()
    expect(last.items.map((p: { slug: string }) => p.slug)).toEqual(['post-5'])
    expect(last.nextCursor).toBeNull()
  })

  it('filters by kind', async () => {
    await db
      .insert(posts)
      .values([post(1, 'news', 1), post(2, 'event', 2), post(3, 'update', 3), post(4, 'event', 4)])
    const response = (await get('/api/posts?kind=event')).json()
    expect(response.items.map((p: { slug: string }) => p.slug)).toEqual(['post-2', 'post-4'])
  })

  it('hides posts scheduled for the future', async () => {
    await db.insert(posts).values([post(1, 'news', 1), post(2, 'news', -1)])
    const response = (await get('/api/posts')).json()
    expect(response.items).toHaveLength(1)
  })

  it('serializes dates as ISO strings', async () => {
    await db.insert(posts).values(post(1, 'news', 1))
    const [item] = (await get('/api/posts')).json().items
    expect(item.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it.each(['kind=gossip', 'limit=0', 'limit=100', 'cursor=garbage'])(
    'rejects an invalid query (%s)',
    async (query) => {
      const response = await get(`/api/posts?${query}`)
      expect(response.statusCode).toBe(400)
    },
  )
})

describe('GET /api/lore', () => {
  it('returns chapters in story order', async () => {
    await db.insert(loreChapters).values([
      { position: 2, title: 'Second', body: 'b' },
      { position: 1, title: 'First', body: 'a' },
    ])
    const response = (await get('/api/lore')).json()
    expect(response.items.map((c: { title: string }) => c.title)).toEqual(['First', 'Second'])
  })

  it('returns an empty list when nothing is seeded', async () => {
    expect((await get('/api/lore')).json()).toEqual({ items: [] })
  })
})

describe('GET /api/faq', () => {
  it('returns questions in order', async () => {
    await db.insert(faqItems).values([
      { position: 2, question: 'Q2', answer: 'A2' },
      { position: 1, question: 'Q1', answer: 'A1' },
    ])
    const response = (await get('/api/faq')).json()
    expect(response.items.map((f: { question: string }) => f.question)).toEqual(['Q1', 'Q2'])
  })
})

describe('GET /api/posts cursor validation', () => {
  const cursor = (value: string) => Buffer.from(value).toString('base64url')

  it.each([
    [
      'an out-of-range date',
      `+275760-09-13T00:00:00.000Z|${'0'.repeat(8)}-0000-7000-8000-${'0'.repeat(12)}`,
    ],
    ['a malformed id', `2026-10-10T09:00:00.000Z|${'-'.repeat(36)}`],
  ])('returns 400 for %s', async (_label, value) => {
    const response = await get(`/api/posts?cursor=${cursor(value)}`)
    expect(response.statusCode).toBe(400)
  })
})
