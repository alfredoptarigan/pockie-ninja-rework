import Fastify from 'fastify'

export function buildApp() {
  const app = Fastify({ logger: false })

  app.get('/api/health', async () => ({ ok: true }))

  return app
}
