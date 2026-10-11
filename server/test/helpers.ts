import { sql } from 'drizzle-orm'
import type { LightMyRequestResponse } from 'fastify'
import { buildApp } from '../src/app.js'
import { createDb, type Db } from '../src/db/client.js'
import { loadEnv } from '../src/env.js'

export function createTestDb() {
  return createDb(loadEnv().DATABASE_URL)
}

export async function truncateAll(db: Db) {
  await db.execute(
    sql`truncate table sessions, users, posts, lore_chapters, faq_items restart identity cascade`,
  )
}

export function buildTestApp(db: Db, env: Record<string, string> = {}) {
  return buildApp({ env: loadEnv({ ...process.env, ...env }), db })
}

type App = ReturnType<typeof buildTestApp>

/** Cookie jar for app.inject: keeps cookies between requests like a browser. */
export class Client {
  private cookies = new Map<string, string>()
  csrfToken = ''

  constructor(private readonly app: App) {}

  get cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  cookie(name: string) {
    return this.cookies.get(name)
  }

  setCookie(name: string, value: string) {
    this.cookies.set(name, value)
  }

  private store(response: LightMyRequestResponse) {
    for (const cookie of response.cookies) {
      const expired = cookie.maxAge === 0 || (cookie.expires && cookie.expires < new Date())
      if (expired) this.cookies.delete(cookie.name)
      else this.cookies.set(cookie.name, cookie.value)
    }
    return response
  }

  async get(url: string) {
    return this.store(
      await this.app.inject({ method: 'GET', url, headers: { cookie: this.cookieHeader } }),
    )
  }

  async fetchCsrf() {
    const response = await this.get('/api/auth/csrf')
    this.csrfToken = response.json<{ token: string }>().token
    return this.csrfToken
  }

  async post(url: string, payload?: object, headers: Record<string, string> = {}) {
    if (!this.csrfToken) await this.fetchCsrf()
    return this.store(
      await this.app.inject({
        method: 'POST',
        url,
        payload,
        headers: { cookie: this.cookieHeader, 'x-csrf-token': this.csrfToken, ...headers },
      }),
    )
  }
}
