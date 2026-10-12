// Equipment: unequipping (EquipSystem.OnCustomUnEquip) and the stats gear adds to GET /character.
import { BAG_SLOTS } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { inventoryItems } from '../../db/schema.js'

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
  // Clothing 3: Ggio Vega (fists), level 1 max HP 220, Stamina 1365, Strength 1365.
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

const giveItem = async (itemId: string, extra: Partial<typeof inventoryItems.$inferInsert> = {}) =>
  (
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId, ...extra })
      .returning()
  )[0]!
const unequip = (id: string) => client.post(`/api/game/items/${id}/unequip`)
const itemRow = async (id: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]
const stats = async () => (await client.get('/api/game/character')).json().stats

describe('POST /api/game/items/:id/unequip', () => {
  it('moves the item back to the bag and drops its stats', async () => {
    const fists = await giveItem('i270100', { equippedSlot: 'Weapon' })
    expect(await stats()).toMatchObject({ minAttack: 8, maxAttack: 9 })

    const response = await unequip(fists.id)

    expect(response.statusCode).toBe(200)
    expect(response.json().character).toMatchObject({ id: characterId })
    expect(await itemRow(fists.id)).toMatchObject({ equippedSlot: null, count: 1 })
    expect(await stats()).toMatchObject({ minAttack: 1, maxAttack: 1 })
  })

  it('refuses an item that is not equipped', async () => {
    const fists = await giveItem('i270100')
    const response = await unequip(fists.id)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('not_equipped')
  })

  it('refuses when the bag is full', async () => {
    const fists = await giveItem('i270100', { equippedSlot: 'Weapon' })
    await db
      .insert(inventoryItems)
      .values(Array.from({ length: BAG_SLOTS }, () => ({ characterId, itemId: 'i160006' })))
    const response = await unequip(fists.id)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('bag_full')
    expect(await itemRow(fists.id)).toMatchObject({ equippedSlot: 'Weapon' })
  })

  it('cannot touch another player’s items or a malformed id', async () => {
    expect((await unequip('00000000-0000-7000-8000-000000000000')).statusCode).toBe(404)
    expect((await unequip('not-a-uuid')).statusCode).toBe(400)
  })

  it('requires a login', async () => {
    const fists = await giveItem('i270100', { equippedSlot: 'Weapon' })
    const anonymous = new Client(app)
    expect((await anonymous.post(`/api/game/items/${fists.id}/unequip`)).statusCode).toBe(401)
  })
})

describe('GET /api/game/character with equipment', () => {
  it('adds every item property and the set bonus (Oracle Outfit 8160, 2 pieces: +28 Stamina)', async () => {
    // Cloth i281601 (Def 119) and Hat i281602 (Def 34) are both set 8160.
    await giveItem('i281601', { equippedSlot: 'Cloth' })
    await giveItem('i281602', { equippedSlot: 'Hat' })
    expect(await stats()).toMatchObject({ defense: 153, stamina: 1365 + 2800 })
  })

  it('raises max HP with MaxHPMulEquip and reports it on the character', async () => {
    // i298004: Def 167, MaxHPMulEquip 50 -> (int)(220 * (1000 + 0 + 50) * 0.001) = 231.
    await giveItem('i298004', { equippedSlot: 'Cloth' })
    const body = (await client.get('/api/game/character')).json()
    expect(body.stats).toMatchObject({ maxHp: 231, defense: 167 })
    expect(body.character.maxHp).toBe(231)
  })

  it('gives nothing from a broken item', async () => {
    await giveItem('i298004', { equippedSlot: 'Cloth', durability: 0 })
    expect(await stats()).toMatchObject({ maxHp: 220, defense: 0 })
  })
})
