import { defineConfig } from 'vitest/config'

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
