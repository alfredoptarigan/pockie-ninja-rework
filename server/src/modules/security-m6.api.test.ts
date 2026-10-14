// M6 security review (docs/security-review-m6.md): one regression test per fixed finding, plus the
// concurrent requests the review checked on pets, Pet Tracing, wings and cards.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import {
  characterCards,
  characterPets,
  characterPetTracing,
  characterWingCollection,
  inventoryItems,
} from '../db/schema.js'
import { sealOdds } from '../game/data.js'
import { KILL_LOSS, wearEquipped } from '../game/gear.js'
import { arenaTestApp, errorCode, type Ninja } from './arena/test-setup.js'

// Each test registers a ninja (argon2), slow on a loaded machine.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let setup: ReturnType<typeof arenaTestApp>
let a: Ninja

beforeEach(async () => {
  await truncateAll(db)
  setup = arenaTestApp(db)
  a = await setup.ninja('Reviewer')
  await a.set({ level: 60 })
})
afterEach(() => setup.app.close())
afterAll(() => close())

const give = async (
  itemId: string,
  count = 1,
  extra: Partial<typeof inventoryItems.$inferInsert> = {},
) =>
  (
    await db
      .insert(inventoryItems)
      .values({ characterId: a.id, itemId, count, bound: true, ...extra })
      .returning()
  )[0]!
const held = async (itemId: string) =>
  (
    await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.characterId, a.id), eq(inventoryItems.itemId, itemId)))
  ).reduce((sum, row) => sum + row.count, 0)
const statuses = (responses: { statusCode: number }[]) =>
  responses.map((r) => r.statusCode).sort((x, y) => x - y)

describe('a worn wing', () => {
  it('keeps its durability through fight wear and can be worn again', async () => {
    // Arrange
    const wing = await give('i218000', 1, { equippedSlot: 'Wing' })

    // Act: a field win wears every equipped item by one.
    await db.transaction((tx) => wearEquipped(tx, a.id, () => KILL_LOSS))
    const off = await a.client.post(`/api/game/items/${wing.id}/unequip`)
    const on = await a.client.post(`/api/game/items/${wing.id}/equip`)

    // Assert
    expect(off.statusCode).toBe(200)
    expect(on.statusCode).toBe(200)
  })
})

describe('the forge', () => {
  it('refuses to inscribe a wing and keeps the Stone and seals', async () => {
    // Arrange
    const wing = await give('i218000')
    const seal = sealOdds().LowSeal
    await give(seal, 3)
    await a.set({ stone: 10_000 })

    // Act
    const response = await a.client.post('/api/game/forge/inscribe', {
      itemId: wing.id,
      seal: 'low',
      seals: 3,
    })

    // Assert
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('wrong_item')
    expect((await a.row()).stone).toBe(10_000)
    expect(await held(seal)).toBe(3)
  })
})

describe('concurrent M6 requests', () => {
  it('two enhances with one stone spend it once', async () => {
    const wing = await give('i218000')
    await give('i218020')

    const results = await Promise.all([
      a.client.post(`/api/game/wings/${wing.id}/enhance`, { stone: 'i218020' }),
      a.client.post(`/api/game/wings/${wing.id}/enhance`, { stone: 'i218020' }),
    ])

    expect(statuses(results)).toEqual([200, 400])
    expect(results.map(errorCode)).toContain('no_stone')
    const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, wing.id))
    // Level 0 -> 1 always succeeds; a second spend would show level 2.
    expect(row!.enhanceLevel).toBe(1)
    expect(await held('i218020')).toBe(0)
  })

  it('two Wing Collection registrations pay once', async () => {
    await give('i218000')

    const results = await Promise.all([
      a.client.post('/api/game/wings/collection/i218000'),
      a.client.post('/api/game/wings/collection/i218000'),
    ])

    expect(statuses(results)).toEqual([200, 409])
    expect(await held('i218021')).toBe(5)
    const rows = await db
      .select()
      .from(characterWingCollection)
      .where(eq(characterWingCollection.characterId, a.id))
    expect(rows).toHaveLength(1)
  })

  it('two card collection claims pay once', async () => {
    await db
      .insert(characterCards)
      .values([1, 2, 3, 4, 5, 6, 7].map((cardId) => ({ characterId: a.id, cardId, count: 1 })))

    const results = await Promise.all([
      a.client.post('/api/game/cards/collections/1/claim'),
      a.client.post('/api/game/cards/collections/1/claim'),
    ])

    expect(statuses(results)).toEqual([200, 400])
    expect(results.map(errorCode)).toContain('already_claimed')
    expect(await held('i218021')).toBe(3)
  })

  it('two uses of one pet item adopt one pet', async () => {
    await a.set({ petSlots: 3 })
    const pet = await give('i320002')

    const results = await Promise.all([
      a.client.post(`/api/game/items/${pet.id}/use`),
      a.client.post(`/api/game/items/${pet.id}/use`),
    ])

    expect(statuses(results)).toEqual([200, 404])
    const pets = await db.select().from(characterPets).where(eq(characterPets.characterId, a.id))
    expect(pets).toHaveLength(1)
    expect(await held('i320002')).toBe(0)
  })

  it('two kennel slot purchases with Gold for one buy one slot', async () => {
    await a.set({ gold: 100 })

    const results = await Promise.all([
      a.client.post('/api/game/pets/slots/unlock'),
      a.client.post('/api/game/pets/slots/unlock'),
    ])

    expect(statuses(results)).toEqual([200, 400])
    const row = await a.row()
    expect(row.petSlots).toBe(2)
    expect(row.gold).toBe(0)
  })

  it('two flips on the last attempt use it once', async () => {
    const view = (await a.client.get('/api/game/kennel/tracing')).json()
    await db
      .update(characterPetTracing)
      .set({ attemptsUsed: 9 })
      .where(eq(characterPetTracing.characterId, a.id))
    const [state] = await db
      .select()
      .from(characterPetTracing)
      .where(eq(characterPetTracing.characterId, a.id))
    const petCell = (state!.board as { petCell: number }).petCell
    const [first, second] = [1, 2].map((step) => (petCell + step) % 9)

    const results = await Promise.all([
      a.client.post('/api/game/kennel/tracing/flip', { boardId: view.boardId, cell: first }),
      a.client.post('/api/game/kennel/tracing/flip', { boardId: view.boardId, cell: second }),
    ])

    expect(statuses(results)).toEqual([200, 400])
    expect(results.map(errorCode)).toContain('no_attempts')
    expect(await held('i150319')).toBe(1)
  })

  it('no Pet Tracing response carries the pet cell or the board seed', async () => {
    await a.set({ gold: 10 })
    const view = (await a.client.get('/api/game/kennel/tracing')).json()
    const [state] = await db
      .select()
      .from(characterPetTracing)
      .where(eq(characterPetTracing.characterId, a.id))
    const petCell = (state!.board as { petCell: number }).petCell

    const miss = await a.client.post('/api/game/kennel/tracing/flip', {
      boardId: view.boardId,
      cell: (petCell + 1) % 9,
    })
    const bought = await a.client.post('/api/game/kennel/tracing/buy', { currency: 'gold' })

    for (const body of [view, miss.json(), bought.json()]) {
      expect(JSON.stringify(body)).not.toMatch(/petCell|seed|opened/)
      expect(Object.keys(body).sort()).toEqual(
        expect.arrayContaining(['attemptsLeft', 'boardId', 'canBuy', 'cells', 'feathers']),
      )
    }
  })
})
