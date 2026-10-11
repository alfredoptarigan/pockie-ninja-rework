import { runMigrations } from '../src/db/migrate.js'

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/pockie_remastered_test'
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to reset a non-test database: ${url}`)
  }
  await runMigrations(url, { reset: true })
}
