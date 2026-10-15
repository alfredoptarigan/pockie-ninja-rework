import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters, inventoryItems } from '../../db/schema.js'

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
  // Clothing 3 (Ggio Vega) fights with sharp weapons (Reborn); Fire Village tutorial starts with quest 90000.
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

const quests = async () => (await client.get('/api/game/quests')).json().quests
const inventory = async () => (await client.get('/api/game/inventory')).json().items
const itemRow = async (itemId: string) =>
  (await inventory()).find((i: { itemId: string }) => i.itemId === itemId)

describe('Fire Village tutorial', () => {
  it('talk to the Village Elder → open the newbie pack → equip the weapon', async () => {
    // 90000: talk to n11001. Rookie quests complete at once and pay out.
    const talk = await client.post('/api/game/npcs/n11001/talk')
    expect(talk.statusCode).toBe(200)
    expect(talk.json().completed).toEqual([90000])
    expect(talk.json().character).toMatchObject({ exp: 5, stone: 100, giftCoupon: 10 })
    expect(await itemRow('i159104')).toMatchObject({ count: 1, bound: true })

    // 90001 (AutoAcceptTask = 1) is active: use the pack.
    expect(await quests()).toContainEqual(expect.objectContaining({ taskId: 90001, state: 0 }))
    // The step tells the client which item to use (rookie command 8888).
    const packQuest = (await quests()).find((q: { taskId: number }) => q.taskId === 90001)
    expect(packQuest.steps[0]).toMatchObject({ command: 'use', itemId: 'i159104' })
    const pack = await itemRow('i159104')
    const used = await client.post(`/api/game/items/${pack.id}/use`)
    expect(used.json().completed).toEqual([90001])
    expect(await itemRow('i159104')).toBeUndefined()
    // The pack holds all three newbie weapons; only the sharp one fits.
    expect(await itemRow('i270100')).toMatchObject({ fitsOutfit: false })
    const sharp = await itemRow('i260100')
    expect(sharp).toMatchObject({ fitsOutfit: true })

    // 90002 is not auto-accepted: accept it at the Elder, then equip the sharp weapon.
    expect((await client.post('/api/game/quests/90002/accept')).statusCode).toBe(200)
    const equipQuest = (await quests()).find((q: { taskId: number }) => q.taskId === 90002)
    expect(equipQuest.steps[0]).toMatchObject({ command: 'equip' })
    const equipped = await client.post(`/api/game/items/${sharp.id}/equip`)
    expect(equipped.json().completed).toEqual([90002])
    expect(await itemRow('i260100')).toMatchObject({ equippedSlot: 'Weapon' })
  })

  it('refuses quests whose previous quest is not done', async () => {
    const response = await client.post('/api/game/quests/90002/accept')
    expect(response.statusCode).toBe(400)
  })

  it('refuses to talk to NPCs from another scene', async () => {
    expect((await client.post('/api/game/npcs/n21001/talk')).statusCode).toBe(400)
  })
})

describe('items', () => {
  it('heals with a potion without going over max HP', async () => {
    await db.update(characters).set({ hp: 10 }).where(eq(characters.id, characterId))
    await db.insert(inventoryItems).values({ characterId, itemId: 'i160006', count: 2 })
    const potion = await itemRow('i160006')

    const body = (await client.post(`/api/game/items/${potion.id}/use`)).json()

    expect(body.character.hp).toBe(Math.min(160, body.character.maxHp))
    expect(await itemRow('i160006')).toMatchObject({ count: 1 })
  })

  it('refuses a weapon of another class', async () => {
    // i250100 is a blunt weapon; Ggio Vega fights with sharp weapons.
    await db.insert(inventoryItems).values({ characterId, itemId: 'i250100' })
    const bat = await itemRow('i250100')
    expect(bat.fitsOutfit).toBe(false)
    expect((await client.post(`/api/game/items/${bat.id}/equip`)).statusCode).toBe(400)
  })

  it('cannot touch another player’s items', async () => {
    const response = await client.post('/api/game/items/00000000-0000-7000-8000-000000000000/use')
    expect(response.statusCode).toBe(404)
  })
})

describe('POST /api/game/travel', () => {
  it('travels from the village to its first field', async () => {
    const response = await client.post('/api/game/travel', { sceneId: 2101 })
    expect(response.statusCode).toBe(200)
    expect(response.json().character.sceneId).toBe(2101)
  })

  it('refuses another nation’s field and scenes above the player’s level', async () => {
    expect((await client.post('/api/game/travel', { sceneId: 2201 })).statusCode).toBe(400)
    expect((await client.post('/api/game/travel', { sceneId: 171 })).statusCode).toBe(400)
  })

  it('travels from a neutral field such as 2601, which no switch rule lists as a key', async () => {
    // SceneSwitchRuleSystem.CanChangeScene: a missing key is free, not forbidden.
    await db
      .update(characters)
      .set({ sceneId: 2601, level: 40 })
      .where(eq(characters.id, characterId))
    const field = await client.post('/api/game/travel', { sceneId: 2602 })
    expect(field.statusCode).toBe(200)
    expect(field.json().character.sceneId).toBe(2602)
    expect((await client.post('/api/game/travel', { sceneId: 111 })).statusCode).toBe(200)
  })

  it('still checks the level and needs a switch rule or a scene link', async () => {
    await db
      .update(characters)
      .set({ sceneId: 2601, level: 20 })
      .where(eq(characters.id, characterId))
    const tooLow = await client.post('/api/game/travel', { sceneId: 2602 })
    expect(tooLow.json().error.code).toBe('too_low')
    // 3101 (Las Noches) has no switch rule and is not linked from 2601.
    const noRoute = await client.post('/api/game/travel', { sceneId: 3101 })
    expect(noRoute.json().error.code).toBe('no_route')
  })

  it('has no route to the Christmas House, whose event is not in the game yet', async () => {
    for (const sceneId of [2104, 2204, 2304, 2404, 2504]) {
      const response = await client.post('/api/game/travel', { sceneId })
      expect(response.json().error.code).toBe('no_route')
    }
  })

  it('refuses to travel while defeated', async () => {
    await db.update(characters).set({ hp: 0 }).where(eq(characters.id, characterId))
    const response = await client.post('/api/game/travel', { sceneId: 2101 })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('no_hp')
  })
})

describe('POST /api/game/revive (ReliveSystem, relive.ini)', () => {
  const defeatInField = (extra: Partial<typeof characters.$inferInsert> = {}) =>
    db
      .update(characters)
      .set({ hp: 0, mp: 3, sceneId: 2101, ...extra })
      .where(eq(characters.id, characterId))
  const revive = (mode: string) => client.post('/api/game/revive', { mode })

  it('goes home with 1 HP and loses 5% of the next level’s EXP', async () => {
    // Level 10 → 11 costs 1036 EXP: (int)(1036 * 5 * 0.01f) = 51.
    await defeatInField({ level: 10, exp: 500 })
    const response = await revive('home')
    expect(response.statusCode).toBe(200)
    expect(response.json().character).toMatchObject({ hp: 1, mp: 3, exp: 449, sceneId: 111 })
  })

  it('never takes EXP below 0', async () => {
    await defeatInField({ level: 10, exp: 20 })
    expect((await revive('home')).json().character.exp).toBe(0)
  })

  it('revives on the spot with full HP and MP for 1 Gold', async () => {
    await defeatInField({ gold: 5 })
    const body = (await revive('gold')).json()
    expect(body.character).toMatchObject({ gold: 4, sceneId: 2101 })
    expect(body.character.hp).toBe(body.character.maxHp)
    expect(body.character.mp).toBe(body.character.maxMp)
  })

  it('needs 1 Gold to revive on the spot', async () => {
    await defeatInField({ gold: 0 })
    const response = await revive('gold')
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('no_gold')
  })

  it('refuses when the ninja is not defeated or the mode is unknown', async () => {
    expect((await revive('home')).json().error.code).toBe('not_defeated')
    await defeatInField()
    expect((await revive('pray')).statusCode).toBe(400)
  })
})
