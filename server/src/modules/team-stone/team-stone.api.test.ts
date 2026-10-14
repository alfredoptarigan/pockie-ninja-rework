// Team Stone (M5 task 14): queue gate, attempts spent at the fight, bot fill, weekly pay, monthly
// reset and the BC shop under concurrency.
import { eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  inventoryItems,
  mails,
  teamStoneMatches,
  teamStonePlayers,
  teamStoneQueue,
} from '../../db/schema.js'
import { arenaHonorShop } from '../../game/data.js'
import { arenaTestApp, errorCode, today, type Ninja } from '../arena/test-setup.js'
import { matchTeamStone, payTeamStoneWeek, resetTeamStoneMonth } from './routes.js'
import { monthStart, weekStart } from './store.js'

// Each test registers several ninjas (argon2), slow on a loaded machine.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 60_000 })

const BASE = '/api/game/team-stone'
const DAY_MS = 86_400_000
const { db, close } = createTestDb()
let setup: ReturnType<typeof arenaTestApp>

beforeEach(async () => {
  await truncateAll(db)
  await db.execute(sql`truncate table team_stone_matches cascade`)
  setup = arenaTestApp(db)
})
afterEach(() => setup.app.close())
afterAll(() => close())

const ninja = async (name: string, level = 60) => {
  const n = await setup.ninja(name)
  await n.set({ level })
  return n
}
const state = async (n: Ninja) => (await n.client.get(BASE)).json()
const queue = (n: Ninja) => n.client.post(`${BASE}/queue`)
const player = async (n: { id: string }) =>
  (await db.select().from(teamStonePlayers).where(eq(teamStonePlayers.characterId, n.id)))[0]
const setPlayer = (n: { id: string }, values: Partial<typeof teamStonePlayers.$inferInsert>) =>
  db
    .insert(teamStonePlayers)
    .values({ characterId: n.id, ...values })
    .onConflictDoUpdate({ target: teamStonePlayers.characterId, set: values })
/** Moves a queue entry past the 30 s bot fill. */
const waitedLong = (n: Ninja) =>
  db
    .update(teamStoneQueue)
    .set({ queuedAt: new Date(Date.now() - 31_000) })
    .where(eq(teamStoneQueue.characterId, n.id))
/** Level-60 arena ninjas (with a defence snapshot) usable as bots. */
async function bots(count: number, score = 0) {
  const made = []
  for (let i = 0; i < count; i++) {
    const n = await ninja(`Bot_${score}_${i}`)
    await n.join()
    if (score) await setPlayer(n, { score, month: monthStart(new Date()) })
    made.push(n)
  }
  return made
}

describe('queue', () => {
  it('refuses a ninja below level 50 and accepts one at 50', async () => {
    const low = await ninja('Low_one', 49)
    const response = await queue(low)
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('too_low')

    await low.set({ level: 50 })
    expect((await queue(low)).statusCode).toBe(200)
    expect(errorCode(await queue(low))).toBe('already_queued')
    expect((await state(low)).queue).not.toBeNull()
  })

  it('refuses a ninja with no attempts left today', async () => {
    const a = await ninja('Tired_one')
    await setPlayer(a, { attemptsDay: today(), attemptsUsed: 25 })
    expect(errorCode(await queue(a))).toBe('no_attempts')
  })
})

describe('attempts', () => {
  it('are spent only when the fight starts, not on queueing or leaving', async () => {
    const a = await ninja('Fighter')
    await bots(5)
    await queue(a)
    expect((await state(a)).attemptsUsed).toBe(0)
    await a.client.post(`${BASE}/queue/leave`)
    expect((await state(a)).queue).toBeNull()
    await queue(a)
    // Not waited long enough: no fight, no attempt.
    expect(await matchTeamStone(db)).toEqual([])
    expect((await state(a)).attemptsUsed).toBe(0)

    await waitedLong(a)
    const started = await matchTeamStone(db)
    expect(started).toHaveLength(1)
    const view = await state(a)
    expect(view.attemptsUsed).toBe(1)
    expect(view.queue).toBeNull()
    expect(view.playedThisWeek).toBe(true)
    expect(view.history).toHaveLength(1)
    expect(Math.abs(view.history[0].delta)).toBeGreaterThanOrEqual(18)
    expect(view.score).toBe(Math.max(0, view.history[0].delta))

    const replay = await a.client.get(`${BASE}/matches/${started[0]}`)
    expect(replay.json()).toMatchObject({ side: 0 })
    expect(replay.json().looks).toHaveLength(6)
  })
})

describe('bot fill', () => {
  it('never seats a queued ninja as a bot or twice', async () => {
    const a = await ninja('Seeker')
    // Held in a running match: queued, so never a bot, though its score is the closest.
    const held = await ninja('Held_one')
    await held.join()
    const [running] = await db
      .insert(teamStoneMatches)
      .values({ teamA: [held.id, held.id, held.id], teamB: [held.id, held.id, held.id] })
      .returning()
    await db
      .insert(teamStoneQueue)
      .values({ characterId: held.id, score: 0, power: 1, matchId: running!.id })
    await bots(5, 1000)

    await queue(a)
    await waitedLong(a)
    const [id] = await matchTeamStone(db)
    const [match] = await db.select().from(teamStoneMatches).where(eq(teamStoneMatches.id, id!))
    const seats = [...match!.teamA, ...match!.teamB]
    expect(new Set(seats).size).toBe(6)
    expect(seats).toContain(a.id)
    expect(seats).not.toContain(held.id)
    // The held ninja keeps its queue entry; the matched one leaves the queue.
    const left = await db.select().from(teamStoneQueue)
    expect(left.map((q) => q.characterId)).toEqual([held.id])
  })

  it('refuses a bot that joined the queue after the job read it', async () => {
    const a = await ninja('Racer')
    const [late] = await bots(5)
    await queue(a)
    await waitedLong(a)
    const transaction = db.transaction.bind(db)
    vi.spyOn(db, 'transaction').mockImplementationOnce(async (run) => {
      await db.insert(teamStoneQueue).values({ characterId: late!.id, score: 0, power: 1 })
      return transaction(run)
    })
    expect(await matchTeamStone(db)).toEqual([])
    vi.restoreAllMocks()
    expect((await state(a)).attemptsUsed).toBe(0)
    expect(await db.select().from(teamStoneMatches)).toHaveLength(0)
  })

  it('treats a score from a past month as 0 when picking bots', async () => {
    const a = await ninja('Fresh_one')
    const stale = await bots(5)
    const lastMonth = monthStart(new Date(Date.UTC(2020, 0, 1)))
    for (const n of stale) await setPlayer(n, { score: 1000, month: lastMonth })
    // Registration allows 10 ninjas per test: 1 queued, 5 stale, 4 current.
    for (let i = 0; i < 4; i++) {
      const n = await ninja(`Current_${i}`)
      await n.join()
      await setPlayer(n, { score: 500, month: monthStart(new Date()) })
    }
    await queue(a)
    await waitedLong(a)
    const [id] = await matchTeamStone(db)
    const [match] = await db.select().from(teamStoneMatches).where(eq(teamStoneMatches.id, id!))
    const seats = [...match!.teamA, ...match!.teamB]
    expect(seats.filter((s) => stale.some((n) => n.id === s))).toHaveLength(5)
  })

  it('stores the clamped score change', async () => {
    const a = await ninja('Floor_one')
    // Picked nearest score 0 first, so these two sit on the queued ninja's side, weakened.
    for (const n of await bots(2)) await n.weaken()
    for (const n of await bots(3, 10)) {
      const snapshot = (await n.arena()).snapshot as { fighter: Record<string, unknown> }
      const fighter = { ...snapshot.fighter, hp: 1e9, maxHp: 1e9, minAttack: 1e6, maxAttack: 1e6 }
      await n.setArena({ snapshot: { ...snapshot, fighter } })
    }
    await queue(a)
    await waitedLong(a)
    await matchTeamStone(db)
    const view = await state(a)
    expect(view.score).toBe(0)
    expect(view.history[0]).toMatchObject({ won: false, delta: 0 })
  })

  it('waits when there are not enough arena ninjas', async () => {
    const a = await ninja('Lonely')
    await bots(2)
    await queue(a)
    await waitedLong(a)
    expect(await matchTeamStone(db)).toEqual([])
    expect((await state(a)).attemptsUsed).toBe(0)
  })
})

describe('weekly pay and monthly reset', () => {
  const now = new Date()
  const lastWeek = weekStart(new Date(now.getTime() - 7 * DAY_MS))
  const bc = async (n: Ninja) => (await n.row()).battleCoins
  const mailsOf = (n: Ninja) => db.select().from(mails).where(eq(mails.recipientId, n.id))

  it('pays once, only ninjas who fought that week', async () => {
    const played = await ninja('Played')
    const idle = await ninja('Idle_one')
    const month = monthStart(now)
    await setPlayer(played, { score: 350, week: lastWeek, playedThisWeek: true, month })
    await setPlayer(idle, { score: 350, week: lastWeek, playedThisWeek: false, month })

    expect(await payTeamStoneWeek(db, now)).toBe(1)
    expect(await payTeamStoneWeek(db, now)).toBe(0)
    expect(await bc(played)).toBe(500)
    expect(await bc(idle)).toBe(0)
    const [mail] = await mailsOf(played)
    expect(mail).toMatchObject({ templateKey: 'team_stone_weekly' })
    expect(mail!.params).toMatchObject({ league: 'bronze', battleCoins: 500 })
    expect(await mailsOf(idle)).toHaveLength(0)
    expect(await player(played)).toMatchObject({ playedThisWeek: false, score: 350 })
  })

  it('pays a week that straddles the month change with the score it had', async () => {
    const a = await ninja('Straddler')
    const lastMonth = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)))
    await setPlayer(a, { score: 350, month: lastMonth, week: weekStart(now), playedThisWeek: true })
    expect(await resetTeamStoneMonth(db, now)).toBe(1)
    expect(await player(a)).toMatchObject({ score: 0, playedThisWeek: false })
    expect(await bc(a)).toBe(500)
    expect(await payTeamStoneWeek(db, new Date(now.getTime() + 7 * DAY_MS))).toBe(0)
    expect(await bc(a)).toBe(500)
  })

  it('pays a week split by the month change once, even after more fights that week', async () => {
    const a = await ninja('Splitter')
    const lastMonth = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)))
    await setPlayer(a, { score: 350, month: lastMonth, week: weekStart(now), playedThisWeek: true })
    expect(await resetTeamStoneMonth(db, now)).toBe(1)
    expect(await bc(a)).toBe(500)
    // A fight later in the same week (what matchmaking writes after settling).
    await setPlayer(a, { score: 20, playedThisWeek: true })

    const nextWeek = new Date(now.getTime() + 7 * DAY_MS)
    await Promise.all([payTeamStoneWeek(db, nextWeek), payTeamStoneWeek(db, nextWeek)])
    expect(await bc(a)).toBe(500)
    expect(await mailsOf(a)).toHaveLength(1)
    expect(await player(a)).toMatchObject({ playedThisWeek: false, week: weekStart(nextWeek) })
  })

  it('pays once under concurrent weekly job runs', async () => {
    const a = await ninja('Racer')
    await setPlayer(a, { score: 350, week: lastWeek, playedThisWeek: true, month: monthStart(now) })
    await Promise.all([payTeamStoneWeek(db, now), payTeamStoneWeek(db, now)])
    expect(await bc(a)).toBe(500)
    expect(await mailsOf(a)).toHaveLength(1)
  })

  it('resets every score from a past month to 0', async () => {
    const a = await ninja('Veteran')
    const lastMonth = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)))
    await setPlayer(a, { score: 900, month: lastMonth, week: weekStart(now) })
    expect(await resetTeamStoneMonth(db, now)).toBe(1)
    expect(await player(a)).toMatchObject({ score: 0, month: monthStart(now) })
    expect(await resetTeamStoneMonth(db, now)).toBe(0)
  })
})

describe('BC shop', () => {
  it('spends Battle Coins atomically under concurrent buys', async () => {
    const a = await ninja('Shopper')
    const [itemId, offer] = Object.entries(arenaHonorShop())[0]!
    await a.set({ battleCoins: offer.honor })
    const buy = () => a.client.post(`${BASE}/shop/buy`, { itemId })
    const results = await Promise.all([buy(), buy(), buy()])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400, 400])
    expect(results.filter((r) => r.statusCode === 400).map(errorCode)).toEqual([
      'no_battle_coins',
      'no_battle_coins',
    ])
    expect(await a.row()).toMatchObject({ battleCoins: 0 })
    const items = await db.select().from(inventoryItems).where(eq(inventoryItems.characterId, a.id))
    expect(items.filter((i) => i.itemId === itemId)).toHaveLength(1)
  })
})
