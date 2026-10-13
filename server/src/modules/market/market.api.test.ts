import { CURRENCY_CAP } from '../../../../game-core/src/economy/market.js'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  characters,
  inventoryItems,
  mails,
  marketAudit,
  marketListings,
  marketWarehouse,
} from '../../db/schema.js'
import { bagFits } from '../../game/bag.js'
import { expireListings } from './market.js'
import marketRoutes from './routes.js'

const { db, close } = createTestDb()
// Many DB round trips per test (listings, buys, sweeps); keep them clear of the 5 s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
// Registered under a test prefix so the coordinator's app.ts wiring cannot collide with it.
const base = '/api/test/market'
const FOOD = 'i120001' // CanTrade 2, MartType 1_0_2, stacks to 20, 1 cell
const BLADE = 'i250101' // equipment, CanTrade 3, MartType 0_0_0, 6 cells
const NPC_ONLY = 'i150259' // CanTrade 1
const NO_CATEGORY = 'i100004' // CanTrade 2, no MartType
const twoProps = [
  { propId: 1, value: 1 },
  { propId: 2, value: 2 },
]

let app: ReturnType<typeof buildTestApp>
let seller: Player
let buyer: Player
let third: Player

interface Player {
  client: Client
  id: string
}

// Registering hashes a password (slow), so the three ninjas are created once; every test gets a
// fresh app (fresh rate limits) and clean Market, item and mail tables.
const accounts = new Map<string, { id: string; cookies: string }>()

async function register(name: string) {
  const client = new Client(app)
  await client.post('/api/auth/register', {
    username: `user_${name}`,
    email: `${name.toLowerCase()}@example.com`,
    password: 'believe-it',
  })
  const response = await client.post('/api/game/characters', {
    name,
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  accounts.set(name, { id: response.json().character.id, cookies: client.cookieHeader })
}

function signIn(name: string): Player {
  const { id, cookies } = accounts.get(name)!
  const client = new Client(app)
  for (const pair of cookies.split('; ')) {
    const [key, value] = pair.split('=') as [string, string]
    client.setCookie(key, value)
  }
  return { client, id }
}

beforeAll(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  for (const name of ['Seller', 'Buyer', 'Third']) await register(name)
  await app.close()
}, 60_000)

beforeEach(async () => {
  await db.execute(
    sql`truncate table market_listings, market_warehouse, market_audit, mails, inventory_items cascade`,
  )
  await db.update(characters).set({
    level: 25,
    stone: 10_000,
    gold: 1_000,
    marketStone: 0,
    marketGold: 0,
  })
  app = buildTestApp(db)
  app.register(marketRoutes, { db, prefix: base })
  seller = signIn('Seller')
  buyer = signIn('Buyer')
  third = signIn('Third')
})
afterEach(() => app.close())
afterAll(() => close())

const update = (id: string, values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, id))
const char = async (id: string) =>
  (await db.select().from(characters).where(eq(characters.id, id)))[0]!
const give = async (
  characterId: string,
  itemId: string,
  extra: Partial<typeof inventoryItems.$inferInsert> = {},
) =>
  (
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId, ...extra })
      .returning()
  )[0]!
const itemRow = async (id: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]
const warehouse = (ownerId: string) =>
  db
    .select()
    .from(marketWarehouse)
    .innerJoin(inventoryItems, eq(inventoryItems.id, marketWarehouse.inventoryItemId))
    .where(eq(marketWarehouse.ownerId, ownerId))
const mailsOf = (id: string) =>
  db.select().from(mails).where(eq(mails.recipientId, id)).orderBy(mails.createdAt)
const post = (p: Player, path: string, body: object = {}) => p.client.post(`${base}/${path}`, body)
const get = (p: Player, path: string) => p.client.get(`${base}/${path}`)

async function list(
  p: Player,
  itemId = FOOD,
  options: {
    count?: number
    stack?: number
    priceStone?: number | null
    priceGold?: number | null
    hours?: number
  } = {},
) {
  const row = await give(p.id, itemId, {
    count: options.stack ?? options.count ?? 1,
    ...(itemId === BLADE && { props: twoProps, identifyCount: 2 }),
  })
  const response = await post(p, 'list', {
    inventoryId: row.id,
    count: options.count ?? 1,
    priceStone: options.priceStone === undefined ? 100 : options.priceStone,
    priceGold: options.priceGold ?? null,
    hours: options.hours ?? 8,
  })
  expect(response.statusCode, response.body).toBe(200)
  return { row, listingId: response.json().listing.id as string }
}

describe('Market access', () => {
  it('requires login and level 25', async () => {
    expect((await new Client(app).get(`${base}/browse`)).statusCode).toBe(401)
    await update(buyer.id, { level: 24 })
    const response = await get(buyer, 'browse')
    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('market_level')
  })
})

describe('listing', () => {
  it('charges the fee, moves the item out of the bag and audits the listing', async () => {
    const { row, listingId } = await list(seller, FOOD, { stack: 5, count: 5, hours: 12 })
    expect((await char(seller.id)).stone).toBe(10_000 - 225)
    expect((await itemRow(row.id))!.location).toBe('market')
    const inventory = (await seller.client.get('/api/game/inventory')).json().items
    expect(inventory).toEqual([])
    const [listing] = await db.select().from(marketListings)
    expect(listing).toMatchObject({
      id: listingId,
      hours: 12,
      fee: 225,
      priceStone: 100,
      category: '1_0_2',
    })
    const [audit] = await db.select().from(marketAudit)
    expect(audit).toMatchObject({ action: 'list', characterId: seller.id, count: 5, fee: 225 })
  })

  it('splits a stack when listing part of it', async () => {
    const { row } = await list(seller, FOOD, { stack: 20, count: 7 })
    expect((await itemRow(row.id))!).toMatchObject({ location: 'bag', count: 13 })
    const [listing] = await db.select().from(marketListings)
    expect((await itemRow(listing!.inventoryItemId))!).toMatchObject({
      location: 'market',
      count: 7,
    })
  })

  it('a listed item no longer counts in the bag', async () => {
    await list(seller, BLADE, { priceStone: 5 })
    for (let n = 0; n < 19; n++) await give(seller.id, BLADE) // 114 of 120 cells
    // Another 6-cell blade fits only if the listed one takes no cells.
    await db.transaction(async (tx) => {
      expect(await bagFits(tx, seller.id, [{ itemId: BLADE, bound: false }])).toBe(true)
    })
  })

  it.each([
    ['bound', FOOD, { bound: true }, 'bound'],
    ['equipped', BLADE, { equippedSlot: 'weapon', props: twoProps }, 'equipped'],
    ['NPC-only', NPC_ONLY, {}, 'not_tradable'],
    ['uncategorised', NO_CATEGORY, {}, 'no_category'],
    [
      'one-property equipment',
      BLADE,
      { props: twoProps.slice(0, 1), identifyCount: 1 },
      'needs_properties',
    ],
    ['unidentified equipment', BLADE, { canIdentify: true, identifyCount: 2 }, 'needs_properties'],
    ['warehoused', FOOD, { location: 'warehouse' as const }, 'no_item'],
  ])('refuses a %s item', async (_, itemId, extra, code) => {
    const row = await give(seller.id, itemId, extra)
    const response = await post(seller, 'list', {
      inventoryId: row.id,
      count: 1,
      priceStone: 10,
      hours: 8,
    })
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(response.json().error.code).toBe(code)
    expect((await char(seller.id)).stone).toBe(10_000)
  })

  it("refuses another ninja's item", async () => {
    const row = await give(buyer.id, FOOD)
    const response = await post(seller, 'list', {
      inventoryId: row.id,
      count: 1,
      priceStone: 10,
      hours: 8,
    })
    expect(response.json().error.code).toBe('no_item')
  })

  it('lists equipment with two properties under its quality category', async () => {
    await list(seller, BLADE, { priceStone: null, priceGold: 50 })
    const [listing] = await db.select().from(marketListings)
    expect(listing).toMatchObject({ category: '0_0_0_1', priceStone: null, priceGold: 50 })
  })

  it('refuses a missing price, a price over 1,000,000, a bad duration and too many units', async () => {
    const row = await give(seller.id, FOOD, { count: 2 })
    for (const body of [
      { priceStone: null, priceGold: null, hours: 8, count: 1 },
      { priceStone: 1_000_001, hours: 8, count: 1 },
      { priceStone: 10, hours: 6, count: 1 },
      { priceStone: 10, hours: 8, count: 3 },
    ]) {
      const response = await post(seller, 'list', { inventoryId: row.id, ...body })
      expect(response.statusCode).toBe(400)
    }
  })

  it('refuses when the fee is not affordable', async () => {
    await update(seller.id, { stone: 149 })
    const row = await give(seller.id, FOOD)
    const response = await post(seller, 'list', {
      inventoryId: row.id,
      count: 1,
      priceStone: 10,
      hours: 8,
    })
    expect(response.json().error.code).toBe('no_stone')
    expect((await itemRow(row.id))!.location).toBe('bag')
  })

  it('allows at most 5 active listings', async () => {
    for (let n = 0; n < 5; n++) await list(seller)
    const row = await give(seller.id, FOOD)
    const response = await post(seller, 'list', {
      inventoryId: row.id,
      count: 1,
      priceStone: 10,
      hours: 8,
    })
    expect(response.json().error.code).toBe('too_many_listings')
  })
})

describe('buying', () => {
  it('sells part of a stack: the buyer pays every price, the seller wallet gets 90%', async () => {
    const { listingId } = await list(seller, FOOD, {
      stack: 10,
      count: 10,
      priceStone: 100,
      priceGold: 3,
    })
    const response = await post(buyer, 'buy', { listingId, count: 4 })
    expect(response.statusCode, response.body).toBe(200)
    expect(await char(buyer.id)).toMatchObject({ stone: 10_000 - 400, gold: 1_000 - 12 })
    expect(await char(seller.id)).toMatchObject({ marketStone: 360, marketGold: 10 })
    const [listing] = await db.select().from(marketListings)
    expect((await itemRow(listing!.inventoryItemId))!.count).toBe(6)
    const rows = await warehouse(buyer.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.inventory_items).toMatchObject({
      characterId: buyer.id,
      itemId: FOOD,
      count: 4,
      location: 'warehouse',
    })
    expect(rows[0]!.market_warehouse.source).toBe(0)
    expect((await mailsOf(seller.id)).map((m) => [m.templateKey, m.params])).toEqual([
      ['market_sold', { buyer: 'Buyer', itemId: FOOD, count: 4, left: 6, stone: 360, gold: 10 }],
    ])
    expect((await mailsOf(buyer.id)).map((m) => [m.templateKey, m.category])).toEqual([
      ['market_bought', 'market'],
    ])
    const audit = await db.select().from(marketAudit).where(eq(marketAudit.action, 'buy'))
    expect(audit[0]).toMatchObject({
      characterId: buyer.id,
      counterpartyId: seller.id,
      count: 4,
      stone: 400,
      gold: 12,
      taxStone: 40,
      taxGold: 2,
    })
  })

  it('moves the listed row itself to the buyer on a sell-out, keeping its instance state', async () => {
    const { row, listingId } = await list(seller, BLADE, { priceStone: 1 })
    await db.update(inventoryItems).set({ enhanceLevel: 7 }).where(eq(inventoryItems.id, row.id))
    expect((await post(buyer, 'buy', { listingId, count: 1 })).statusCode).toBe(200)
    expect(await itemRow(row.id)).toMatchObject({
      characterId: buyer.id,
      location: 'warehouse',
      enhanceLevel: 7,
    })
    expect(await db.select().from(marketListings)).toEqual([])
    // The minimum payout is 1 even after the tax.
    expect((await char(seller.id)).marketStone).toBe(1)
    expect((await mailsOf(seller.id))[0]!.templateKey).toBe('market_sold_out')
  })

  it('refuses to buy your own listing', async () => {
    const { listingId } = await list(seller)
    const response = await post(seller, 'buy', { listingId, count: 1 })
    expect(response.json().error.code).toBe('own_listing')
  })

  it('refuses more units than listed and a buyer who cannot pay', async () => {
    const { listingId } = await list(seller, FOOD, { stack: 2, count: 2, priceStone: 6_000 })
    expect((await post(buyer, 'buy', { listingId, count: 3 })).json().error.code).toBe(
      'invalid_count',
    )
    expect((await post(buyer, 'buy', { listingId, count: 2 })).json().error.code).toBe('no_stone')
    expect((await char(buyer.id)).stone).toBe(10_000)
  })

  it('refuses a buy when the warehouse holds 15 rows', async () => {
    const { listingId } = await list(seller)
    for (let n = 0; n < 15; n++) {
      const row = await give(buyer.id, FOOD, { location: 'warehouse' })
      await db
        .insert(marketWarehouse)
        .values({ inventoryItemId: row.id, ownerId: buyer.id, source: 0 })
    }
    const response = await post(buyer, 'buy', { listingId, count: 1 })
    expect(response.json().error.code).toBe('warehouse_full')
    expect((await char(buyer.id)).stone).toBe(10_000)
  })

  it('lets exactly one of two racing buyers take the last unit', async () => {
    const { listingId } = await list(seller, FOOD, { priceStone: 500 })
    const results = await Promise.all([
      post(buyer, 'buy', { listingId, count: 1 }),
      post(third, 'buy', { listingId, count: 1 }),
    ])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404])
    const spent = (await char(buyer.id)).stone + (await char(third.id)).stone
    expect(spent).toBe(20_000 - 500)
    const owned = await db
      .select()
      .from(marketWarehouse)
      .where(sql`${marketWarehouse.ownerId} in (${buyer.id}, ${third.id})`)
    expect(owned).toHaveLength(1)
    expect((await char(seller.id)).marketStone).toBe(450)
  })

  it('refuses an expired listing, and a buy racing the sweep has one outcome', async () => {
    const { listingId } = await list(seller)
    await db
      .update(marketListings)
      .set({ expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 2000) })
    expect((await post(buyer, 'buy', { listingId, count: 1 })).json().error.code).toBe(
      'listing_gone',
    )

    const second = await list(seller)
    const at = new Date(Date.now() + 9 * 3600 * 1000)
    await db
      .update(marketListings)
      .set({ expiresAt: new Date(Date.now() + 50) })
      .where(eq(marketListings.id, second.listingId))
    const [buy, swept] = await Promise.all([
      post(buyer, 'buy', { listingId: second.listingId, count: 1 }),
      expireListings(db, at),
    ])
    const item = (await itemRow(second.row.id))!
    if (buy.statusCode === 200) expect(item.characterId).toBe(buyer.id)
    else expect(item).toMatchObject({ characterId: seller.id, location: 'warehouse' })
    expect(swept + (buy.statusCode === 200 ? 1 : 0)).toBeGreaterThanOrEqual(1)
    expect(await db.select().from(marketListings)).toEqual([])
  })
})

describe('expiry sweep', () => {
  it('returns expired items to the seller warehouse with a mail, once', async () => {
    const { row } = await list(seller, FOOD, { stack: 3, count: 3 })
    const later = new Date(Date.now() + 9 * 3600 * 1000)
    expect(await expireListings(db, later)).toBe(1)
    expect(await expireListings(db, later)).toBe(0)
    expect(await itemRow(row.id)).toMatchObject({ location: 'warehouse', characterId: seller.id })
    expect((await warehouse(seller.id))[0]!.market_warehouse.source).toBe(1)
    expect((await mailsOf(seller.id)).map((m) => [m.templateKey, m.params])).toEqual([
      ['market_expired', { itemId: FOOD, count: 3 }],
    ])
    const audit = await db.select().from(marketAudit).where(eq(marketAudit.action, 'expire'))
    expect(audit).toHaveLength(1)
  })

  it('leaves live listings alone', async () => {
    await list(seller)
    expect(await expireListings(db, new Date())).toBe(0)
    expect(await db.select().from(marketListings)).toHaveLength(1)
  })
})

describe('cancel', () => {
  it('returns what is left after a partial sale to the warehouse', async () => {
    const { row, listingId } = await list(seller, FOOD, { stack: 5, count: 5 })
    await post(buyer, 'buy', { listingId, count: 2 })
    const response = await post(seller, 'cancel', { listingId })
    expect(response.statusCode, response.body).toBe(200)
    expect(await itemRow(row.id)).toMatchObject({ location: 'warehouse', count: 3 })
    expect(await db.select().from(marketListings)).toEqual([])
    expect((await char(seller.id)).stone).toBe(10_000 - 150) // the fee is not refunded
    expect((await post(buyer, 'buy', { listingId, count: 1 })).statusCode).toBe(404)
  })

  it("refuses another ninja's listing", async () => {
    const { listingId } = await list(seller)
    expect((await post(buyer, 'cancel', { listingId })).statusCode).toBe(404)
  })
})

describe('warehouse and wallet claims', () => {
  async function stored(ownerId: string, itemId: string, count = 1) {
    const row = await give(ownerId, itemId, { count, location: 'warehouse' })
    await db.insert(marketWarehouse).values({ inventoryItemId: row.id, ownerId, source: 0 })
    return row
  }

  it('claims one item into the bag', async () => {
    const row = await stored(buyer.id, FOOD, 4)
    const response = await post(buyer, 'warehouse/claim', { inventoryId: row.id })
    expect(response.statusCode, response.body).toBe(200)
    expect(await itemRow(row.id)).toMatchObject({ location: 'bag', count: 4 })
    expect(await warehouse(buyer.id)).toEqual([])
    const audit = await db.select().from(marketAudit).where(eq(marketAudit.action, 'claim_item'))
    expect(audit).toHaveLength(1)
  })

  it('refuses a single claim with a full bag and claims only what fits when claiming all', async () => {
    for (let n = 0; n < 19; n++) await give(buyer.id, BLADE) // 114 cells
    for (let n = 0; n < 5; n++) await give(buyer.id, NO_CATEGORY) // 119 cells
    const blade = await stored(buyer.id, BLADE)
    const food = await stored(buyer.id, FOOD)
    const single = await post(buyer, 'warehouse/claim', { inventoryId: blade.id })
    expect(single.json().error.code).toBe('bag_full')
    const all = await post(buyer, 'warehouse/claim', {})
    expect(all.statusCode).toBe(200)
    expect(all.json()).toMatchObject({ claimed: 1, left: 1 })
    expect((await itemRow(food.id))!.location).toBe('bag')
    expect((await itemRow(blade.id))!.location).toBe('warehouse')
  })

  it("cannot claim another ninja's warehouse row", async () => {
    const row = await stored(seller.id, FOOD)
    expect((await post(buyer, 'warehouse/claim', { inventoryId: row.id })).statusCode).toBe(404)
  })

  it('claims the wallet up to the currency cap and keeps the rest', async () => {
    await update(seller.id, { stone: CURRENCY_CAP - 100, marketStone: 500, marketGold: 7 })
    const response = await post(seller, 'wallet/claim')
    expect(response.statusCode).toBe(200)
    expect(await char(seller.id)).toMatchObject({
      stone: CURRENCY_CAP,
      marketStone: 400,
      gold: 1_007,
      marketGold: 0,
    })
    expect((await post(seller, 'wallet/claim')).json().error.code).toBe('currency_cap')
    const audit = await db.select().from(marketAudit).where(eq(marketAudit.action, 'claim_wallet'))
    expect(audit[0]).toMatchObject({ stone: 100, gold: 7 })
  })

  it('refuses an empty wallet claim', async () => {
    expect((await post(seller, 'wallet/claim')).json().error.code).toBe('wallet_empty')
  })

  it('shows the warehouse rows and the wallet', async () => {
    await stored(buyer.id, FOOD, 2)
    await update(buyer.id, { marketGold: 9 })
    const view = (await get(buyer, 'warehouse')).json()
    expect(view).toMatchObject({ capacity: 15, wallet: { stone: 0, gold: 9 } })
    expect(view.items).toEqual([expect.objectContaining({ itemId: FOOD, count: 2, source: 0 })])
  })
})

describe('browsing', () => {
  it('filters by category prefix and item ids, sorts by price and pages by 8', async () => {
    for (let n = 0; n < 5; n++) await list(seller, FOOD, { priceStone: 100 + n })
    for (let n = 0; n < 5; n++) await list(third, FOOD, { priceStone: 200 + n })
    await list(buyer, BLADE, { priceStone: 50 })
    await db
      .update(marketListings)
      .set({ expiresAt: new Date(Date.now() - 1), createdAt: new Date(Date.now() - 1000) })
      .where(and(eq(marketListings.sellerId, third.id), eq(marketListings.priceStone, 204)))

    const first = (await get(buyer, 'browse?category=1&sort=stone&order=desc')).json()
    expect(first).toMatchObject({ total: 9, pages: 2, page: 1 })
    expect(first.listings).toHaveLength(8)
    expect(first.listings[0]).toMatchObject({ priceStone: 203, sellerName: 'Third', mine: false })
    const second = (await get(buyer, 'browse?category=1&sort=stone&order=desc&page=2')).json()
    expect(second.listings.map((l: { priceStone: number }) => l.priceStone)).toEqual([100])

    const weapons = (await get(seller, `browse?category=0_0`)).json()
    expect(weapons.listings).toEqual([expect.objectContaining({ itemId: BLADE })])
    const search = (await get(seller, `browse?itemIds=${BLADE},i1`)).json()
    expect(search.total).toBe(1)
    expect((await get(seller, 'browse?category=1_0_')).statusCode).toBe(400)
  })

  it('shows my listings with fees and the sellable bag items', async () => {
    await list(seller)
    await give(seller.id, FOOD, { count: 3 })
    await give(seller.id, NPC_ONLY)
    const view = (await get(seller, 'mine')).json()
    expect(view.listings).toEqual([expect.objectContaining({ itemId: FOOD, expired: false })])
    expect(view.fees).toEqual({ '8': 150, '12': 225, '24': 450 })
    expect(view.maxListings).toBe(5)
    expect(view.sellable).toEqual([expect.objectContaining({ itemId: FOOD, count: 3 })])
  })
})
