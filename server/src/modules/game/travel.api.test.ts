import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterQuests, characters } from '../../db/schema.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

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
const travel = (body: object) => client.post('/api/game/travel', body)

describe('link travel (scene exits, CanSwitchScene)', () => {
  // scenequeue.ini [2601]: 2604, 2602 and one exit to each village's xx02 field.
  const neighbours = [
    { sceneId: 2604, nation: 0 },
    { sceneId: 2602, nation: 0 },
    { sceneId: 2102, nation: 0 },
    { sceneId: 2202, nation: 1 },
    { sceneId: 2302, nation: 4 },
    { sceneId: 2402, nation: 3 },
    { sceneId: 2502, nation: 2 },
  ]

  it.each(neighbours)('goes from 2601 to its neighbour $sceneId', async ({ sceneId, nation }) => {
    await set({ sceneId: 2601, level: 60, nation })
    const response = await travel({ sceneId, via: 'link' })
    expect(response.statusCode).toBe(200)
    expect(response.json().character.sceneId).toBe(sceneId)
  })

  it('refuses a scene that is not an exit of this one', async () => {
    await set({ sceneId: 2601, level: 60 })
    // 2603 is a world map place, but 2601 has no exit to it.
    expect((await travel({ sceneId: 2603, via: 'link' })).json().error.code).toBe('no_route')
    expect((await travel({ sceneId: 2603, via: 'map' })).statusCode).toBe(200)
  })

  it('refuses another village’s field behind an exit', async () => {
    await set({ sceneId: 2601, level: 60 })
    const response = await travel({ sceneId: 2202, via: 'link' })
    expect(response.json().error).toMatchObject({ code: 'other_village' })
  })

  it('checks the scene level on exits too', async () => {
    await set({ sceneId: 2601, level: 20 })
    expect((await travel({ sceneId: 2602, via: 'link' })).json().error.code).toBe('too_low')
  })

  it('records the scenes entered', async () => {
    await set({ sceneId: 2601, level: 60 })
    await travel({ sceneId: 2602, via: 'link' })
    const scene = (await client.get('/api/game/scene')).json()
    expect(scene.visitedScenes).toContain(2602)
  })
})

describe('map travel (CanChangeScene)', () => {
  it('refuses another village’s field unless a held quest leads there (ExceptTaskScene)', async () => {
    await set({ sceneId: 2601, level: 60 })
    // 2403 belongs to the Wind village.
    expect((await travel({ sceneId: 2403 })).json().error.code).toBe('other_village')

    // Fire main quest 10092 visits 2403.
    await db.insert(characterQuests).values({ characterId, taskId: 10092, progress: [0] })
    const allowed = await travel({ sceneId: 2403 })
    expect(allowed.statusCode).toBe(200)
    expect(allowed.json().character.sceneId).toBe(2403)
  })

  it('does not count a finished quest for the village check', async () => {
    await set({ sceneId: 2601, level: 60 })
    await db.insert(characterQuests).values({ characterId, taskId: 10092, progress: [1], state: 2 })
    expect((await travel({ sceneId: 2403 })).json().error.code).toBe('other_village')
  })

  it('gates places by RequireLevel', async () => {
    await set({ sceneId: 2601, level: 45 })
    const response = await travel({ sceneId: 2701 })
    expect(response.json().error).toMatchObject({
      code: 'too_low',
      message: 'You need level 46 to enter that area.',
    })
    await set({ level: 46 })
    expect((await travel({ sceneId: 2701 })).statusCode).toBe(200)
  })

  it('reaches Hidden Rain Village, which has no map button but a switch rule', async () => {
    await set({ sceneId: 2601, level: 90 })
    expect((await travel({ sceneId: 2804 })).statusCode).toBe(200)
  })
})

describe('go home and go out (ToScene)', () => {
  it('lands in Crossroads when going home from Angel City (ToScene 2601)', async () => {
    await set({ sceneId: 161, level: 20 })
    const response = await travel({ via: 'home' })
    expect(response.statusCode).toBe(200)
    expect(response.json().character.sceneId).toBe(2601)
  })

  it('goes to the home village from a field without ToScene', async () => {
    await set({ sceneId: 2602, level: 40 })
    expect((await travel({ via: 'home' })).json().character.sceneId).toBe(111)
  })

  it('goes out of the village to its first field', async () => {
    expect((await travel({ via: 'out' })).json().character.sceneId).toBe(2101)
  })

  it('refuses while defeated', async () => {
    await set({ sceneId: 161, hp: 0 })
    expect((await travel({ via: 'home' })).json().error.code).toBe('no_hp')
  })
})
