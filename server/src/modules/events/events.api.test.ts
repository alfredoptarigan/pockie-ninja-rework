import { eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  characterBuffs,
  characterDailyLogin,
  characterWeeklyRewards,
  characters,
  inventoryItems,
} from '../../db/schema.js'
import { eventsRoutes } from './routes.js'
import { buffBonuses } from '../../game/nonfight-buffs.js'
import { recordWeeklyActivity, type WeeklyActivity } from './weekly-activity.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let id: string
let now: Date
let random: number
// The app registers the routes at /api/game/events; this copy injects the clock and dice.
const path = '/api/test/events'
const claim = (route: string) => client.post(`${path}/${route}`)
const board = async () => (await client.get(path)).json()
const row = async () => (await db.select().from(characters).where(eq(characters.id, id)))[0]!
const set = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, id))
const activity = (value: WeeklyActivity) =>
  db.transaction((tx) => recordWeeklyActivity(tx, id, value, now))
beforeEach(async () => {
  await truncateAll(db)
  now = new Date('2026-10-12T12:00:00Z')
  random = 0.5
  app = buildTestApp(db)
  app.register(eventsRoutes, { db, now: () => now, random: () => random, prefix: path })
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Events_player',
    email: 'events@example.com',
    password: 'believe-it',
  })
  id = (
    await client.post('/api/game/characters', {
      name: 'Events_ninja',
      gender: 0,
      clothing: 3,
      nation: 0,
    })
  ).json().character.id
})
afterEach(async () => {
  await app.close()
})
afterAll(close)

describe('events rewards', () => {
  it('requires authentication', async () => {
    expect((await app.inject(path)).statusCode).toBe(401)
  })
  it('does not rewrite the character on every poll, only when the day changes', async () => {
    const version = async () =>
      (
        (await db.execute(sql`select xmin from characters where id = ${id}`)) as { xmin: string }[]
      )[0]!.xmin
    await board()
    const first = await version()
    await board()
    expect(await version()).toBe(first)
    now = new Date('2026-10-13T00:00:01Z')
    await board()
    expect(await version()).not.toBe(first)
  })
  it('claims the first login item once, including concurrent requests', async () => {
    const results = await Promise.all([claim('login/claim'), claim('login/claim')])
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400])
    const items = await db.select().from(inventoryItems).where(eq(inventoryItems.characterId, id))
    expect(
      items.filter((item) => item.itemId === 'i150117').reduce((sum, item) => sum + item.count, 0),
    ).toBe(1)
    expect((await board()).login.completedDays).toBe(1)
  })
  it('refuses a full bag and preserves the login claim', async () => {
    await db
      .insert(inventoryItems)
      .values(Array.from({ length: 150 }, () => ({ characterId: id, itemId: 'i260100' })))
    const response = await claim('login/claim')
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('bag_full')
    expect((await board()).login.canClaim).toBe(true)
    await db.delete(inventoryItems).where(eq(inventoryItems.characterId, id))
    expect((await claim('login/claim')).statusCode).toBe(200)
  })
  it('advances only on claims, wraps the seventh day, and claims the daily bonus once', async () => {
    await db
      .insert(characterDailyLogin)
      .values({ characterId: id, completedDays: 6, claimDay: '2026-10-10' })
    expect((await board()).login.nextDay).toBe(7)
    expect((await claim('login/claim')).statusCode).toBe(200)
    expect((await claim('login/bonus')).statusCode).toBe(200)
    expect((await claim('login/bonus')).statusCode).toBe(400)
    now = new Date('2026-10-14T00:00:00Z')
    expect((await board()).login.nextDay).toBe(1)
    expect((await claim('login/claim')).statusCode).toBe(200)
    expect((await board()).login.completedDays).toBe(8)
  })
  it('resets weekly progress at Monday 00:00 UTC', async () => {
    now = new Date('2026-10-11T23:59:59.999Z')
    await activity('tollGate')
    expect((await board()).weekly).toMatchObject({ week: '2026-10-05', points: 50 })
    now = new Date('2026-10-12T00:00:00Z')
    expect((await board()).weekly).toMatchObject({ week: '2026-10-12', points: 0 })
    expect((await claim('weekly/milestone/50')).statusCode).toBe(400)
  })
  it('uses proportional whole activity points and caps each counter', async () => {
    await activity('pubFight')
    await activity('duelFriend')
    expect((await board()).weekly.points).toBe(19)
    for (let index = 0; index < 3; index++) await activity('pubFight')
    expect((await board()).weekly.counters.pubFight).toBe(3)
    expect((await board()).weekly.points).toBe(53)
  })
  it("labels the weekly tasks with Reborn's names where the task is the same", async () => {
    const labels = (await board()).weekly.activities.map((entry: { id: string; label: string }) => [
      entry.id,
      entry.label,
    ])
    expect(Object.fromEntries(labels)).toEqual({
      arenaDuel: 'Duel in Arena',
      duelFriend: 'Duel a friend',
      tollGate: 'Toll Gate',
      pubFight: 'Pub Fight',
      lasNoches: 'Las Noches',
      twentyMinReward: '20 Min Reward',
      globalChat: 'Global Chat',
      mission: 'Complete Mission',
    })
  })
  it('claims milestones once and serializes claims', async () => {
    await activity('tollGate')
    const results = await Promise.all([claim('weekly/milestone/50'), claim('weekly/milestone/50')])
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400])
    expect((await claim('weekly/milestone/100')).statusCode).toBe(400)
  })
  it('pays the 200-point Gold milestone once under concurrency', async () => {
    await db.insert(characterWeeklyRewards).values({
      characterId: id,
      week: '2026-10-12',
      counters: {
        arenaDuel: 5,
        duelFriend: 3,
        tollGate: 1,
        pubFight: 3,
        lasNoches: 10,
        twentyMinReward: 3,
        globalChat: 1,
        mission: 1,
      },
    })
    const before = (await row()).gold
    const results = await Promise.all([
      claim('weekly/milestone/200'),
      claim('weekly/milestone/200'),
    ])
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400])
    expect((await row()).gold).toBe(before + 10)
    expect((await board()).weekly.points).toBe(245)
  })
  it('requires 50 points and the matching weekday, and pays the seven-day bonus once', async () => {
    expect((await claim('weekly/weekday/1')).statusCode).toBe(400)
    await activity('tollGate')
    expect((await claim('weekly/weekday/2')).statusCode).toBe(400)
    expect((await claim('weekly/bonus')).statusCode).toBe(400)
    for (let day = 1; day <= 7; day++) {
      now = new Date(`2026-10-${11 + day}T12:00:00Z`)
      expect((await claim(`weekly/weekday/${day}`)).statusCode).toBe(200)
      expect((await claim(`weekly/weekday/${day}`)).statusCode).toBe(400)
    }
    expect((await claim('weekly/bonus')).statusCode).toBe(200)
    expect((await claim('weekly/bonus')).statusCode).toBe(400)
  })
  it('rolls back weekly claim state when the bag is full', async () => {
    await activity('tollGate')
    await db
      .insert(inventoryItems)
      .values(Array.from({ length: 150 }, () => ({ characterId: id, itemId: 'i260100' })))
    expect((await claim('weekly/milestone/50')).json().error.code).toBe('bag_full')
    const [weekly] = await db
      .select()
      .from(characterWeeklyRewards)
      .where(eq(characterWeeklyRewards.characterId, id))
    expect(weekly!.claimedMilestones).toEqual([])
  })
  it('replenishes only at zero, costs 10000 Stone, and limits buys to one per day', async () => {
    await set({ stone: 20000 })
    expect((await claim('dice/replenish')).statusCode).toBe(400)
    expect((await row()).stone).toBe(20000)
    await set({ diceDay: '2026-10-12', diceUsed: 10 })
    expect((await claim('dice/roll')).statusCode).toBe(400)
    expect((await claim('dice/replenish')).statusCode).toBe(200)
    expect(await row()).toMatchObject({ stone: 10000, diceUsed: 0, diceBought: 1 })
    await set({ diceUsed: 10 })
    expect((await claim('dice/replenish')).statusCode).toBe(400)
    expect((await row()).stone).toBe(10000)
    now = new Date('2026-10-13T00:00:00Z')
    expect((await board()).dice).toMatchObject({ rollsLeft: 10, bought: 0 })
  })
  it('checks replenishment funds without consuming the buy', async () => {
    await set({ diceDay: '2026-10-12', diceUsed: 10, stone: 9999 })
    expect((await claim('dice/replenish')).statusCode).toBe(400)
    expect(await row()).toMatchObject({ stone: 9999, diceUsed: 10, diceBought: 0 })
  })
  it('clears only curses for 5000 Stone and preserves a curse on insufficient funds', async () => {
    await db.insert(characterBuffs).values({
      characterId: id,
      buffId: 80201,
      group: 80200,
      source: 'food',
      sourceId: 'dice',
      expiresAt: new Date('2026-10-13T00:00:00Z'),
    })
    await set({ stone: 4999 })
    expect((await claim('dice/clear')).statusCode).toBe(400)
    expect((await board()).dice.curse).toBe(true)
    await set({ stone: 5000 })
    expect((await claim('dice/clear')).statusCode).toBe(200)
    expect((await row()).stone).toBe(0)
    expect((await board()).dice.curse).toBe(false)
    expect((await claim('dice/clear')).statusCode).toBe(400)
  })
  it('serializes the last dice roll', async () => {
    await set({ diceDay: '2026-10-12', diceUsed: 9 })
    const results = await Promise.all([claim('dice/roll'), claim('dice/roll')])
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400])
    expect((await row()).diceUsed).toBe(10)
  })
  it('applies the seeded blessing through the non-fight buff replacement group', async () => {
    random = 0.99
    expect((await claim('dice/roll')).statusCode).toBe(200)
    const buffs = await db.select().from(characterBuffs).where(eq(characterBuffs.characterId, id))
    expect(buffs).toContainEqual(
      expect.objectContaining({
        buffId: 80102,
        group: 3,
        expiresAt: new Date('2026-10-12T18:00:00Z'),
      }),
    )
    expect(await buffBonuses(db, id, now)).toMatchObject({
      tough: 465,
      dodge: 358,
      parry: 358,
      hit: 358,
      pierce: 358,
      crit: 358,
      neglectDefense: 358,
      defense: 358,
    })
  })
  it('enforces the twenty-minute cooldown and six claims per UTC day', async () => {
    const before = (await row()).giftCoupon
    for (let index = 0; index < 6; index++) {
      expect((await claim('twenty-minute/claim')).statusCode).toBe(200)
      expect((await claim('twenty-minute/claim')).statusCode).toBe(400)
      now = new Date(now.getTime() + 20 * 60 * 1000)
    }
    expect((await claim('twenty-minute/claim')).statusCode).toBe(400)
    expect(await row()).toMatchObject({ giftCoupon: before + 60, twentyMinCount: 6 })
    now = new Date('2026-10-13T00:00:00Z')
    expect((await claim('twenty-minute/claim')).statusCode).toBe(200)
    expect((await row()).twentyMinCount).toBe(1)
  })
  it('refuses before the exact cooldown boundary and rewards a concurrent claim once', async () => {
    await set({ twentyMinAt: now, twentyMinDay: '2026-10-12', twentyMinCount: 1 })
    now = new Date(now.getTime() + 20 * 60 * 1000 - 1)
    expect((await claim('twenty-minute/claim')).statusCode).toBe(400)
    now = new Date(now.getTime() + 1)
    const before = (await row()).giftCoupon
    const results = await Promise.all([claim('twenty-minute/claim'), claim('twenty-minute/claim')])
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400])
    expect((await row()).giftCoupon).toBe(before + 10)
  })
})
