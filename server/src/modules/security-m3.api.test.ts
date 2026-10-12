// M3 security review (docs/security-review-m3.md): one regression test per finding, plus race
// checks for the routes that spend or grant currency and items.
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../test/helpers.js'
import {
  characters,
  inventoryItems,
  mysticItemSales,
  mysticSpawns,
  tollGateRuns,
  type TollGateCard,
} from '../db/schema.js'
import { errorCode, setUpNinja } from './gates/test-setup.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>
const WEAPON = 'i270100'

beforeEach(async () => {
  await truncateAll(db)
  await db.delete(mysticSpawns)
  await db.delete(mysticItemSales)
  ninja = await setUpNinja(db)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const run = async () =>
  (await db.select().from(tollGateRuns).where(eq(tollGateRuns.characterId, ninja.characterId)))[0]
const total = (rows: { count: number }[]) => rows.reduce((sum, row) => sum + row.count, 0)

describe('toll gate fights', () => {
  it('refuse a defeated ninja and keep the run (no free revive through a lost duel)', async () => {
    // Arrange: a run in progress, then the ninja is defeated elsewhere (0 HP).
    await ninja.give(WEAPON, { equippedSlot: 'Weapon' })
    await ninja.ready(20)
    expect((await ninja.client.post('/api/game/gates/enter', { gateId: 100001 })).statusCode).toBe(
      200,
    )
    await ninja.set({ hp: 0, exp: 50 })

    // Act
    const response = await ninja.client.post('/api/game/gates/run/fight')

    // Assert: the revive (and its EXP loss) is still owed; the run waits.
    expect(errorCode(response)).toBe('no_hp')
    expect(await ninja.row()).toMatchObject({ hp: 0, exp: 50 })
    expect(await run()).toBeDefined()
  })
})

describe('card flip races', () => {
  const cards = (): TollGateCard[] =>
    Array.from({ length: 5 }, () => ({ itemId: 'i150168', count: 1, bound: true, revealed: false }))

  it('two peeks at the same card charge once', async () => {
    await db.insert(tollGateRuns).values({
      characterId: ninja.characterId,
      gateId: 100001,
      subGate: 2,
      point: 0,
      passedPoint: 9,
      cardState: 1,
      cards: cards(),
    })
    await ninja.set({ gold: 100 })
    const peek = () => ninja.client.post('/api/game/gates/cards/peek', { index: 2 })

    const responses = await Promise.all([peek(), peek()])

    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect(responses.map(errorCode)).toContain('card_revealed')
    expect((await run())!.peeks).toBe(1)
    // LookCap0 of gate 100001 is 15 Gold.
    expect((await ninja.row()).gold).toBe(100 - 15)
  })
})

describe('forge appraise-all', () => {
  it('charges a repeated item id once', async () => {
    const fists = await ninja.give(WEAPON, { canIdentify: true, identifyCount: 2 })
    await ninja.set({ stone: 100 })

    const response = await ninja.client.post('/api/game/forge/appraise-all', {
      itemIds: [fists.id, fists.id, fists.id],
    })

    // Level 1 appraisal costs 12 Stone (forge.api.test.ts).
    expect(response.statusCode).toBe(200)
    expect(response.json().appraised).toEqual([fists.id])
    expect((await ninja.row()).stone).toBe(100 - 12)
  })
})

describe('daily quest routes', () => {
  it('answer an out-of-range quest id with 400, not a database error', async () => {
    await ninja.set({ sceneId: 2601, level: 20 })
    for (const action of ['accept', 'hand-in']) {
      const response = await ninja.client.post(`/api/game/daily/99999999999/${action}`)
      expect(response.statusCode).toBe(400)
    }
  })
})

describe('Mysterious Merchant stock', () => {
  it('sells the last unit to only one of two ninjas buying at once', async () => {
    // Arrange: a live spawn in 2601 with one unit left, two rich ninjas standing there.
    const now = Date.now()
    const [spawn] = await db
      .insert(mysticSpawns)
      .values({
        sceneId: 2601,
        startsAt: new Date(now - 60_000),
        endsAt: new Date(now + 600_000),
        stock: [{ itemId: 'i150168', price: 1, maxCount: 5, left: 1 }],
      })
      .returning()
    const other = buildTestApp(db)
    const second = new Client(other)
    try {
      await second.post('/api/auth/register', {
        username: 'Player_two',
        email: 'two@example.com',
        password: 'believe-it',
      })
      await second.post('/api/game/characters', {
        name: 'Ninja_02',
        gender: 0,
        clothing: 3,
        nation: 0,
      })
      await db.update(characters).set({ sceneId: 2601, level: 60, gold: 100 })
      const buy = (client: Client) =>
        client.post('/api/game/shop/merchant/buy', { spawnId: spawn!.id, slot: 0, count: 1 })

      // Act
      const responses = await Promise.all([buy(ninja.client), buy(second)])

      // Assert
      expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
      expect(responses.map(errorCode)).toContain('stock_empty')
      const sold = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.itemId, 'i150168'))
      expect(total(sold)).toBe(1)
      const [after] = await db.select().from(mysticSpawns).where(eq(mysticSpawns.id, spawn!.id))
      expect(after!.stock[0]!.left).toBe(0)
      const [{ gold }] = (await db.execute(
        sql`select sum(gold)::int as gold from characters`,
      )) as unknown as [{ gold: number }]
      expect(gold).toBe(199)
    } finally {
      await other.close()
    }
  })
})

describe('wholesale buy', () => {
  it('sells at most one stack per purchase, like the original client', async () => {
    // i160006: 38 Stone, stacks to 100 (box 1001).
    await ninja.set({ stone: 1_000_000 })
    const buy = (count: number) =>
      ninja.client.post('/api/game/shop/wholesale/buy', { itemId: 'i160006', count })

    expect(errorCode(await buy(101))).toBe('invalid_count')
    expect((await buy(100)).statusCode).toBe(200)
    const bought = await db
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.characterId, ninja.characterId),
          eq(inventoryItems.itemId, 'i160006'),
        ),
      )
    expect(total(bought)).toBe(100)
    expect((await ninja.row()).stone).toBe(1_000_000 - 3800)
  })
})
