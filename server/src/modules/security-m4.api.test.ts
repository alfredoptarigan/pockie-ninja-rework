// M4 security review (docs/security-review-m4.md): one regression test per finding.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { inventoryItems } from '../db/schema.js'
import { arenaTestApp, type Ninja } from './arena/test-setup.js'

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
