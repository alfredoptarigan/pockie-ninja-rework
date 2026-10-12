import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterQuests, characters, inventoryItems } from '../../db/schema.js'

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
  // Clothing 3: Ggio Vega, male, fists. Starts in the Fire Village (111).
  const response = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  characterId = response.json().character.id
})
afterEach(() => app.close())
afterAll(() => close())

async function goToForgeHighlandsWithFists() {
  await db.update(characters).set({ sceneId: 2101 }).where(eq(characters.id, characterId))
  await db.insert(inventoryItems).values({ characterId, itemId: 'i270100', equippedSlot: 'Weapon' })
}

describe('GET /api/game/scene', () => {
  it('describes the village with its NPCs and no monsters', async () => {
    const scene = (await client.get('/api/game/scene')).json()
    expect(scene).toMatchObject({ sceneId: 111, nameKey: 'lg_Scene_BackGround_111', monsters: [] })
    expect(scene.npcs.map((n: { id: string }) => n.id)).toContain('n11001')
    expect(scene.links).toEqual([171])
  })

  it('lists the field monsters, hiding normal monsters more than 5 levels above the player', async () => {
    await goToForgeHighlandsWithFists()
    const scene = (await client.get('/api/game/scene')).json()
    expect(scene.monsters).toEqual([
      { id: 'n33017', nameKey: 'lg_name_n33017', level: 2 },
      { id: 'n33006', nameKey: 'lg_name_n33006', level: 4 },
      { id: 'n33026', nameKey: 'lg_name_n33026', level: 6 },
      { id: 'n32002', nameKey: 'lg_name_n32002', level: 10 },
    ])
    expect(scene.links).toEqual([2103, 2102])
  })
})

describe('POST /api/game/fight', () => {
  it('fights a Sunflower, wins, and grants its EXP and Stone', async () => {
    await goToForgeHighlandsWithFists()
    const response = await client.post('/api/game/fight', { monsterId: 'n33017' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.won).toBe(true)
    expect(body.replay.events.at(-1)).toMatchObject({ event: 20, actor: 1 })
    expect(body.rewards.exp).toBe(8)
    expect(body.rewards.stone).toBeGreaterThanOrEqual(8)
    expect(body.rewards.stone).toBeLessThanOrEqual(9)
    expect(body.character).toMatchObject({ exp: 8, stone: body.rewards.stone })
    expect(body.character.hp).toBe(body.replay.fighters[0].hp)
  })

  it('counts the kill for an active kill quest in that scene', async () => {
    await goToForgeHighlandsWithFists()
    // Quest 10001: defeat 2 Sunflowers in 2101.
    await db.insert(characterQuests).values({ characterId, taskId: 10001, progress: [0] })

    await client.post('/api/game/fight', { monsterId: 'n33017' })
    await client.post('/api/game/fight', { monsterId: 'n33017' })

    const [quest] = await db.select().from(characterQuests).where(eq(characterQuests.taskId, 10001))
    expect(quest).toMatchObject({ progress: [2], state: 1 })
  })

  it('only allows monsters listed in the current scene', async () => {
    const response = await client.post('/api/game/fight', { monsterId: 'n33017' })
    expect(response.statusCode).toBe(400)
  })

  it('refuses to fight with no HP left', async () => {
    await goToForgeHighlandsWithFists()
    await db.update(characters).set({ hp: 0 }).where(eq(characters.id, characterId))
    const response = await client.post('/api/game/fight', { monsterId: 'n33017' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('no_hp')
  })

  it('gives nothing for a lost fight and leaves the ninja on 1 HP', async () => {
    await db.update(characters).set({ sceneId: 2101 }).where(eq(characters.id, characterId))
    // No weapon: attack 1 cannot pierce the boss's defence.
    const body = (await client.post('/api/game/fight', { monsterId: 'n32002' })).json()
    expect(body.won).toBe(false)
    expect(body.rewards).toEqual({ exp: 0, stone: 0, items: [], levelsGained: 0 })
    expect(body.character.hp).toBe(1)
  })
})
