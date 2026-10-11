import { buildApp } from './app.js'
import { createDb } from './db/client.js'
import { loadEnv } from './env.js'

const env = loadEnv()
const { db, close } = createDb(env.DATABASE_URL)
const app = buildApp({ env, db, logger: true })

app.addHook('onClose', close)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close())
}

app.listen({ port: env.PORT, host: env.HOST }).catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
