// Shared setup of the rankings API tests: the app (app.ts registers the rankings
// routes), one logged-in ninja and a fast way to add many ranked ninjas.
import { eq } from 'drizzle-orm'
import { buildTestApp, Client, type createTestDb } from '../../../test/helpers.js'
import { characters, users } from '../../db/schema.js'

type TestDb = ReturnType<typeof createTestDb>['db']
export type CharacterValues = Partial<typeof characters.$inferInsert>

export async function setUpRankings(db: TestDb) {
  const app = buildTestApp(db)
  const client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Player_one',
    email: 'player@example.com',
    password: 'believe-it',
  })
  const created = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const me: string = created.json().character.id
  const row = async (id = me) =>
    (await db.select().from(characters).where(eq(characters.id, id)))[0]!
  const set = (values: CharacterValues, id = me) =>
    db.update(characters).set(values).where(eq(characters.id, id))
  const template = await row()

  let made = 0
  /** Inserts ninjas `Rank_<n>` (users included); returns their ids in order. */
  const addNinjas = async (list: CharacterValues[]) => {
    if (list.length === 0) return []
    const names = list.map((_, i) => `Rank_${made + i}`)
    made += list.length
    const userRows = await db
      .insert(users)
      .values(
        names.map((name) => ({
          username: name,
          email: `${name.toLowerCase()}@example.com`,
          passwordHash: 'x',
        })),
      )
      .returning({ id: users.id })
    const rows = await db
      .insert(characters)
      .values(
        list.map((values, i) => ({
          userId: userRows[i]!.id,
          name: names[i]!,
          gender: 0,
          nation: 1,
          clothing: template.clothing,
          sceneId: template.sceneId,
          avatarId: template.avatarId,
          hp: 1,
          mp: 1,
          ...values,
        })),
      )
      .returning({ id: characters.id })
    return rows.map((r) => r.id)
  }
  return { app, client, me, row, set, addNinjas }
}

export const errorCode = (response: { json: () => { error?: { code: string } } }) =>
  response.json().error?.code
