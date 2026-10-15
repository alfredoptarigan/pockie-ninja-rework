// M4 security review (docs/security-review-m4.md): one regression test per finding.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { blocks, inventoryItems, marketListings } from '../db/schema.js'
import { startJobs } from '../jobs.js'
import { arenaTestApp, errorCode, type Ninja } from './arena/test-setup.js'
import { MARKET_EXPIRY_INTERVAL_MS } from './market/market.js'

// Each test registers two ninjas (argon2), slow on a loaded machine.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let setup: ReturnType<typeof arenaTestApp>
let a: Ninja

beforeEach(async () => {
  await truncateAll(db)
  setup = arenaTestApp(db)
  a = await setup.ninja('Attacker')
})
afterEach(() => setup.app.close())
afterAll(() => close())

describe('the arena defence snapshot', () => {
  it('follows gear changes made after joining (no borrowed-gear or stale copy)', async () => {
    // Arrange: the defender joins wearing a weapon, then takes it off.
    const d = await setup.ninja('Defender')
    const [fists] = await db
      .insert(inventoryItems)
      .values({ characterId: d.id, itemId: 'i270100' })
      .returning()
    expect((await d.client.post(`/api/game/items/${fists!.id}/equip`)).statusCode).toBe(200)
    await a.join({ tier: 2, score: 100000 })
    await d.join({ tier: 2, score: 100000 })
    expect((await d.client.post(`/api/game/items/${fists!.id}/unequip`)).statusCode).toBe(200)
    await setup.aim(a, 0, d)

    // Act
    const response = await a.client.post('/api/game/arena/fight', { slot: 0 })

    // Assert: the defender fought as they are now, without the weapon.
    expect(response.statusCode).toBe(200)
    expect(response.json().looks[1]).toEqual({ clothing: 3 })
  })
})

describe('periodic jobs', () => {
  it('return an expired Market listing to the seller without anyone asking', async () => {
    // Arrange: a listing that ended an hour ago.
    const hour = 3_600_000
    const [row] = await db
      .insert(inventoryItems)
      .values({ characterId: a.id, itemId: 'i120001', location: 'market' })
      .returning()
    await db.insert(marketListings).values({
      sellerId: a.id,
      inventoryItemId: row!.id,
      category: '1_0_2',
      priceStone: 10,
      hours: 8,
      fee: 0,
      createdAt: new Date(Date.now() - 9 * hour),
      expiresAt: new Date(Date.now() - hour),
    })

    // Act: the server's job timers tick once.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const stop = startJobs(db, (error) => {
      throw error
    })
    vi.advanceTimersByTime(MARKET_EXPIRY_INTERVAL_MS)
    stop()
    vi.useRealTimers()

    // Assert
    await vi.waitFor(async () => expect(await db.select().from(marketListings)).toEqual([]), {
      timeout: 10_000,
    })
    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.location, 'warehouse'))
    expect(item).toMatchObject({ characterId: a.id, location: 'warehouse' })
  })
})

describe('races without findings', () => {
  it('two Honor shop buys at once spend the Honor once', async () => {
    // i292101 costs 180 Honor at tier 0; there is Honor for one.
    await a.join()
    await a.set({ honor: 200 })
    const buy = () => a.client.post('/api/game/arena/shop/buy', { itemId: 'i292101' })

    const responses = await Promise.all([buy(), buy()])

    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect(responses.map(errorCode)).toContain('no_honor')
    expect((await a.row()).honor).toBe(20)
    const items = await db.select().from(inventoryItems)
    expect(items.filter((row) => row.itemId === 'i292101')).toHaveLength(1)
  })

  it('two Market wallet claims at once pay the wallet once', async () => {
    await a.set({ level: 25, stone: 0, marketStone: 100 })
    const claim = () => a.client.post('/api/game/market/wallet/claim', {})

    const responses = await Promise.all([claim(), claim()])

    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect(responses.map(errorCode)).toContain('wallet_empty')
    expect(await a.row()).toMatchObject({ stone: 100, marketStone: 0 })
  })
})

describe('block bypasses without findings', () => {
  it('a block either way refuses a Ninjutsu Duel before any Gold or try is spent', async () => {
    const d = await setup.ninja('Defender')
    await a.join({ tier: 2 })
    await d.join({ tier: 2 })
    await db.insert(blocks).values({ ownerId: d.id, blockedId: a.id })

    const attack = await a.client.post('/api/game/arena/duel', { name: 'Defender' })
    const back = await d.client.post('/api/game/arena/duel', { name: 'Attacker' })

    expect([errorCode(attack), errorCode(back)]).toEqual(['blocked', 'blocked'])
    expect(attack.json().error.message).toBe(back.json().error.message)
    expect((await a.arena()).duelsUsed).toBe(0)
  })
})
