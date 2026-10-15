// Reborn's Village Elder "Change Village" (reborn-windows-M-Z-hud.md "Village Elder"): only in
// Angel City, 50,000 Stone, `changeVillage {village: <village scene id>}`.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters } from '../../db/schema.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

const ANGEL_CITY = 161

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  client = new Client(app)
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
  characterId = created.json().character.id
})
afterEach(() => app.close())
afterAll(() => close())

const set = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const stored = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const change = (village: unknown) => client.post('/api/game/change-village', { village })

describe('change village (Village Elder, Angel City)', () => {
  it.each([
    { village: 121, nation: 1 },
    { village: 131, nation: 4 },
    { village: 141, nation: 3 },
    { village: 151, nation: 2 },
  ])('moves a Fire ninja to the village of scene $village for 50,000 Stone', async (row) => {
    await set({ sceneId: ANGEL_CITY, stone: 60_000 })
    const response = await change(row.village)
    expect(response.statusCode).toBe(200)
    expect(response.json().character).toMatchObject({
      nation: row.nation,
      stone: 10_000,
      sceneId: ANGEL_CITY,
    })
    expect(await stored()).toMatchObject({ nation: row.nation, stone: 10_000 })
  })

  it('is only offered in Angel City', async () => {
    await set({ sceneId: 111, stone: 60_000 })
    const response = await change(121)
    expect(response.json().error.code).toBe('not_here')
    expect(await stored()).toMatchObject({ nation: 0, stone: 60_000 })
  })

  it('needs 50,000 Stone', async () => {
    await set({ sceneId: ANGEL_CITY, stone: 49_999 })
    const response = await change(121)
    expect(response.json().error).toMatchObject({
      code: 'no_stone',
      message: 'You need 50,000 stones.',
    })
    expect(await stored()).toMatchObject({ nation: 0, stone: 49_999 })
  })

  it('refuses the village the ninja already belongs to', async () => {
    await set({ sceneId: ANGEL_CITY, stone: 60_000 })
    expect((await change(111)).json().error.code).toBe('same_village')
    expect((await stored()).stone).toBe(60_000)
  })

  it.each([2101, ANGEL_CITY, 'Water'])('refuses %s, which is not a village', async (village) => {
    await set({ sceneId: ANGEL_CITY, stone: 60_000 })
    expect((await change(village)).statusCode).toBe(400)
    expect(await stored()).toMatchObject({ nation: 0, stone: 60_000 })
  })

  it('opens the new village to the ninja and closes the old one', async () => {
    await set({ sceneId: ANGEL_CITY, stone: 60_000, level: 60 })
    await change(121)
    expect((await client.post('/api/game/travel', { sceneId: 2201, via: 'map' })).statusCode).toBe(
      200,
    )
    const refused = await client.post('/api/game/travel', { sceneId: 2101, via: 'map' })
    expect(refused.json().error.code).toBe('other_village')
  })
})
