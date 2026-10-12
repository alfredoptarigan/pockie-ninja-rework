import { defineConfig, devices } from '@playwright/test'

// Ports default to the `pnpm dev` ones; set E2E_PORT / E2E_API_PORT when another app holds them.
const clientPort = Number(process.env.E2E_PORT ?? 5173)
const apiPort = Number(process.env.E2E_API_PORT ?? 3000)
const baseURL = `http://localhost:${clientPort}`
// Never reuse a server by default: whatever listens on the port may be another app. Set
// E2E_REUSE=1 to run against a `pnpm dev` you started yourself on the same ports.
const reuseExistingServer = !process.env.CI && Boolean(process.env.E2E_REUSE)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @pockie/server dev',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      env: { API_PORT: String(apiPort), APP_ORIGIN: baseURL },
      reuseExistingServer,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @pockie/client exec vite --port ${clientPort} --strictPort`,
      url: baseURL,
      // The Vite proxy sends /api and /socket.io to this port (client/vite.config.ts).
      env: { API_PORT: String(apiPort) },
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
})
