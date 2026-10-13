// HP/MP pouches (RoleUseSystem), derived stats in GET /character, available quests and the
// revive terms of GET /scene.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { saveCharacterProgress } from '../../game/progress.js'
import { LEARNABLE_NINJUTSU, ELEMENT_PASSIVES } from '@pockie/game-core'
import { levels } from '../../game/data.js'
import {
  characters,
  inventoryItems,
  characterSkills,
  characterSkillState,
} from '../../db/schema.js'

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
  // Clothing 3: Ggio Vega (fists), Fire Village; level 1 max HP 220.
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

const learned = () =>
  db.select().from(characterSkills).where(eq(characterSkills.characterId, characterId))

describe('skill learning persistence', () => {
  it('starts empty and catches up an existing character once, even across concurrent reads', async () => {
    expect((await client.get('/api/game/skills')).json().learned).toEqual([])
    await db.update(characters).set({ level: 10 }).where(eq(characters.id, characterId))
    const [first, second] = await Promise.all([
      client.get('/api/game/skills'),
      client.get('/api/game/skills'),
    ])
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(first.json().learned).toEqual(second.json().learned)
    expect(await learned()).toHaveLength(10)
    expect((await learned()).filter((row) => ELEMENT_PASSIVES.includes(row.skillId))).toHaveLength(
      1,
    )
    expect((await db.select().from(characterSkillState))[0]!.learnedThrough).toBe(10)
  })
  it('learns for every crossed level in the shared progression write and never duplicates rewards', async () => {
    await db.transaction((tx) => saveCharacterProgress(tx, characterId, { level: 21 }))
    expect(await learned()).toHaveLength(22)
    await db.transaction((tx) => saveCharacterProgress(tx, characterId, { level: 21, exp: 1 }))
    expect(await learned()).toHaveLength(22)
  })
  it('learns automatically after a field-fight level-up', async () => {
    await db
      .update(characters)
      .set({ sceneId: 2101, exp: levels().levelexp['2']! - 1 })
      .where(eq(characters.id, characterId))
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId: 'i270100', equippedSlot: 'Weapon' })
    const fight = await client.post('/api/game/fight', { monsterId: 'n33017' })
    expect(fight.statusCode).toBe(200)
    expect(fight.json().won).toBe(true)
    expect(fight.json().character.level).toBeGreaterThan(1)
    const skills = await learned()
    expect(skills).toHaveLength(fight.json().character.level - 1)
    expect(skills.every((row) => LEARNABLE_NINJUTSU.includes(row.skillId))).toBe(true)
  })
  it('requires authentication and never offers a client-controlled learning endpoint', async () => {
    expect((await new Client(app).get('/api/game/skills')).statusCode).toBe(401)
    expect((await client.post('/api/game/skills/learn', { skillId: 1802 })).statusCode).toBe(404)
    expect(await learned()).toEqual([])
  })
})
