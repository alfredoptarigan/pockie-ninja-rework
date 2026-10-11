// Drops every table and re-applies all migrations. Refuses to run in production.
import { runMigrations } from '../src/db/migrate.js'
import { loadEnv } from '../src/env.js'

const env = loadEnv()
if (env.NODE_ENV === 'production') throw new Error('db:reset is disabled in production')

await runMigrations(env.DATABASE_URL, { reset: true })
console.log('Database reset and migrated')
