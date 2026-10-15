// Gems and enchantments (2011 EnchaseSystem / AddHoleSystem / AddMagicSystem, Reborn's Armory).
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

type Insert = typeof inventoryItems.$inferInsert
const giveItem = async (itemId: string, extra: Partial<Insert> = {}) =>
  (
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId, ...extra })
      .returning()
  )[0]!
const itemRow = async (id: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]
const held = async (itemId: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.characterId, characterId)))
    .filter((row) => row.itemId === itemId)
    .reduce((sum, row) => sum + row.count, 0)
const stats = async () => (await client.get('/api/game/character')).json().stats
const code = (response: { json: () => { error: { code: string } } }) => response.json().error.code

// i220103: a level 23 helmet, any job, MaxHoleCount 2.
const HELMET = 'i220103'
// Ruby Level 1 (StrengthEquip 1400, any gear); Ruby Level 3 (gear 21+); Ruby Level 4 (gear 31+).
const RUBY_1 = 'i110101'
const RUBY_3 = 'i110103'
const RUBY_4 = 'i110104'
// Level 21 Hat/Gloves Enchantment Stone I (ParryMulEquip 16); a weapon-only stone.
const HAT_STONE = 'i412101'
const WEAPON_STONE = 'i402101'

describe('POST /api/game/forge/gems/insert', () => {
  it('sockets a gem into worn gear: the stat counts and the gem is used up', async () => {
    const helmet = await giveItem(HELMET, { equippedSlot: 'Hat', gems: [null, null] })
    const gem = await giveItem(RUBY_1, { bound: true })
    const before = await stats()

    const response = await client.post('/api/game/forge/gems/insert', {
      itemId: helmet.id,
      gemId: gem.id,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().item.gear).toMatchObject({
      sockets: [
        { itemId: RUBY_1, nameKey: 'lg_Gem121_itemname', name: 'StrengthEquip', value: 1400 },
        null,
      ],
      maxSockets: 2,
    })
    expect((await stats()).strength - before.strength).toBe(1400)
    expect(await itemRow(gem.id)).toBeUndefined()
    // A bound gem binds the gear.
    expect(await itemRow(helmet.id)).toMatchObject({ gems: [RUBY_1, null], bound: true })
  })

  it('needs an open socket', async () => {
    const plain = await giveItem(HELMET)
    const full = await giveItem(HELMET, { gems: [RUBY_1] })
    const gem = await giveItem(RUBY_1)
    const insert = (itemId: string) =>
      client.post('/api/game/forge/gems/insert', { itemId, gemId: gem.id })
    expect(code(await insert(plain.id))).toBe('no_socket')
    expect(code(await insert(full.id))).toBe('no_socket')
    expect(await held(RUBY_1)).toBe(1)
  })

  it('needs gear of the gem’s level: (JewelLevel - 1) * 10 + 1', async () => {
    const helmet = await giveItem(HELMET, { gems: [null, null] })
    const low = await giveItem(RUBY_3)
    const high = await giveItem(RUBY_4)
    const insert = (gemId: string) =>
      client.post('/api/game/forge/gems/insert', { itemId: helmet.id, gemId })
    expect((await insert(low.id)).statusCode).toBe(200)
    const refused = await insert(high.id)
    expect(code(refused)).toBe('too_low')
    expect(refused.json().error.message).toContain('level 31')
  })

  it('refuses non-gems, wings and other players’ items', async () => {
    const helmet = await giveItem(HELMET, { gems: [null] })
    const stone = await giveItem(HAT_STONE)
    expect(
      code(
        await client.post('/api/game/forge/gems/insert', { itemId: helmet.id, gemId: stone.id }),
      ),
    ).toBe('not_gem')
    const gem = await giveItem(RUBY_1)
    const response = await client.post('/api/game/forge/gems/insert', {
      itemId: '00000000-0000-4000-8000-000000000000',
      gemId: gem.id,
    })
    expect(response.statusCode).toBe(404)
  })
})

describe('POST /api/game/forge/gems/remove', () => {
  it('returns every gem with the gear’s binding and leaves the sockets open', async () => {
    const helmet = await giveItem(HELMET, {
      equippedSlot: 'Hat',
      gems: [RUBY_1, RUBY_3],
      bound: true,
    })
    const before = await stats()

    const response = await client.post('/api/game/forge/gems/remove', { itemId: helmet.id })

    expect(response.statusCode).toBe(200)
    expect(response.json().item.gear.sockets).toEqual([null, null])
    expect(before.strength - (await stats()).strength).toBe(1400 + 2800)
    const gems = (
      await db.select().from(inventoryItems).where(eq(inventoryItems.characterId, characterId))
    ).filter((row) => row.itemId.startsWith('i1101'))
    expect(gems.map((row) => [row.itemId, row.bound]).sort()).toEqual([
      [RUBY_1, true],
      [RUBY_3, true],
    ])
  })

  it('refuses gear without gems', async () => {
    const helmet = await giveItem(HELMET, { gems: [null] })
    const response = await client.post('/api/game/forge/gems/remove', { itemId: helmet.id })
    expect(code(response)).toBe('no_gems')
  })
})

describe('POST /api/game/forge/gems/hole', () => {
  it('opens one more socket for a Slot Talisman, up to MaxHoleCount', async () => {
    const helmet = await giveItem(HELMET)
    await giveItem('i161040', { count: 3, bound: true })
    const hole = () =>
      client.post('/api/game/forge/gems/hole', { itemId: helmet.id, talisman: 'i161040' })

    expect((await hole()).json().item.gear.sockets).toEqual([null])
    expect((await hole()).json().item.gear.sockets).toEqual([null, null])
    expect(code(await hole())).toBe('max_sockets')
    expect(await held('i161040')).toBe(1)
    expect(await itemRow(helmet.id)).toMatchObject({ bound: true })
  })

  it('needs a Slot Talisman whose level range covers the gear', async () => {
    const helmet = await giveItem(HELMET)
    await giveItem('i161003') // an Enhancement Talisman
    const hole = (talisman: string) =>
      client.post('/api/game/forge/gems/hole', { itemId: helmet.id, talisman })
    expect(code(await hole('i161003'))).toBe('no_talisman')
    // i161040 covers gear up to level 30 but there is none in the bag.
    expect(code(await hole('i161040'))).toBe('no_talisman')
    expect(await itemRow(helmet.id)).toMatchObject({ gems: [] })
  })

  it('refuses unappraised gear', async () => {
    const helmet = await giveItem(HELMET, { canIdentify: true, identifyCount: 2 })
    await giveItem('i161002')
    const response = await client.post('/api/game/forge/gems/hole', {
      itemId: helmet.id,
      talisman: 'i161002',
    })
    expect(code(response)).toBe('unappraised')
  })
})

describe('POST /api/game/forge/enchant', () => {
  it('applies the stone’s lines to the gear and uses the stone up', async () => {
    const helmet = await giveItem(HELMET, { equippedSlot: 'Hat' })
    const stone = await giveItem(HAT_STONE)
    const before = await stats()

    const response = await client.post('/api/game/forge/enchant', {
      itemId: helmet.id,
      stoneId: stone.id,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().item.gear.enchant).toEqual({
      itemId: HAT_STONE,
      nameKey: 'lg_MagicStone_Defence1_2101',
      lines: [{ name: 'ParryMulEquip', value: 16 }],
    })
    expect((await stats()).parry - before.parry).toBe(16)
    expect(await itemRow(stone.id)).toBeUndefined()
  })

  it('replaces an earlier enchantment', async () => {
    const helmet = await giveItem(HELMET, { enchantItemId: HAT_STONE })
    const stone = await giveItem('i412102')
    await client.post('/api/game/forge/enchant', { itemId: helmet.id, stoneId: stone.id })
    expect(await itemRow(helmet.id)).toMatchObject({ enchantItemId: 'i412102' })
  })

  it('refuses a stone for another slot and keeps it', async () => {
    const helmet = await giveItem(HELMET)
    const stone = await giveItem(WEAPON_STONE)
    const response = await client.post('/api/game/forge/enchant', {
      itemId: helmet.id,
      stoneId: stone.id,
    })
    expect(code(response)).toBe('wrong_slot')
    expect(await itemRow(stone.id)).toBeDefined()
  })

  it('needs gear of the stone’s level', async () => {
    // i220102: a level 13 helmet.
    const helmet = await giveItem('i220102')
    const stone = await giveItem(HAT_STONE)
    const response = await client.post('/api/game/forge/enchant', {
      itemId: helmet.id,
      stoneId: stone.id,
    })
    expect(code(response)).toBe('too_low')
  })
})

describe('GET /api/game/inventory item info', () => {
  it('tells gems and stones apart and gives their stats; gems have no Use', async () => {
    await giveItem(RUBY_1)
    await giveItem(HAT_STONE)
    const items = (await client.get('/api/game/inventory')).json().items as {
      itemId: string
      info: Record<string, unknown>
    }[]
    const info = (itemId: string) => items.find((row) => row.itemId === itemId)!.info
    expect(info(RUBY_1)).toMatchObject({
      kind: 'other',
      gem: { name: 'StrengthEquip', value: 1400, level: 1 },
    })
    expect(info(HAT_STONE)).toMatchObject({
      enchant: {
        lines: [{ name: 'ParryMulEquip', value: 16 }],
        slots: ['Hat', 'Glove'],
        level: 21,
      },
    })
  })
})
