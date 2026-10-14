// Tailed Beast (M5 task 13, decision 27): tickets, the shared HP pool, boxes, Kage and the shop.
import { and, eq } from 'drizzle-orm'
import type { TailedBeastView } from '../../../../shared/src/schemas/tailed-beast.js'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  characters,
  inventoryItems,
  tailedBeastKages,
  tailedBeastPlayers,
  tailedBeastPools,
  users,
} from '../../db/schema.js'
import { weekStart } from '../rankings/toll-gate-weekly.js'
import { tailedBeastWeeklyReset, todayBeasts } from './routes.js'

// A geared-up ninja: an ungeared level 60 falls to the beast before it lands a hit.
vi.mock('../../game/combat.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../game/combat.js')>()
  return {
    ...original,
    playerFighter: async (...args: Parameters<typeof original.playerFighter>) => ({
      ...(await original.playerFighter(...args)),
      maxHp: 1_000_000,
      minAttack: 50_000,
      maxAttack: 60_000,
      hit: 10_000,
    }),
  }
})

const { db, close } = createTestDb()
let t: Awaited<ReturnType<typeof setUp>>

const DAY = 24 * 3600 * 1000
const week = () => weekStart(new Date())
const lastWeek = () => weekStart(new Date(Date.now() - 7 * DAY))
const today = () => new Date().toISOString().slice(0, 10)
const [beastA, beastB] = todayBeasts()

type CharacterValues = Partial<typeof characters.$inferInsert>
const errorCode = (response: { json: () => { error?: { code: string } } }) =>
  response.json().error?.code

/** The app (app.ts registers the routes), a ninja and extra ninjas. */
async function setUp() {
  const app = buildTestApp(db)
  const client = new Client(app)
  const join = async (to: Client, username: string, name: string, nation: number) => {
    await to.post('/api/auth/register', {
      username,
      email: `${username.toLowerCase()}@example.com`,
      password: 'believe-it',
    })
    const created = await to.post('/api/game/characters', { name, gender: 0, clothing: 3, nation })
    return created.json().character.id as string
  }
  const me = await join(client, 'Player_one', 'Ninja_01', 0)
  const set = (values: CharacterValues, id = me) =>
    db.update(characters).set(values).where(eq(characters.id, id))
  const [template] = await db.select().from(characters).where(eq(characters.id, me))
  let made = 0
  /** Inserts ninjas `Rank_<n>` straight into the database; returns their ids in order. */
  const addNinjas = async (list: CharacterValues[]) => {
    const names = list.map((_, i) => `Rank_${made + i}`)
    made += list.length
    const userRows = await db
      .insert(users)
      .values(
        names.map((n) => ({
          username: n,
          email: `${n.toLowerCase()}@example.com`,
          passwordHash: 'x',
        })),
      )
      .returning({ id: users.id })
    const rows = await db
      .insert(characters)
      .values(
        list.map((values, i) => ({
          userId: userRows[i]!.id,
          name: names[i]!,
          gender: 0,
          nation: 1,
          clothing: template!.clothing,
          sceneId: template!.sceneId,
          avatarId: template!.avatarId,
          hp: 1,
          mp: 1,
          ...values,
        })),
      )
      .returning({ id: characters.id })
    return rows.map((r) => r.id)
  }
  return { app, client, me, set, addNinjas, join }
}

beforeEach(async () => {
  await truncateAll(db)
  t = await setUp()
  await t.set({ level: 60, hp: 999_999, mp: 999_999 })
})
afterEach(() => t.app.close())
afterAll(() => close())

const view = async () => {
  const response = await t.client.get('/api/game/tailed-beast')
  expect(response.statusCode).toBe(200)
  return response.json<TailedBeastView>()
}
const fight = (beast = beastA, mode = 0) =>
  t.client.post('/api/game/tailed-beast/fight', { beast, mode })
const player = async (id = t.me) =>
  (
    await db
      .select()
      .from(tailedBeastPlayers)
      .where(and(eq(tailedBeastPlayers.week, week()), eq(tailedBeastPlayers.characterId, id)))
  )[0]
const setPlayer = (values: Partial<typeof tailedBeastPlayers.$inferInsert>, id = t.me) =>
  db
    .insert(tailedBeastPlayers)
    .values({ week: week(), characterId: id, village: 0, ...values })
    .onConflictDoUpdate({
      target: [tailedBeastPlayers.week, tailedBeastPlayers.characterId],
      set: values,
    })
const pool = async (beast = beastA, mode = 0) =>
  (
    await db
      .select()
      .from(tailedBeastPools)
      .where(
        and(
          eq(tailedBeastPools.week, week()),
          eq(tailedBeastPools.beast, beast),
          eq(tailedBeastPools.mode, mode),
        ),
      )
  )[0]
const bag = (itemId: string) =>
  db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.characterId, t.me), eq(inventoryItems.itemId, itemId)))

describe('GET /api/game/tailed-beast', () => {
  it('shows today\u2019s two beasts with three full pools each', async () => {
    const data = await view()
    expect(data.week).toBe(week())
    expect(data.beasts.map((b) => b.id)).toEqual([beastA, beastB])
    expect(data.beasts[0]!.pools.map((p) => [p.mode, p.ticketCost, p.hpLeft])).toEqual([
      [0, 1, 750_000_000],
      [1, 3, 1_000_000_000],
      [2, 5, 1_250_000_000],
    ])
    expect(data.tickets).toEqual({ used: 0, perDay: 10 })
    expect(data.me).toMatchObject({ honor: 0, essence: 0, fights: 0, village: 0 })
    expect(data.boxes.map((b) => [b.fights, b.ready])).toEqual([
      [5, false],
      [10, false],
      [20, false],
    ])
  })
})

describe('POST /api/game/tailed-beast/fight', () => {
  it('refuses a beast that is not out today', async () => {
    const other = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((b) => b !== beastA && b !== beastB)!
    const response = await fight(other)
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('not_today')
  })

  it.each([
    [0, 1],
    [1, 3],
    [2, 5],
  ])('mode %i costs %i tickets and records damage, Honor and Essence', async (mode, cost) => {
    const response = await fight(beastA, mode)
    expect(response.statusCode).toBe(200)
    const result = response.json()
    expect(result.damage).toBeGreaterThan(0)
    expect(result.honor).toBe(Math.floor(result.damage / 100_000))
    expect(await player()).toMatchObject({
      ticketDay: today(),
      ticketsUsed: cost,
      fights: 1,
      honor: result.honor,
      essence: result.honor,
      village: 0,
    })
    const pools = [0, 1, 2].map((m) => [750_000_000, 1_000_000_000, 1_250_000_000][m]!)
    expect((await pool(beastA, mode))!.hpLeft).toBe(pools[mode]! - result.damage)
  })

  it('refuses a fight the tickets left cannot pay and spends nothing', async () => {
    await setPlayer({ ticketDay: today(), ticketsUsed: 8 })
    const response = await fight(beastA, 1)
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('no_tickets')
    expect(await player()).toMatchObject({ ticketsUsed: 8, fights: 0 })
  })

  it('gives 10 fresh tickets on a new UTC day', async () => {
    await setPlayer({ ticketDay: '2020-01-01', ticketsUsed: 10 })
    expect((await view()).tickets.used).toBe(0)
    expect((await fight(beastA, 2)).statusCode).toBe(200)
    expect(await player()).toMatchObject({ ticketDay: today(), ticketsUsed: 5 })
  })

  it('refuses a defeated ninja', async () => {
    await t.set({ hp: 0 })
    expect(errorCode(await fight())).toBe('no_hp')
  })

  it('refuses a beast that is already dead', async () => {
    await db.insert(tailedBeastPools).values({ week: week(), beast: beastA, mode: 0, hpLeft: 0 })
    const response = await fight()
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('beast_dead')
    expect(await player()).toBeUndefined()
  })

  it('lets two fights racing on the last HP kill the beast exactly once', async () => {
    const second = new Client(t.app)
    const other = await t.join(second, 'Player_two', 'Ninja_02', 2)
    await t.set({ level: 60, hp: 999_999, mp: 999_999 }, other)
    await db.insert(tailedBeastPools).values({ week: week(), beast: beastA, mode: 0, hpLeft: 1 })
    const responses = await Promise.all([
      fight(),
      second.post('/api/game/tailed-beast/fight', { beast: beastA, mode: 0 }),
    ])
    const ok = responses.filter((r) => r.statusCode === 200)
    expect(ok).toHaveLength(1)
    expect(ok[0]!.json()).toMatchObject({ killed: true, damage: 1, honor: 0 })
    expect(errorCode(responses.find((r) => r.statusCode !== 200)!)).toBe('beast_dead')
    const after = (await pool())!
    expect(after.hpLeft).toBe(0)
    expect(after.killedAt).not.toBeNull()
    // Only the winner paid tickets and counted a fight.
    const rows = await db.select().from(tailedBeastPlayers)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ characterId: after.killedBy, fights: 1, ticketsUsed: 1 })
  })
})

describe('fight boxes', () => {
  const claim = (fights: number) => t.client.post('/api/game/tailed-beast/box', { fights })

  it('opens at the threshold, once', async () => {
    await setPlayer({ fights: 4 })
    expect(errorCode(await claim(5))).toBe('box_locked')
    await setPlayer({ fights: 10 })
    expect((await claim(5)).statusCode).toBe(200)
    expect(errorCode(await claim(5))).toBe('box_claimed')
    expect((await claim(10)).statusCode).toBe(200)
    expect(errorCode(await claim(20))).toBe('box_locked')
    expect((await bag('i500003'))[0]).toMatchObject({ count: 1 })
    expect((await bag('i500002'))[0]).toMatchObject({ count: 1 })
    expect((await player())!.boxesClaimed.toSorted()).toEqual([10, 5].toSorted())
  })

  it('pays one box under concurrent claims', async () => {
    await setPlayer({ fights: 5 })
    const responses = await Promise.all(Array.from({ length: 4 }, () => claim(5)))
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1)
    expect((await bag('i500003')).reduce((n, r) => n + r.count, 0)).toBe(1)
  })
})

describe('Kage', () => {
  const pick = (itemId = 'i159140') => t.client.post('/api/game/tailed-beast/kage', { itemId })

  it('names last week\u2019s top Honor per village and lets each Kage pick once', async () => {
    const [rival, other] = await t.addNinjas([{ nation: 0 }, { nation: 3 }])
    const last = lastWeek()
    await db.insert(tailedBeastPlayers).values([
      { week: last, characterId: t.me, village: 0, honor: 500 },
      { week: last, characterId: rival!, village: 0, honor: 400 },
      { week: last, characterId: other!, village: 3, honor: 10 },
    ])
    // Reading never writes: the weekly job names the Kages.
    expect((await view()).kages).toEqual([])
    expect(await db.select().from(tailedBeastKages)).toEqual([])
    await tailedBeastWeeklyReset(db)
    const data = await view()
    expect(data.kages.map((k) => [k.village, k.name, k.isMe])).toEqual([
      [0, 'Ninja_01', true],
      [3, 'Rank_1', false],
    ])
    expect(errorCode(await pick('i100'))).toBe('unknown_item')
    expect((await pick()).statusCode).toBe(200)
    expect(errorCode(await pick('i100004'))).toBe('kage_claimed')
    expect((await bag('i159140'))[0]).toMatchObject({ count: 1 })
    const [row] = await db
      .select()
      .from(tailedBeastKages)
      .where(and(eq(tailedBeastKages.week, last), eq(tailedBeastKages.village, 0)))
    expect(row).toMatchObject({ characterId: t.me, claimedItemId: 'i159140' })
  })

  it('refuses a ninja who is not a Kage', async () => {
    const [rival] = await t.addNinjas([{ nation: 0 }])
    await db
      .insert(tailedBeastPlayers)
      .values({ week: lastWeek(), characterId: rival!, village: 0, honor: 9 })
    expect(errorCode(await pick())).toBe('not_kage')
  })

  it('pays one pick under concurrent claims', async () => {
    await db
      .insert(tailedBeastPlayers)
      .values({ week: lastWeek(), characterId: t.me, village: 0, honor: 1 })
    const responses = await Promise.all([pick(), pick('i100004'), pick('i161007')])
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1)
  })
})

describe('Essence shop', () => {
  const buy = (itemId: string, count = 1) =>
    t.client.post('/api/game/tailed-beast/shop', { itemId, count })

  it('sells wings 218004-218008 and the +3 and +4 wing stones (M6 decision 26)', async () => {
    const shop = (await view()).shop
    const price = (itemId: string) => shop.find((o) => o.itemId === itemId)?.essence
    for (const wing of ['i218004', 'i218005', 'i218006', 'i218007', 'i218008'])
      expect(price(wing)).toBe(2000)
    expect(price('i218022')).toBe(300)
    expect(price('i218023')).toBe(600)
    await setPlayer({ essence: 2600 })
    expect((await buy('i218004')).statusCode).toBe(200)
    expect((await buy('i218023')).statusCode).toBe(200)
    expect(await player()).toMatchObject({ essence: 0 })
    expect((await bag('i218004'))[0]).toMatchObject({ count: 1, bound: true })
  })

  it('sells for Essence and keeps Honor', async () => {
    await setPlayer({ essence: 500, honor: 500 })
    const response = await buy('i540001')
    expect(response.statusCode).toBe(200)
    expect(await player()).toMatchObject({ essence: 200, honor: 500 })
    expect((await bag('i540001'))[0]).toMatchObject({ count: 1, bound: true })
  })

  it('refuses without enough Essence and spends nothing', async () => {
    await setPlayer({ essence: 159 })
    expect(errorCode(await buy('i161007', 2))).toBe('no_essence')
    expect((await player())!.essence).toBe(159)
    expect(await bag('i161007')).toEqual([])
  })

  it('sells the Level 10 Stone Bag up to 5 a week and nothing outside the list', async () => {
    await setPlayer({ essence: 10_000 })
    expect(errorCode(await buy('i100'))).toBe('unknown_item')
    expect((await buy('i150117', 3)).statusCode).toBe(200)
    expect(errorCode(await buy('i150117', 3))).toBe('limit_reached')
    expect((await buy('i150117', 2)).statusCode).toBe(200)
    expect(errorCode(await buy('i150117'))).toBe('limit_reached')
    expect(await player()).toMatchObject({ essence: 9_000, stoneBagsBought: 5 })
    expect((await bag('i150117')).reduce((n, r) => n + r.count, 0)).toBe(5)
    expect((await view()).shop.find((o) => o.itemId === 'i150117')!.available).toBe(false)
  })

  it('never sells more than 5 Stone Bags under concurrent buys', async () => {
    await setPlayer({ essence: 10_000 })
    const responses = await Promise.all(Array.from({ length: 4 }, () => buy('i150117', 2)))
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(2)
    expect(await player()).toMatchObject({ stoneBagsBought: 4 })
  })

  it('never overspends under concurrent buys', async () => {
    await setPlayer({ essence: 160 })
    const responses = await Promise.all(Array.from({ length: 4 }, () => buy('i161007')))
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(2)
    expect((await player())!.essence).toBe(0)
  })
})

describe('leaderboard and villages', () => {
  it('ranks the top 10 by Honor and sums Honor per village', async () => {
    const ids = await t.addNinjas(Array.from({ length: 11 }, (_, i) => ({ nation: i % 5 })))
    await db.insert(tailedBeastPlayers).values(
      ids.map((id, i) => ({
        week: week(),
        characterId: id,
        village: i % 5,
        honor: (i + 1) * 10,
      })),
    )
    const data = await view()
    expect(data.leaderboard).toHaveLength(10)
    expect(data.leaderboard[0]).toMatchObject({ place: 1, name: 'Rank_10', honor: 110 })
    expect(data.leaderboard[9]).toMatchObject({ place: 10, honor: 20 })
    expect(data.villages).toEqual([
      { village: 0, honor: 10 + 60 + 110 },
      { village: 1, honor: 20 + 70 },
      { village: 2, honor: 30 + 80 },
      { village: 3, honor: 40 + 90 },
      { village: 4, honor: 50 + 100 },
    ])
  })
})

describe('weekly rollover', () => {
  it('starts each week fresh: pools, Honor, Essence, tickets and boxes', async () => {
    const last = lastWeek()
    await db
      .insert(tailedBeastPools)
      .values({ week: last, beast: beastA, mode: 0, hpLeft: 0, killedAt: new Date() })
    await db.insert(tailedBeastPlayers).values({
      week: last,
      characterId: t.me,
      village: 0,
      honor: 50,
      essence: 999,
      fights: 20,
      ticketDay: today(),
      ticketsUsed: 10,
      boxesClaimed: [5, 10, 20],
    })
    const data = await view()
    expect(data.beasts[0]!.pools[0]!.hpLeft).toBe(750_000_000)
    expect(data.me).toMatchObject({ honor: 0, essence: 0, fights: 0 })
    expect(data.tickets.used).toBe(0)
    expect(data.boxes.every((b) => !b.claimed)).toBe(true)
  })

  it('the weekly reset names last week\u2019s Kages once and is idempotent', async () => {
    const [rival] = await t.addNinjas([{ nation: 0 }])
    await db.insert(tailedBeastPlayers).values([
      { week: lastWeek(), characterId: t.me, village: 0, honor: 5 },
      { week: lastWeek(), characterId: rival!, village: 0, honor: 5 },
    ])
    await tailedBeastWeeklyReset(db)
    await db.update(characters).set({ name: 'Renamed' }).where(eq(characters.id, t.me))
    await tailedBeastWeeklyReset(db)
    const rows = await db.select().from(tailedBeastKages)
    // Ties go to the lower character id.
    expect(rows).toEqual([
      expect.objectContaining({
        week: lastWeek(),
        village: 0,
        characterId: [t.me, rival].sort()[0],
      }),
    ])
  })
})
