import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Like the other server scripts, read the repository's .env: TEST_DATABASE_URL may need a
// password. Variables already set in the environment win.
const envFile = new URL('../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/pockie_remastered_test'

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl },
    globalSetup: ['./test/global-setup.ts'],
    // All files share one test database.
    fileParallelism: false,
    coverage: { include: ['src/**'], exclude: ['src/index.ts'] },
  },
})
