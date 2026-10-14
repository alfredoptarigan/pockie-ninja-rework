import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest'
import { createRandom } from '@pockie/game-core'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters, characterPetTracing, inventoryItems } from '../../db/schema.js'
import { kennelRoutes } from './routes.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let id: string
let day = new Date('2026-10-14T23:59:00Z')
beforeEach(async () => {
  await truncateAll(db)
  day = new Date('2026-10-14T23:59:00Z')
  app = buildTestApp(db)
  app.register(kennelRoutes, {
    db,
    prefix: '/api/test/kennel',
    random: () => createRandom(42),
    now: () => day,
  })
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Player_one',
    email: 'player@example.com',
    password: 'believe-it',
  })
  id = (
    await client.post('/api/game/characters', {
      name: 'Ninja_01',
      gender: 0,
      clothing: 3,
      nation: 0,
    })
  ).json().character.id
  await db.update(characters).set({ level: 60, gold: 100 }).where(eq(characters.id, id))
})
afterEach(() => app.close())
afterAll(() => close())
const get = async (path = '/tracing') => (await client.get('/api/test/kennel' + path)).json()
const post = (path: string, body: object) => client.post('/api/test/kennel' + path, body)
const row = async () =>
  (await db.select().from(characterPetTracing).where(eq(characterPetTracing.characterId, id)))[0]!
const held = async (itemId: string) =>
  (
    await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.characterId, id), eq(inventoryItems.itemId, itemId)))
  ).reduce((n, r) => n + r.count, 0)
const give = (itemId: string, count: number) =>
  db.insert(inventoryItems).values({ characterId: id, itemId, count, bound: true })
async function target() {
  return (await row()).board!.petCell as number
}
it('keeps the target private; miss pays one and duplicate submissions spend only once', async () => {
  const view = await get()
  expect(view.cells).toEqual(Array(9).fill(null))
  expect(JSON.stringify(view)).not.toMatch(/petCell|seed|opened/)
  const cell = ((await target()) + 1) % 9
  const results = await Promise.all([
    post('/tracing/flip', { boardId: view.boardId, cell }),
    post('/tracing/flip', { boardId: view.boardId, cell }),
  ])
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400])
  expect((await get()).attemptsLeft).toBe(9)
  expect(await held('i150319')).toBe(1)
})
it('find pays ten, replaces board, and rejects a replay against the new board', async () => {
  const view = await get()
  const response = await post('/tracing/flip', { boardId: view.boardId, cell: await target() })
  expect(response.statusCode).toBe(200)
  expect(response.json().reward.feathers).toBe(10)
  expect(response.json().boardId).not.toBe(view.boardId)
  expect(await held('i150319')).toBe(10)
  expect((await post('/tracing/flip', { boardId: view.boardId, cell: 0 })).statusCode).toBe(400)
})
it('caps ten attempts, refills ten for ten Gold once, and lazily resets at UTC midnight', async () => {
  for (let i = 0; i < 10; i++) {
    const v = await get()
    expect(
      (await post('/tracing/flip', { boardId: v.boardId, cell: await target() })).statusCode,
    ).toBe(200)
  }
  let v = await get()
  expect(v.attemptsLeft).toBe(0)
  expect((await post('/tracing/flip', { boardId: v.boardId, cell: 0 })).json().error.code).toBe(
    'no_attempts',
  )
  expect((await post('/tracing/buy', { currency: 'gold' })).json().attemptsLeft).toBe(10)
  expect((await post('/tracing/buy', { currency: 'gold' })).statusCode).toBe(400)
  expect((await db.select().from(characters).where(eq(characters.id, id)))[0]!.gold).toBe(90)
  for (let i = 0; i < 10; i++) {
    const current = await get()
    expect(
      (await post('/tracing/flip', { boardId: current.boardId, cell: await target() })).statusCode,
    ).toBe(200)
  }
  v = await get()
  expect(v.attemptsLeft).toBe(0)
  expect((await post('/tracing/flip', { boardId: v.boardId, cell: 0 })).json().error.code).toBe(
    'no_attempts',
  )
  day = new Date('2026-10-15T00:00:00Z')
  v = await get()
  expect(v).toMatchObject({ attemptsLeft: 10, canBuy: true })
})
it('gates tracing at level twenty and refuses an unaffordable refill', async () => {
  await db.update(characters).set({ level: 19 }).where(eq(characters.id, id))
  expect((await client.get('/api/test/kennel/tracing')).statusCode).toBe(400)
  await db.update(characters).set({ level: 20, gold: 9 }).where(eq(characters.id, id))
  expect((await post('/tracing/buy', { currency: 'gold' })).statusCode).toBe(400)
  expect((await get()).canBuy).toBe(true)
})
it('spends Feathers atomically under concurrent purchases and enforces daily limits', async () => {
  await give('i150319', 21)
  const results = await Promise.all([
    post('/shop/buy', { itemId: 'i170114', count: 20 }),
    post('/shop/buy', { itemId: 'i170114', count: 20 }),
  ])
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400])
  expect(await held('i150319')).toBe(1)
  expect(await held('i170114')).toBe(20)
  expect((await post('/shop/buy', { itemId: 'i170114', count: 1 })).json().error.code).toBe(
    'daily_limit',
  )
  day = new Date('2026-10-15T00:00:00Z')
  expect((await post('/shop/buy', { itemId: 'i170114', count: 1 })).statusCode).toBe(200)
  expect((await post('/shop/buy', { itemId: 'i170117', count: 1 })).json().error.code).toBe(
    'not_enough_items',
  )
})
it('checks shop level and rolls back spending when the bag is full', async () => {
  await give('i150319', 100)
  await db.update(characters).set({ level: 8 }).where(eq(characters.id, id))
  expect((await post('/shop/buy', { itemId: 'i170120', count: 1 })).json().error.code).toBe(
    'too_low',
  )
  await db
    .insert(inventoryItems)
    .values(
      Array.from({ length: 119 }, () => ({ characterId: id, itemId: 'i100001', bound: true })),
    )
  expect((await post('/shop/buy', { itemId: 'i170114', count: 1 })).json().error.code).toBe(
    'bag_full',
  )
  expect(await held('i150319')).toBe(100)
  expect((await get('/shop')).offers[0].purchased).toBe(0)
})

it('seeded pet reward keeps the find and attempt intact when the bag cannot hold the pet', async () => {
  const view = await get()
  // Seed 0's second roll is below 5%; the first roll generates the board.
  let seed = 0
  for (; ; seed++) {
    const r = createRandom(seed)
    r.int(9)
    if (r.next() < 0.05) break
  }
  await db
    .update(characterPetTracing)
    .set({ board: { ...(await row()).board, seed, petCell: 0, opened: [] } })
    .where(eq(characterPetTracing.characterId, id))
  await give('i150319', 1)
  await db
    .insert(inventoryItems)
    .values(
      Array.from({ length: 119 }, () => ({ characterId: id, itemId: 'i100001', bound: true })),
    )
  expect((await post('/tracing/flip', { boardId: view.boardId, cell: 0 })).json().error.code).toBe(
    'bag_full',
  )
  expect((await get()).attemptsLeft).toBe(10)
  expect(await held('i150319')).toBe(1)
  const fillers = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.characterId, id), eq(inventoryItems.itemId, 'i100001')))
  for (const filler of fillers.slice(0, 10))
    await db.delete(inventoryItems).where(eq(inventoryItems.id, filler.id))
  const result = await post('/tracing/flip', { boardId: view.boardId, cell: 0 })
  expect(result.statusCode, JSON.stringify(result.json())).toBe(200)
  expect(result.json().reward.petItem).toMatch(/^i\d{6}$/)
  expect(await held(result.json().reward.petItem)).toBeGreaterThan(0)
})
it('concurrent distinct misses each consume one attempt', async () => {
  const view = await get()
  const cells = Array.from({ length: 9 }, (_, i) => i)
  const pet = await target()
  const misses = cells.filter((i) => i !== pet).slice(0, 2)
  const results = await Promise.all(
    misses.map((cell) => post('/tracing/flip', { boardId: view.boardId, cell })),
  )
  expect(results.map((r) => r.statusCode)).toEqual([200, 200])
  expect((await get()).attemptsLeft).toBe(8)
  expect(await held('i150319')).toBe(2)
})

it('serializes different shop offers against the same Feather balance', async () => {
  await give('i150319', 3)
  const results = await Promise.all(
    ['i170117', 'i170116'].map((itemId) => post('/shop/buy', { itemId, count: 1 })),
  )
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400])
  expect(await held('i150319')).toBe(0)
  expect((await held('i170117')) + (await held('i170116'))).toBe(1)
})
