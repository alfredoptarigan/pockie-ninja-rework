// Replaces all site content (posts, lore, FAQ) with scripts/seed-data.ts. Accounts are untouched.
import { createDb } from '../src/db/client.js'
import { faqItems, loreChapters, posts } from '../src/db/schema.js'
import { loadEnv } from '../src/env.js'
import { seedFaq, seedLore, seedPosts } from './seed-data.js'

const { db, close } = createDb(loadEnv().DATABASE_URL)
try {
  await db.transaction(async (tx) => {
    await tx.delete(posts)
    await tx.delete(loreChapters)
    await tx.delete(faqItems)
    await tx
      .insert(posts)
      .values(seedPosts.map((post) => ({ ...post, publishedAt: new Date(post.publishedAt) })))
    await tx.insert(loreChapters).values(seedLore)
    await tx.insert(faqItems).values(seedFaq)
  })
  console.log(
    `Seeded ${seedPosts.length} posts, ${seedLore.length} lore chapters, ${seedFaq.length} FAQ items`,
  )
} finally {
  await close()
}
