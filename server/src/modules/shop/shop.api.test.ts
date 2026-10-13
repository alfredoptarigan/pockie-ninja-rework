import { BAG_CELLS } from '../../game/bag.js'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  characters,
  characterShops,
  characterShopStock,
  inventoryItems,
  mysticSpawns,
  mysticItemSales,
} from '../../db/schema.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string
const base = '/api/game/shop'
beforeEach(async () => {
  await truncateAll(db)
  await db.delete(mysticSpawns)
  await db.delete(mysticItemSales)
  app = buildTestApp(db)
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Player_one',
    email: 'player@example.com',
    password: 'believe-it',
  })
  characterId = (
    await client.post('/api/game/characters', {
      name: 'Ninja_01',
      gender: 0,
      clothing: 3,
      nation: 0,
    })
  ).json().character.id
})
afterEach(async () => {
  vi.restoreAllMocks()
  await app.close()
})
afterAll(() => close())
const update = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const row = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const bag = () =>
  db.select().from(inventoryItems).where(eq(inventoryItems.characterId, characterId))
const post = (path: string, body: object) => client.post(`${base}/${path}`, body)
const give = async (itemId: string, extra: Partial<typeof inventoryItems.$inferInsert> = {}) =>
  (
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId, ...extra })
      .returning()
  )[0]!
const stock = (shopType: number) =>
  db
    .select()
    .from(characterShopStock)
    .where(
      and(
        eq(characterShopStock.characterId, characterId),
        eq(characterShopStock.shopType, shopType),
      ),
    )
async function seedStock(
  shopType = 1,
  priceStone: number | null = 5,
  priceGold: number | null = null,
) {
  await db
    .insert(characterShops)
    .values({ characterId, shopType, lastRefreshAt: new Date() })
    .onConflictDoNothing()
  await db.insert(characterShopStock).values({
    characterId,
    shopType,
    slot: 0,
    itemId: 'i250101',
    priceStone,
    priceGold,
    bound: shopType !== 2,
  })
}

describe('shop authentication and Wholesale', () => {
  it('requires login on every action', async () => {
    const anonymous = new Client(app)
    expect((await anonymous.get(`${base}/open`)).statusCode).toBe(401)
    expect((await anonymous.get(`${base}/merchant`)).statusCode).toBe(401)
    for (const [path, body] of [
      ['wholesale/buy', { itemId: 'i160006', count: 1 }],
      ['refresh', { shopType: 1, mode: 'instant', currency: 'stone' }],
      ['buy', { shopType: 1, slot: 0, currency: 'stone' }],
      ['buy-all', { shopType: 1 }],
      ['sell', { inventoryId: characterId, count: 1 }],
      ['sell-all', { inventoryIds: [characterId] }],
      ['pouches/refill', { currency: 'gold', hp: 1, mp: 0 }],
      ['merchant/buy', { spawnId: characterId, tab: 'gold', slot: 0, count: 1 }],
    ] as const)
      expect((await anonymous.post(`${base}/${path}`, body)).statusCode).toBe(401)
  })
  it('opens the three refresh tabs and level 1 Wholesale box 1001', async () => {
    const response = await client.get(`${base}/open`)
    expect(response.statusCode).toBe(200)
    expect(response.json().tabs).toHaveLength(3)
    expect(response.json().wholesale.boxId).toBe(1001)
    expect(response.json().wholesale.stock).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: 'i160006' })]),
    )
  })
  it('buys bound medicine for exactly 38 Stone per item', async () => {
    await update({ stone: 100 })
    expect((await post('wholesale/buy', { itemId: 'i160006', count: 2 })).statusCode).toBe(200)
    expect((await row()).stone).toBe(24)
    expect(await bag()).toEqual([
      expect.objectContaining({ itemId: 'i160006', count: 2, bound: true }),
    ])
  })
  it('refuses insufficient Stone atomically', async () => {
    await update({ stone: 37 })
    expect((await post('wholesale/buy', { itemId: 'i160006', count: 1 })).statusCode).toBe(400)
    expect((await row()).stone).toBe(37)
    expect(await bag()).toHaveLength(0)
  })
  it('refuses a full bag without charging', async () => {
    await update({ stone: 100 })
    await db
      .insert(inventoryItems)
      .values(
        Array.from({ length: BAG_CELLS }, () => ({ characterId, itemId: 'i160001', count: 999 })),
      )
    expect((await post('wholesale/buy', { itemId: 'i160006', count: 1 })).statusCode).toBe(400)
    expect((await row()).stone).toBe(100)
    expect(await bag()).toHaveLength(BAG_CELLS)
  })
})

describe('refresh purchases and restocks', () => {
  it('moves a slot into the bag and charges Stone once', async () => {
    await seedStock()
    await update({ stone: 10 })
    expect((await post('buy', { shopType: 1, slot: 0, currency: 'stone' })).statusCode).toBe(200)
    expect((await row()).stone).toBe(5)
    expect(await stock(1)).toHaveLength(0)
    expect(await bag()).toEqual([expect.objectContaining({ itemId: 'i250101', bound: true })])
  })
  it('checks Gold itself rather than the Stone balance', async () => {
    await seedStock(2, null, 8)
    await update({ stone: 1000, gold: 7 })
    expect((await post('buy', { shopType: 2, slot: 0, currency: 'gold' })).statusCode).toBe(400)
    expect((await row()).gold).toBe(7)
    expect(await stock(2)).toHaveLength(1)
    expect(await bag()).toHaveLength(0)
  })
  it('buy all checks all currencies before removing any stock', async () => {
    await seedStock(2, null, 8)
    await update({ stone: 1000, gold: 7 })
    expect((await post('buy-all', { shopType: 2 })).statusCode).toBe(400)
    expect(await stock(2)).toHaveLength(1)
    await update({ gold: 8 })
    expect((await post('buy-all', { shopType: 2 })).statusCode).toBe(200)
    expect((await row()).gold).toBe(0)
    expect(await stock(2)).toHaveLength(0)
  })
  it('serializes two purchases of the same slot', async () => {
    await seedStock()
    await update({ stone: 100 })
    await client.fetchCsrf()
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let locked!: () => void
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve
    })
    const holder = db.transaction(async (tx) => {
      await tx.select().from(characters).where(eq(characters.id, characterId)).for('update')
      locked()
      await released
    })
    await isLocked
    const pending = [
      post('buy', { shopType: 1, slot: 0, currency: 'stone' }),
      post('buy', { shopType: 1, slot: 0, currency: 'stone' }),
    ]
    try {
      const deadline = performance.now() + 2000
      for (;;) {
        const [{ waiting }] = (await db.execute(
          sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
        )) as unknown as [{ waiting: number }]
        if (waiting >= 2) break
        if (performance.now() > deadline)
          throw new Error('Both purchases must wait for the character row lock')
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    } finally {
      release()
      await holder
    }
    const results = await Promise.all(pending)
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1)
    expect(await bag()).toHaveLength(1)
    expect((await row()).stone).toBe(95)
  })
  it('countdown restocks at 1800 seconds while opening requires strictly more', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    await seedStock()
    await db
      .update(characterShops)
      .set({ lastRefreshAt: new Date(now - 1_799_000) })
      .where(eq(characterShops.characterId, characterId))
    await post('refresh', { shopType: 1, mode: 'countdown', currency: 'gold' })
    expect(await stock(1)).toHaveLength(1)
    await db
      .update(characterShops)
      .set({ lastRefreshAt: new Date(now - 1_800_000) })
      .where(eq(characterShops.characterId, characterId))
    await client.get(`${base}/open`)
    expect(await stock(1)).toHaveLength(1)
    expect(
      (await post('refresh', { shopType: 1, mode: 'countdown', currency: 'gold' })).statusCode,
    ).toBe(200)
    expect(await stock(1)).toHaveLength(3)
  })
  it('uses a free instant restock once per UTC day, then charges', async () => {
    await update({ level: 5, stone: 100 })
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-12T23:59:59Z'))
    expect(
      (await post('refresh', { shopType: 1, mode: 'instant', currency: 'stone' })).statusCode,
    ).toBe(200)
    expect((await row()).stone).toBe(100)
    expect(
      (await post('refresh', { shopType: 1, mode: 'instant', currency: 'stone' })).statusCode,
    ).toBe(200)
    expect((await row()).stone).toBe(50)
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-10-13T00:00:00Z'))
    expect(
      (await post('refresh', { shopType: 1, mode: 'instant', currency: 'stone' })).statusCode,
    ).toBe(200)
    expect((await row()).stone).toBe(50)
  })
  it('refuses a paid restock without enough Gold and preserves stock', async () => {
    await seedStock(2, null, 8)
    await update({ stone: 1000, gold: 7 })
    expect(
      (await post('refresh', { shopType: 2, mode: 'instant', currency: 'gold' })).statusCode,
    ).toBe(400)
    expect(await stock(2)).toHaveLength(1)
    expect((await row()).gold).toBe(7)
  })
})

describe('selling and pouch refill', () => {
  it('sells bound medicine at item Price times count', async () => {
    const item = await give('i160006', { count: 3, bound: true })
    expect((await post('sell', { inventoryId: item.id, count: 2 })).statusCode).toBe(200)
    expect((await row()).stone).toBe(32)
    expect(await bag()).toEqual([expect.objectContaining({ id: item.id, count: 1 })])
  })
  it('refuses equipped and untradeable items', async () => {
    const equipped = await give('i250101', { equippedSlot: 'Weapon' })
    const untradeable = await give('i159104')
    for (const item of [equipped, untradeable])
      expect((await post('sell', { inventoryId: item.id, count: 1 })).statusCode).toBe(400)
    expect((await row()).stone).toBe(0)
    expect(await bag()).toHaveLength(2)
  })
  it('sell all destroys listed sellable bag items and skips equipped items', async () => {
    const medicine = await give('i160006', { count: 2 })
    const equipped = await give('i250101', { equippedSlot: 'Weapon' })
    expect((await post('sell-all', { inventoryIds: [medicine.id, equipped.id] })).statusCode).toBe(
      200,
    )
    expect((await row()).stone).toBe(32)
    expect(await bag()).toEqual([expect.objectContaining({ id: equipped.id })])
  })
  it('refills arbitrary units and -1 fills using Gold or Gift Coupons', async () => {
    await update({ gold: 20, giftCoupon: 10, mpPouch: 9500 })
    expect((await post('pouches/refill', { currency: 'gold', hp: 3, mp: -1 })).statusCode).toBe(200)
    expect(await row()).toMatchObject({ gold: 16, hpPouch: 3000, mpPouch: 10000 })
    expect(
      (await post('pouches/refill', { currency: 'giftCoupon', hp: -1, mp: 0 })).statusCode,
    ).toBe(200)
    expect(await row()).toMatchObject({ giftCoupon: 3, hpPouch: 10000 })
  })
  it('refuses insufficient Gold and invalid refill currency', async () => {
    await update({ stone: 1000, gold: 2 })
    expect((await post('pouches/refill', { currency: 'gold', hp: 3, mp: 0 })).statusCode).toBe(400)
    expect((await post('pouches/refill', { currency: 'stone', hp: 1, mp: 0 })).statusCode).toBe(400)
    expect(await row()).toMatchObject({ gold: 2, hpPouch: 0 })
  })
})

describe('Mysterious Merchant', () => {
  async function spawn() {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-12T09:01:00Z'))
    await update({ level: 30, gold: 1000, sceneId: 2601 })
    await client.get(`${base}/merchant`)
    const [spawn] = await db.select().from(mysticSpawns)
    expect(spawn).toBeDefined()
    await update({ sceneId: spawn!.sceneId })
    return spawn!
  }
  it('spawns after the historic end date for ten minutes in a configured scene', async () => {
    const merchant = await spawn()
    expect(merchant.sceneId).toBeGreaterThanOrEqual(2601)
    expect(merchant.sceneId).toBeLessThanOrEqual(2605)
    expect(merchant.endsAt.getTime() - merchant.startsAt.getTime()).toBe(600000)
  })
  it('enforces a per-item limit per spawn and decrements server stock', async () => {
    const merchant = await spawn()
    const buy = () => post('merchant/buy', { spawnId: merchant.id, tab: 'gold', slot: 0, count: 2 })
    expect((await buy()).statusCode).toBe(200)
    expect((await buy()).statusCode).toBe(400)
    expect((await row()).gold).toBe(920)
    const [after] = await db.select().from(mysticSpawns).where(eq(mysticSpawns.id, merchant.id))
    expect(after!.stock[0]!.left).toBe(8)
  })
  it('refuses insufficient Gold and the VIP tab for a non-VIP player', async () => {
    const merchant = await spawn()
    await update({ gold: 39, stone: 1000 })
    expect(
      (await post('merchant/buy', { spawnId: merchant.id, tab: 'gold', slot: 0, count: 1 }))
        .statusCode,
    ).toBe(400)
    expect(
      (await post('merchant/buy', { spawnId: merchant.id, tab: 'vip', slot: 0, count: 1 }))
        .statusCode,
    ).toBe(400)
    expect((await row()).gold).toBe(39)
    expect(await bag()).toHaveLength(0)
  })
  it('sells the VIP tab to a VIP at its fixed price, sharing the per-item limit', async () => {
    const merchant = await spawn()
    await update({ vipUntil: new Date('2099-01-01T00:00:00Z') })
    const view = (await client.get(`${base}/merchant`)).json()
    expect(view.vipAvailable).toBe(true)
    // VIP slot 0: i150078 for 35 Gold, limit 2 per spawn, bound, no stock count.
    expect(view.vipStock[0]).toMatchObject({ itemId: 'i150078', price: 35, limit: 2, left: null })
    const buy = (tab: string, count: number) =>
      post('merchant/buy', { spawnId: merchant.id, tab, slot: 0, count })
    expect((await buy('vip', 2)).statusCode).toBe(200)
    expect((await row()).gold).toBe(930)
    expect(await bag()).toMatchObject([{ itemId: 'i150078', count: 2, bound: true }])
    expect((await client.get(`${base}/merchant`)).json().vipStock[0].purchased).toBe(2)
    expect((await buy('vip', 1)).json().error.code).toBe('purchase_limit')
    expect((await buy('gold', 1)).json().error.code).toBe('purchase_limit')
    const [after] = await db.select().from(mysticSpawns).where(eq(mysticSpawns.id, merchant.id))
    expect(after!.stock).toEqual(merchant.stock)
  })
  it('locks the VIP tab once VIP has expired', async () => {
    const merchant = await spawn()
    await update({ vipUntil: new Date('2026-10-12T09:00:00Z') })
    expect((await client.get(`${base}/merchant`)).json().vipAvailable).toBe(false)
    const response = await post('merchant/buy', {
      spawnId: merchant.id,
      tab: 'vip',
      slot: 0,
      count: 1,
    })
    expect(response.json().error.code).toBe('vip_required')
    expect((await row()).gold).toBe(1000)
  })
  it('refuses purchases at the exact ten-minute despawn boundary', async () => {
    const merchant = await spawn()
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-10-12T09:10:00Z'))
    expect(
      (await post('merchant/buy', { spawnId: merchant.id, tab: 'gold', slot: 0, count: 1 }))
        .statusCode,
    ).toBe(400)
    expect((await row()).gold).toBe(1000)
    expect(await bag()).toHaveLength(0)
  })
  it('resets player limits on the next hourly spawn', async () => {
    const merchant = await spawn()
    expect(
      (await post('merchant/buy', { spawnId: merchant.id, tab: 'gold', slot: 0, count: 2 }))
        .statusCode,
    ).toBe(200)
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-10-12T10:01:00Z'))
    await client.get(`${base}/merchant`)
    const [next] = await db
      .select()
      .from(mysticSpawns)
      .where(eq(mysticSpawns.startsAt, new Date('2026-10-12T10:00:00Z')))
    expect(next).toBeDefined()
    await update({ sceneId: next!.sceneId })
    expect(
      (await post('merchant/buy', { spawnId: next!.id, tab: 'gold', slot: 0, count: 2 }))
        .statusCode,
    ).toBe(200)
    expect((await bag()).reduce((sum, item) => sum + item.count, 0)).toBe(4)
  })
})

describe('stock instance and currency fidelity', () => {
  it('moves appraised properties intact when buying all', async () => {
    await seedStock()
    await db
      .update(characterShopStock)
      .set({ identifyCount: 1, appraised: true, props: [{ propId: 1001, value: 3000 }] })
      .where(eq(characterShopStock.characterId, characterId))
    await update({ stone: 10 })
    expect((await post('buy-all', { shopType: 1 })).statusCode).toBe(200)
    expect((await row()).stone).toBe(5)
    expect(await stock(1)).toHaveLength(0)
    expect(await bag()).toEqual([
      expect.objectContaining({
        canIdentify: true,
        identifyCount: 1,
        identifyTimes: 1,
        props: [{ propId: 1001, value: 3000 }],
      }),
    ])
  })
  it('keeps the original Stone price on Mystery Shop scrolls', async () => {
    await update({ stone: 2, gold: 0 })
    await client.get(`${base}/open`)
    const scroll = (await stock(2)).find((row) => row.itemId === 'i159000')!
    expect(scroll).toMatchObject({ priceStone: 1, priceGold: null })
    expect(
      (await post('buy', { shopType: 2, slot: scroll.slot, currency: 'gold' })).statusCode,
    ).toBe(400)
    expect(
      (await post('buy', { shopType: 2, slot: scroll.slot, currency: 'stone' })).statusCode,
    ).toBe(200)
    expect((await row()).stone).toBe(1)
  })
  it('allows stacking medicine in a full bag but refuses a new stack', async () => {
    await update({ stone: 10000 })
    await give('i160006', { bound: true, count: 99 })
    await db.insert(inventoryItems).values(
      Array.from({ length: BAG_CELLS - 1 }, () => ({
        characterId,
        itemId: 'i160001',
        count: 999,
      })),
    )
    expect((await post('wholesale/buy', { itemId: 'i160006', count: 1 })).statusCode).toBe(200)
    expect((await post('wholesale/buy', { itemId: 'i160006', count: 1 })).statusCode).toBe(400)
    expect((await row()).stone).toBe(9962)
  })
})

describe('shop tab selection', () => {
  it('accepts the Mystery tab while returning the whole shop window', async () => {
    const response = await client.get(`${base}/open?tab=2`)
    expect(response.statusCode).toBe(200)
    expect(response.json().tabs).toHaveLength(3)
    expect((await client.get(`${base}/open?tab=99`)).statusCode).toBe(400)
  })
})

describe('shop scene check', () => {
  it('refuses every shop action outside a scene with a shop NPC', async () => {
    await update({ sceneId: 2101, stone: 10000, gold: 1000 })
    const medicine = await give('i160006', { bound: true, count: 5 })
    const refused = [
      await client.get(`${base}/open`),
      await post('wholesale/buy', { itemId: 'i160006', count: 1 }),
      await post('refresh', { shopType: 1, mode: 'instant' }),
      await post('buy', { shopType: 1, slot: 0, currency: 'stone' }),
      await post('buy-all', { shopType: 1 }),
      await post('sell', { inventoryId: medicine.id, count: 1 }),
      await post('sell-all', { inventoryIds: [medicine.id] }),
      await post('pouches/refill', { currency: 'gold', hp: 1000, mp: 0 }),
    ]
    for (const response of refused) {
      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('not_here')
    }
    expect((await row()).stone).toBe(10000)
    expect((await bag())[0]!.count).toBe(5)
  })
})
