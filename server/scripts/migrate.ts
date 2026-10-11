import { runMigrations } from '../src/db/migrate.js'
import { loadEnv } from '../src/env.js'

await runMigrations(loadEnv().DATABASE_URL)
console.log('Migrations applied')
