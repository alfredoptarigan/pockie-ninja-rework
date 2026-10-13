// Shared setup of the team API tests: an app with the team routes and ninjas made on demand.
import { eq } from 'drizzle-orm'
import { buildTestApp, Client, type createTestDb } from '../../../test/helpers.js'
import { characters, users } from '../../db/schema.js'
import { createSession } from '../auth/sessions.js'
import { teamRoutes } from './routes.js'

type TestDb = ReturnType<typeof createTestDb>['db']

/** Crossroads (2601): a neutral field where teams may form, with a team stone. */
export const FIELD = 2601

export function setUpTeams(db: TestDb) {
  const app = buildTestApp(db)
  // The coordinator registers this in app.ts; the tests add it themselves until then.
  void app.register(teamRoutes, { db, prefix: '/api/game/team' })

  async function ninja(n: number, { sceneId = FIELD, level = 20 } = {}) {
    const client = new Client(app)
    // A session straight in the database: registering hashes a password, which is slow.
    const [user] = await db
      .insert(users)
      .values({ username: `Player_${n}`, email: `player${n}@example.com`, passwordHash: 'x' })
      .returning()
    client.setCookie('pn_session', await createSession(db, user!.id, false))
    const name = `Ninja_${String(n).padStart(2, '0')}`
    const created = await client.post('/api/game/characters', {
      name,
      gender: 0,
      clothing: 3,
      nation: 0,
    })
    const id: string = created.json().character.id
    const set = (values: Partial<typeof characters.$inferInsert>) =>
      db.update(characters).set(values).where(eq(characters.id, id))
    const row = async () => (await db.select().from(characters).where(eq(characters.id, id)))[0]!
    await set({ sceneId, level })
    const team = () => client.get('/api/game/team')
    const post = (path: string, body: object = {}) => client.post(`/api/game/team/${path}`, body)
    return { client, id, name, set, row, team, post }
  }
  return { app, ninja }
}

export type TestNinja = Awaited<ReturnType<ReturnType<typeof setUpTeams>['ninja']>>

export const errorCode = (response: { json: () => { error?: { code: string } } }) =>
  response.json().error?.code

/** `host` invites `guest`, who accepts; returns the accept response. */
export async function join(host: TestNinja, guest: TestNinja) {
  const invited = await host.post('invite', { characterId: guest.id })
  if (invited.statusCode !== 200) throw new Error(invited.body)
  return guest.post(`prompts/${invited.json().prompt.promptId}/accept`)
}
