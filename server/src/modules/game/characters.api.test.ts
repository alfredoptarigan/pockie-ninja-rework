import { deriveStats } from '@pockie/game-core'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterQuests, characters } from '../../db/schema.js'
import { avatarStats } from '../../game/data.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client

async function signedIn(username = 'Player_one') {
  const c = new Client(app)
  await c.post('/api/auth/register', {
    username,
    email: `${username.toLowerCase()}@example.com`,
    password: 'believe-it',
  })
  return c
}

// Row 4 of the creation table: clothing 3 (Ggio Vega), male, sharp (Reborn).
const ggio = { name: 'Ninja_01', gender: 0, clothing: 3, nation: 0 }

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  client = await signedIn()
})
afterEach(() => app.close())
afterAll(() => close())

describe('GET /api/game/creation', () => {
  it('requires a session', async () => {
    const response = await new Client(app).get('/api/game/creation')
    expect(response.statusCode).toBe(401)
  })

  it('offers the 10 original starting outfits, five villages and a suggested village', async () => {
    const response = await client.get('/api/game/creation')
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.outfits).toHaveLength(10)
    // Weapon class 2: Reborn makes clothing 39 Sharp (2011: fists).
    expect(body.outfits[0]).toEqual({ clothing: 39, gender: 1, weaponClass: 2, boost: 'stamina' })
    // CreatRoleBase.SetRoleSelectDes: the strictly highest base stat, else stamina (16 ties).
    const boost = (clothing: number) =>
      body.outfits.find((o: { clothing: number }) => o.clothing === clothing).boost
    expect([boost(3), boost(9), boost(16)]).toEqual(['agility', 'strength', 'stamina'])
    expect(body.villages.map((v: { nation: number }) => v.nation)).toEqual([0, 1, 2, 3, 4])
    expect(body.villages[4]).toEqual({ nation: 4, sceneId: 131 })
    expect(body.suggestedNation).toBe(0)
  })

  it('suggests the village with the fewest ninjas', async () => {
    await client.post('/api/game/characters', ggio)
    const other = await signedIn('Player_two')
    expect((await other.get('/api/game/creation')).json().suggestedNation).toBe(1)
  })
})

describe('POST /api/game/characters', () => {
  it('creates a level 1 ninja in its village with full HP and the first tutorial quest', async () => {
    const response = await client.post('/api/game/characters', { ...ggio, nation: 4 })

    expect(response.statusCode).toBe(201)
    const stats = deriveStats(avatarStats(3), 1)
    expect(response.json().character).toMatchObject({
      name: 'Ninja_01',
      level: 1,
      nation: 4,
      sceneId: 131,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      stone: 0,
    })
    const quests = await db.select().from(characterQuests)
    expect(quests).toMatchObject([{ taskId: 92000, state: 0, progress: [0] }])
  })

  it('returns the character afterwards', async () => {
    await client.post('/api/game/characters', ggio)
    const response = await client.get('/api/game/character')
    expect(response.json().character.name).toBe('Ninja_01')
  })

  it('exposes the VIP expiry (null without VIP)', async () => {
    await client.post('/api/game/characters', ggio)
    expect((await client.get('/api/game/character')).json().character.vipUntil).toBeNull()
    await db.update(characters).set({ vipUntil: new Date('2026-11-11T00:00:00Z') })
    expect((await client.get('/api/game/character')).json().character.vipUntil).toBe(
      '2026-11-11T00:00:00.000Z',
    )
  })

  it('returns 404 before a character exists', async () => {
    expect((await client.get('/api/game/character')).statusCode).toBe(404)
  })

  it('allows only one ninja per account', async () => {
    await client.post('/api/game/characters', ggio)
    const response = await client.post('/api/game/characters', { ...ggio, name: 'Ninja_02' })
    expect(response.statusCode).toBe(409)
    expect(await db.select().from(characters)).toHaveLength(1)
  })

  it('rejects a name another ninja already uses, in any casing', async () => {
    await client.post('/api/game/characters', ggio)
    const other = await signedIn('Player_two')
    const response = await other.post('/api/game/characters', { ...ggio, name: 'NINJA_01' })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.fields).toHaveProperty('name')
  })

  it.each([
    ['name', { name: 'no spaces!' }],
    ['clothing', { clothing: 45 }], // Naruto is not a starting outfit
    ['clothing', { gender: 1 }], // clothing 3 is a male outfit
    ['nation', { nation: 5 }],
  ])('rejects an invalid %s', async (field, override) => {
    const response = await client.post('/api/game/characters', { ...ggio, ...override })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.fields).toHaveProperty(field)
  })
})
