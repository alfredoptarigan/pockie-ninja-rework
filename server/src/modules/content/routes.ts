import { postsQuerySchema, type FaqItem, type LoreChapter, type PostsPage } from '@pockie/shared'
import { and, asc, desc, eq, lte, sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { faqItems, loreChapters, posts } from '../../db/schema.js'
import { HttpError } from '../../http.js'

// Cursor = base64url("<publishedAt ISO>|<id>") of the last item on the previous page.
const encodeCursor = (publishedAt: Date, id: string) =>
  Buffer.from(`${publishedAt.toISOString()}|${id}`).toString('base64url')

function decodeCursor(cursor: string) {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|')
  const publishedAt = new Date(iso ?? '')
  const validId = /^[0-9a-f-]{36}$/.test(id ?? '')
  if (Number.isNaN(publishedAt.getTime()) || !validId) {
    throw new HttpError(400, 'bad_cursor', 'This page link is no longer valid.')
  }
  return { publishedAt, id: id as string }
}

export async function contentRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/posts', async (request): Promise<PostsPage> => {
    const { kind, cursor, limit } = postsQuerySchema.parse(request.query)

    const filters: SQL[] = [lte(posts.publishedAt, sql`now()`)]
    if (kind) filters.push(eq(posts.kind, kind))
    if (cursor) {
      const after = decodeCursor(cursor)
      filters.push(
        sql`(${posts.publishedAt}, ${posts.id}) < (${after.publishedAt.toISOString()}::timestamptz, ${after.id}::uuid)`,
      )
    }

    const rows = await db
      .select()
      .from(posts)
      .where(and(...filters))
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      .limit(limit + 1)

    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return {
      items: page.map((row) => ({ ...row, publishedAt: row.publishedAt.toISOString() })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.publishedAt, last.id) : null,
    }
  })

  app.get('/lore', async (): Promise<{ items: LoreChapter[] }> => ({
    items: await db.select().from(loreChapters).orderBy(asc(loreChapters.position)),
  }))

  app.get('/faq', async (): Promise<{ items: FaqItem[] }> => ({
    items: await db.select().from(faqItems).orderBy(asc(faqItems.position)),
  }))
}
