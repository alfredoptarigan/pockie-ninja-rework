import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export async function runMigrations(url: string, { reset = false } = {}) {
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    if (reset) {
      await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;')
      await client.unsafe('CREATE SCHEMA public;')
    }
    await migrate(drizzle(client), { migrationsFolder })
  } finally {
    await client.end()
  }
}
