// Shared setup of the gates API tests: one ninja in Demon City with a weapon and full HP.
import { eq } from 'drizzle-orm'
import { buildTestApp, Client, type createTestDb } from '../../../test/helpers.js'
import { characters, inventoryItems } from '../../db/schema.js'

type TestDb = ReturnType<typeof createTestDb>['db']

export async function setUpNinja(db: TestDb) {
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
  const characterId: string = created.json().character.id

  const set = (values: Partial<typeof characters.$inferInsert>) =>
    db.update(characters).set(values).where(eq(characters.id, characterId))
  const row = async () =>
    (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
  const give = (itemId: string, values: Partial<typeof inventoryItems.$inferInsert> = {}) =>
    db
      .insert(inventoryItems)
      .values({ characterId, itemId, ...values })
      .returning()
      .then((rows) => rows[0]!)
  const bag = (itemId: string) =>
    db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, characterId))
      .then((rows) => rows.filter((r) => r.itemId === itemId && !r.equippedSlot))
  /** Sets level and scene, then refills HP and MP to the maximum with gear. */
  const ready = async (level: number, sceneId = 171) => {
    await set({ level, sceneId })
    const { character } = (await client.get('/api/game/character')).json()
    await set({ hp: character.maxHp, mp: character.maxMp })
  }
  return { app, client, characterId, set, row, give, bag, ready }
}

export const errorCode = (response: { json: () => { error?: { code: string } } }) =>
  response.json().error?.code
export const today = () => new Date().toISOString().slice(0, 10)
