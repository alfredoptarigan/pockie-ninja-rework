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
  // Clothing 3: Ggio Vega, male, sharp (Reborn). Starts in the Fire Village (111).
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
  await db.insert(inventoryItems).values({ characterId, itemId: 'i260100', equippedSlot: 'Weapon' })
}

describe('GET /api/game/scene', () => {
  it('describes the village with its NPCs and no monsters', async () => {
    const scene = (await client.get('/api/game/scene')).json()
    expect(scene).toMatchObject({ sceneId: 111, nameKey: 'lg_Scene_BackGround_111', monsters: [] })
    expect(scene.npcs.map((n: { id: string }) => n.id)).toContain('n11001')
    expect(scene.links).toEqual([171])
  })

  it('records every scene the ninja has entered (ScenesEntered) for the world map', async () => {
    // The home village counts from the first look, like SetScenePass on login.
    expect((await client.get('/api/game/scene')).json().visitedScenes).toEqual([111])

    await goToForgeHighlandsWithFists()
    expect((await client.get('/api/game/scene')).json().visitedScenes).toEqual([111, 2101])
    // Coming back adds nothing twice.
    expect((await client.get('/api/game/scene')).json().visitedScenes).toEqual([111, 2101])
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId))
    expect(row!.scenesEntered).toEqual([111, 2101])
  })

  it('lists the field monsters, hiding normal monsters more than 5 levels above the player', async () => {
    await goToForgeHighlandsWithFists()
    const scene = (await client.get('/api/game/scene')).json()
    expect(scene.monsters).toMatchObject([
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
    expect(response.json().error).toMatchObject({
      code: 'no_hp',
      message: 'You were defeated. Revive before you fight again.',
    })
  })

  it('gives nothing for a lost fight and leaves the ninja defeated on 0 HP', async () => {
    await db.update(characters).set({ sceneId: 2101 }).where(eq(characters.id, characterId))
    // The task boss needs one of its quests (n32002 TaskID 10014;...).
    await db.insert(characterQuests).values({ characterId, taskId: 10014, progress: [0] })
    // No weapon: attack 1 cannot pierce the boss's defence.
    const body = (await client.post('/api/game/fight', { monsterId: 'n32002' })).json()
    expect(body.won).toBe(false)
    expect(body.rewards).toEqual({ exp: 0, stone: 0, items: [], levelsGained: 0 })
    // FightSystem saves the fight HP (0) and StateSystem marks the player dead until revived.
    expect(body.character.hp).toBe(0)
    const again = await client.post('/api/game/fight', { monsterId: 'n33017' })
    expect(again.json().error.code).toBe('no_hp')
  })
})

describe('first fights after the Fire Village tutorial', () => {
  const FIGHTS = 20
  const MIN_WINS = 18

  it('beats the Sunflower almost every time with the newbie sharp weapon', async () => {
    // 90000-90003: talk to the Elder, open the newbie pack, equip the sharp weapon, talk again.
    await client.post('/api/game/npcs/n11001/talk')
    const bag = async () => (await client.get('/api/game/inventory')).json().items
    const pack = (await bag()).find((i: { itemId: string }) => i.itemId === 'i159104')
    await client.post(`/api/game/items/${pack.id}/use`)
    await client.post('/api/game/quests/90002/accept')
    const fists = (await bag()).find((i: { itemId: string }) => i.itemId === 'i260100')
    expect((await client.post(`/api/game/items/${fists.id}/equip`)).statusCode).toBe(200)
    await client.post('/api/game/quests/90003/accept')
    await client.post('/api/game/npcs/n11001/talk')
    expect((await client.post('/api/game/travel', { sceneId: 2101 })).statusCode).toBe(200)

    let wins = 0
    for (let fight = 0; fight < FIGHTS; fight++) {
      // Fresh HP and level 1 each time, so every fight is a brand-new ninja's first fight.
      await db
        .update(characters)
        .set({ hp: 220, level: 1, exp: 0 })
        .where(eq(characters.id, characterId))
      const body = (await client.post('/api/game/fight', { monsterId: 'n33017' })).json()
      if (body.won) wins++
    }
    expect(wins).toBeGreaterThanOrEqual(MIN_WINS)
  })
})
