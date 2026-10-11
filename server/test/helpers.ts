import { sql } from 'drizzle-orm'
import { createDb } from '../src/db/client.js'
import { loadEnv } from '../src/env.js'

export function createTestDb() {
  return createDb(loadEnv().DATABASE_URL)
}

export async function truncateAll(db: ReturnType<typeof createTestDb>['db']) {
  await db.execute(
    sql`truncate table sessions, users, posts, lore_chapters, faq_items restart identity cascade`,
  )
}
