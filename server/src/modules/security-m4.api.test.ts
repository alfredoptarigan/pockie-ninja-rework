// M4 security review (docs/security-review-m4.md): one regression test per finding.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { inventoryItems, marketListings } from '../db/schema.js'
import { startJobs } from '../jobs.js'
import { arenaTestApp, type Ninja } from './arena/test-setup.js'
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
    const [item] = await db.select().from(inventoryItems)
    expect(item).toMatchObject({ characterId: a.id, location: 'warehouse' })
  })
})
