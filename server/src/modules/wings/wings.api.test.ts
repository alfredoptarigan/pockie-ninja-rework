// Wings and auras (M6 task 7): enhance, destroy, the Wing Collection and the fighter bonus.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Random } from '@pockie/game-core'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { arenaPlayers, characters, inventoryItems } from '../../db/schema.js'
import { BAG_CELLS } from '../../game/bag.js'
import { playerFighter, playerFighterFrom } from '../../game/combat.js'
import { wingBonuses } from '../../game/wings.js'
import { wingRoutes } from './routes.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string
/** What the next enhance roll returns (random.next()). */
let roll = 0

const fixed: () => Random = () => ({ next: () => roll, int: () => 0, between: (a) => a })

beforeEach(async () => {
  await truncateAll(db)
  roll = 0
  app = buildTestApp(db)
  // The app registers the routes at /api/game/wings; this copy injects the enhance roll.
  app.register(wingRoutes, { db, prefix: '/api/test/wings', random: fixed })
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
  await db.update(characters).set({ level: 60 }).where(eq(characters.id, characterId))
})
afterEach(() => app.close())
afterAll(() => close())

const give = async (
  itemId: string,
  count = 1,
  extra: Partial<typeof inventoryItems.$inferInsert> = {},
) =>
  (
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId, count, bound: true, ...extra })
      .returning()
  )[0]!
const giveWing = (itemId = 'i218000', enhanceLevel = 0, equipped = false) =>
  give(itemId, 1, { enhanceLevel, ...(equipped && { equippedSlot: 'Wing' }) })
const rowsOf = (itemId: string) =>
  db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.characterId, characterId), eq(inventoryItems.itemId, itemId)))
const held = async (itemId: string) => (await rowsOf(itemId)).reduce((sum, r) => sum + r.count, 0)
const levelOf = async (id: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]?.enhanceLevel
const enhanceRow = (id: string, body: object) => client.post(`/api/test/wings/${id}/enhance`, body)

describe('GET /api/test/wings', () => {
  it('is served by the app at /api/game/wings', async () => {
    expect((await client.get('/api/game/wings')).statusCode).toBe(200)
  })

  it('lists the equipped and owned wings, materials and the 26 collection entries', async () => {
    const worn = await giveWing('i218000', 3, true)
    await giveWing('i218200')
    await give('i218021', 4)
    await give('i218050', 2)
    const response = await client.get('/api/test/wings')
    expect(response.statusCode).toBe(200)
    const view = response.json()
    expect(view.maxLevel).toBe(30)
    expect(view.equipped).toMatchObject({ id: worn.id, itemId: 'i218000', level: 3, kind: 'wing' })
    expect(view.owned).toHaveLength(2)
    expect(view.owned.find((w: { itemId: string }) => w.itemId === 'i218200').kind).toBe('aura')
    expect(view.equipped.stats).toContainEqual({ field: 'hp', label: 'Max HP', value: 128 })
    expect(view.stones).toContainEqual(
      expect.objectContaining({ itemId: 'i218021', levelJump: 1, count: 4 }),
    )
    expect(view.talismans).toContainEqual(
      expect.objectContaining({ itemId: 'i218050', family: 'luck', value: 12, count: 2 }),
    )
    expect(view.collection).toHaveLength(26)
    expect(view.collection.find((e: { itemId: string }) => e.itemId === 'i218000')).toMatchObject({
      owned: true,
      registered: false,
      reward: 5,
    })
  })
})

describe('POST /api/test/wings/:itemRowId/enhance', () => {
  it('raises the level on success and uses the stone and talismans', async () => {
    const wing = await giveWing()
    await give('i218021', 2)
    await give('i218050')
    const response = await enhanceRow(wing.id, { stone: 'i218021', luck: 'i218050' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ outcome: 'success', level: 1 })
    expect(await levelOf(wing.id)).toBe(1)
    expect(await held('i218021')).toBe(1)
    expect(await held('i218050')).toBe(0)
  })

  it('jumps by the stone level', async () => {
    const wing = await giveWing()
    await give('i218023')
    await enhanceRow(wing.id, { stone: 'i218023' })
    expect(await levelOf(wing.id)).toBe(4)
  })

  it('a failure keeps the level but still uses the stone', async () => {
    roll = 0.9
    const wing = await giveWing('i218000', 5)
    await give('i218021')
    const response = await enhanceRow(wing.id, { stone: 'i218021' })
    expect(response.json()).toMatchObject({ outcome: 'fail', level: 5 })
    expect(await held('i218021')).toBe(0)
  })

  it('destroy deletes the row and unequips', async () => {
    roll = 0.55
    const wing = await giveWing('i218000', 25, true)
    await give('i218021')
    const response = await enhanceRow(wing.id, { stone: 'i218021' })
    expect(response.json()).toMatchObject({ outcome: 'destroy', level: null, equipped: null })
    expect(await rowsOf('i218000')).toHaveLength(0)
    expect(await wingBonuses(db, characterId)).toEqual({})
  })

  it('Integrity stops the destroy at the same roll', async () => {
    roll = 0.55
    const wing = await giveWing('i218000', 25, true)
    await give('i218021')
    await give('i218034')
    const response = await enhanceRow(wing.id, { stone: 'i218021', integrity: 'i218034' })
    expect(response.json()).toMatchObject({ outcome: 'fail', level: 25 })
    expect(await levelOf(wing.id)).toBe(25)
  })

  it('refuses at level 30 and keeps the stone', async () => {
    const wing = await giveWing('i218000', 30)
    await give('i218021')
    const response = await enhanceRow(wing.id, { stone: 'i218021' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('max_level')
    expect(await held('i218021')).toBe(1)
  })

  it('refuses a missing stone, a talisman of the wrong family and a non-wing row', async () => {
    const wing = await giveWing()
    const missing = await enhanceRow(wing.id, { stone: 'i218021' })
    expect(missing.json().error.code).toBe('no_stone')
    await give('i218021')
    await give('i218040')
    const wrong = await enhanceRow(wing.id, { stone: 'i218021', luck: 'i218040' })
    expect(wrong.json().error.code).toBe('wrong_talisman')
    const notStone = await enhanceRow(wing.id, { stone: 'i218040' })
    expect(notStone.json().error.code).toBe('wrong_stone')
    const stoneRow = (await rowsOf('i218021'))[0]!
    const notWing = await enhanceRow(stoneRow.id, { stone: 'i218021' })
    expect(notWing.json().error.code).toBe('not_wing')
    expect(await held('i218021')).toBe(1)
    expect(await held('i218040')).toBe(1)
  })

  it('refreshes the arena snapshot', async () => {
    const wing = await giveWing('i218000', 0, true)
    await give('i218021')
    await client.get('/api/game/arena')
    const old = new Date('2020-01-01T00:00:00Z')
    await db
      .update(arenaPlayers)
      .set({ snapshotAt: old })
      .where(eq(arenaPlayers.characterId, characterId))
    await enhanceRow(wing.id, { stone: 'i218021' })
    const [after] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, characterId))
    expect(after!.snapshotAt!.getTime()).toBeGreaterThan(old.getTime())
  })

  it('two concurrent enhances use one stone each', async () => {
    const wing = await giveWing()
    await give('i218021', 2)
    const results = await Promise.all([
      enhanceRow(wing.id, { stone: 'i218021' }),
      enhanceRow(wing.id, { stone: 'i218021' }),
    ])
    expect(results.map((r) => r.statusCode)).toEqual([200, 200])
    expect(await levelOf(wing.id)).toBe(2)
    expect(await held('i218021')).toBe(0)
  })

  it('two concurrent enhances never skip the level check', async () => {
    const wing = await giveWing('i218000', 29)
    await give('i218021', 2)
    const results = await Promise.all([
      enhanceRow(wing.id, { stone: 'i218021' }),
      enhanceRow(wing.id, { stone: 'i218021' }),
    ])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect(await levelOf(wing.id)).toBe(30)
    expect(await held('i218021')).toBe(1)
  })
})

describe('POST /api/test/wings/collection/:itemId', () => {
  it('registers a wing once, pays Plume Shards and keeps the wing', async () => {
    await giveWing('i218000')
    const response = await client.post('/api/test/wings/collection/i218000', {})
    expect(response.statusCode).toBe(200)
    expect(response.json().reward).toBe(5)
    expect(await held('i218021')).toBe(5)
    expect(await held('i218000')).toBe(1)
    const again = await client.post('/api/test/wings/collection/i218000', {})
    expect(again.statusCode).toBe(409)
    expect(await held('i218021')).toBe(5)
  })

  it('refuses a repeat claim as already registered even with a full bag', async () => {
    await giveWing('i218000')
    await client.post('/api/test/wings/collection/i218000', {})
    await db
      .insert(inventoryItems)
      .values(
        Array.from({ length: BAG_CELLS }, () => ({ characterId, itemId: 'i160006', count: 1 })),
      )
    const again = await client.post('/api/test/wings/collection/i218000', {})
    expect(again.statusCode).toBe(409)
    expect(again.json().error.code).toBe('already_registered')
  })

  it('pays 10 for an aura, also when it is worn', async () => {
    await giveWing('i218200', 0, true)
    const response = await client.post('/api/test/wings/collection/i218200', {})
    expect(response.json().reward).toBe(10)
    expect(
      response.json().collection.find((e: { itemId: string }) => e.itemId === 'i218200'),
    ).toMatchObject({ registered: true })
  })

  it('refuses an item not owned or not a wing', async () => {
    const missing = await client.post('/api/test/wings/collection/i218001', {})
    expect(missing.json().error.code).toBe('no_item')
    await give('i218021')
    const notWing = await client.post('/api/test/wings/collection/i218021', {})
    expect(notWing.json().error.code).toBe('not_wing')
  })
})

describe('wingBonuses', () => {
  it('is empty with no wing worn', async () => {
    await giveWing('i218000', 5)
    expect(await wingBonuses(db, characterId)).toEqual({})
  })

  it('raises the fighter by the line values', async () => {
    await giveWing('i218000', 0, true)
    const [character] = await db.select().from(characters).where(eq(characters.id, characterId))
    const bonuses = await wingBonuses(db, characterId)
    expect(bonuses).toEqual({ hp: 80, hit: 42, neglectDefense: 46, decDamage: 1 })
    const before = playerFighterFrom(character!, [])
    const after = playerFighterFrom(character!, [], bonuses)
    expect(after.hit - before.hit).toBe(42)
    expect(after.neglectDefense - before.neglectDefense).toBe(46)
    expect(after.decDamage - before.decDamage).toBe(1)
    expect(after.maxHp).toBeGreaterThan(before.maxHp)
  })
})

describe('Wing slot (decision 22)', () => {
  it('the item equip route puts a wing or an aura in the Wing slot, one at a time', async () => {
    const wing = await giveWing('i218000')
    const aura = await giveWing('i218200')
    expect((await client.post(`/api/game/items/${wing.id}/equip`, {})).statusCode).toBe(200)
    expect((await client.post(`/api/game/items/${aura.id}/equip`, {})).statusCode).toBe(200)
    const view = (await client.get('/api/test/wings')).json()
    expect(view.equipped.id).toBe(aura.id)
    expect(view.owned.filter((w: { equipped: boolean }) => w.equipped)).toHaveLength(1)
  })
})

describe('wing wiring (coordinator)', () => {
  const row = async () =>
    (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
  const snapshot = async () => {
    const [arena] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, characterId))
    return arena!.snapshot as unknown as {
      fighter: { hit: number; maxHp: number }
      look: { wingSprite?: string; aura?: string }
    }
  }

  it('an equipped wing raises the live fighter and the arena snapshot by its line', async () => {
    await client.get('/api/game/arena')
    const before = await playerFighter(db, await row())
    const wing = await giveWing('i218000')
    expect((await client.post(`/api/game/items/${wing.id}/equip`, {})).statusCode).toBe(200)
    const after = await playerFighter(db, await row())
    expect(after.hit - before.hit).toBe(42)
    expect(after.neglectDefense - before.neglectDefense).toBe(46)
    const stored = await snapshot()
    expect(stored.fighter.hit).toBe(after.hit)
    expect(stored.fighter.maxHp).toBe(after.maxHp)
    expect(stored.look.wingSprite).toBe('wing_duotian_3')
  })

  it('unequipping the wing refreshes the arena snapshot', async () => {
    await client.get('/api/game/arena')
    const before = (await snapshot()).fighter.hit
    const aura = await giveWing('i218200')
    await client.post(`/api/game/items/${aura.id}/equip`, {})
    expect((await snapshot()).look.aura).toBe('ki_lightning')
    expect((await client.post(`/api/game/items/${aura.id}/unequip`, {})).statusCode).toBe(200)
    const stored = await snapshot()
    expect(stored.fighter.hit).toBe(before)
    expect(stored.look.aura).toBeUndefined()
  })
})
