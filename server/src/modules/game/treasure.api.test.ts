// HP/MP pouches (RoleUseSystem), derived stats in GET /character, available quests and the
// revive terms of GET /scene.
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
  // Clothing 3: Ggio Vega (sharp in Reborn), Fire Village; level 1 max HP 220.
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

const give = async (itemId: string, count = 1) =>
  (await db.insert(inventoryItems).values({ characterId, itemId, count }).returning())[0]!
// The worn creation outfit (outfits are items) is not bag contents.
const bag = () =>
  db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.characterId, characterId))
    .then((rows) => rows.filter((row) => row.equippedSlot !== 'Outfit'))
const row = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const open = (id: string) => client.post(`/api/game/items/${id}/treasure`, { currency: 'gold' })
const pick = (id: string, slot = 0) => client.post(`/api/game/treasure/${id}/pick`, { slot })

describe('treasure boxes', () => {
  it('spends Seal Breakers first, consumes one box and grants only one server-rolled card', async () => {
    const box = await give('i159003', 2)
    await give('i100004')
    const opened = await open(box.id)
    expect(opened.statusCode).toBe(200)
    const treasure = opened.json().treasure
    expect(treasure.slots).toBe(5)
    expect(treasure.cards).toBeUndefined()
    expect(await bag()).toEqual([expect.objectContaining({ itemId: 'i159003', count: 1 })])
    const chosen = await pick(treasure.id)
    expect(chosen.statusCode).toBe(200)
    expect(chosen.json().cards).toHaveLength(5)
    expect(chosen.json().reward).toMatchObject({
      itemId: expect.any(String),
      bound: expect.any(Boolean),
    })
    expect((await bag()).reduce((sum, item) => sum + item.count, 0)).toBe(2)
    expect((await pick(treasure.id)).statusCode).toBe(400)
  })
  it.each([
    ['i159000', 50],
    ['i159001', 30],
    ['i159002', 20],
    ['i159003', 10],
  ])('charges the original Gold cost for %s', async (itemId, gold) => {
    await db.update(characters).set({ gold: 100 }).where(eq(characters.id, characterId))
    const box = await give(String(itemId))
    expect((await open(box.id)).statusCode).toBe(200)
    expect((await row()).gold).toBe(100 - Number(gold))
    expect(await bag()).toEqual([])
  })
  it('keeps partial keys, box and currency when payment cannot be made', async () => {
    const box = await give('i159000')
    await give('i100004', 4)
    expect((await open(box.id)).statusCode).toBe(400)
    expect(await bag()).toHaveLength(2)
    expect((await row()).gold).toBe(0)
  })
  it('allows only one pending box and rejects invalid slots without losing the reward', async () => {
    const box = await give('i159003', 2)
    await give('i100004', 2)
    const id = (await open(box.id)).json().treasure.id
    expect((await open(box.id)).statusCode).toBe(400)
    expect((await pick(id, 5)).statusCode).toBe(400)
    expect((await pick(id)).statusCode).toBe(200)
    expect((await open(box.id)).statusCode).toBe(200)
  })
  it('rejects another account and handles simultaneous claims exactly once', async () => {
    const box = await give('i159003')
    await give('i100004')
    const id = (await open(box.id)).json().treasure.id
    const anonymous = new Client(app)
    expect((await anonymous.post(`/api/game/treasure/${id}/pick`, { slot: 0 })).statusCode).toBe(
      401,
    )
    const results = await Promise.all([pick(id), pick(id)])
    expect(results.map((response) => response.statusCode).sort()).toEqual([200, 400])
    expect(await bag()).toHaveLength(1)
  })
  it('keeps a pending reward when the bag is full', async () => {
    const box = await give('i159003')
    await give('i100004')
    const id = (await open(box.id)).json().treasure.id
    await db
      .insert(inventoryItems)
      .values(Array.from({ length: 120 }, () => ({ characterId, itemId: 'i160001', count: 999 })))
    expect((await pick(id)).json().error.code).toBe('bag_full')
    await db.delete(inventoryItems).where(eq(inventoryItems.characterId, characterId))
    expect((await pick(id)).statusCode).toBe(200)
  })
})
