import type { TollGateClaimResult, TollGateRanking } from '@pockie/shared'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { tollGateWeekly, tollGateWeeklyClaims } from '../../db/schema.js'
import { errorCode, setUpRankings } from './test-setup.js'
import { recordTollGateProgress, tollGateProgress, weekStart } from './toll-gate-weekly.js'

const { db, close } = createTestDb()
let t: Awaited<ReturnType<typeof setUpRankings>>

beforeEach(async () => {
  await truncateAll(db)
  t = await setUpRankings(db)
  await t.set({ level: 20 })
})
afterEach(() => t.app.close())
afterAll(() => close())

const DAY = 24 * 3600 * 1000
const GATE = 100001 // levels 16-25
const thisMonday = () => new Date(`${weekStart(new Date())}T00:00:00Z`)
/** A time in last week, `seconds` after its Monday 00:00 UTC. */
const lastWeek = (seconds = 3600) => new Date(thisMonday().getTime() - 7 * DAY + seconds * 1000)

const record = (id: string, schedule: number, at: Date, gateId = GATE) =>
  db.transaction((tx) => recordTollGateProgress(tx, id, gateId, schedule, at))
const entries = (id: string) =>
  db.select().from(tollGateWeekly).where(eq(tollGateWeekly.characterId, id))
const ranking = async (gateId = GATE) => {
  const response = await t.client.get(`/api/game/rankings/toll-gates/${gateId}`)
  expect(response.statusCode).toBe(200)
  return response.json<TollGateRanking>()
}
const claim = (gateId = GATE) => t.client.post(`/api/game/rankings/toll-gates/${gateId}/claim`)

describe('weeks', () => {
  it('start on Monday 00:00 UTC', () => {
    expect(weekStart(new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-12') // Monday
    expect(weekStart(new Date('2026-10-11T23:59:59.999Z'))).toBe('2026-10-05') // Sunday
    expect(weekStart(new Date('2026-10-18T23:59:59Z'))).toBe('2026-10-12')
    expect(weekStart(new Date('2027-01-01T12:00:00Z'))).toBe('2026-12-28') // across the year
  })

  it('compute progress like the original: last passed point of all points', () => {
    expect(tollGateProgress(0, 10)).toBe(10)
    expect(tollGateProgress(9, 10)).toBe(100)
    expect(tollGateProgress(0, 15)).toBe(6)
    expect(tollGateProgress(13, 15)).toBe(93)
  })
})

describe('recordTollGateProgress', () => {
  it('keeps the best progress per week; the earlier time wins ties', async () => {
    const at = lastWeek()
    await record(t.me, 40, at)
    await record(t.me, 20, new Date(at.getTime() + 1000))
    await record(t.me, 40, new Date(at.getTime() + 2000))
    expect(await entries(t.me)).toMatchObject([{ schedule: 40, reachedAt: at }])
    const earlier = new Date(at.getTime() - 1000)
    await record(t.me, 40, earlier)
    await record(t.me, 60, new Date(at.getTime() + 5000))
    expect(await entries(t.me)).toMatchObject([
      { schedule: 60, reachedAt: new Date(at.getTime() + 5000) },
    ])
  })

  it('splits weeks at Monday 00:00 UTC', async () => {
    const monday = thisMonday()
    await record(t.me, 30, new Date(monday.getTime() - 1))
    await record(t.me, 10, monday)
    const rows = await entries(t.me)
    expect(rows.map((r) => [r.week, r.schedule]).sort()).toEqual([
      [weekStart(new Date(monday.getTime() - 1)), 30],
      [weekStart(monday), 10],
    ])
  })

  it('ignores unranked gates, empty progress and ninjas above the level range', async () => {
    await record(t.me, 50, lastWeek(), 100021)
    await record(t.me, 0, lastWeek())
    await t.set({ level: 26 })
    await record(t.me, 50, lastWeek())
    expect(await entries(t.me)).toEqual([])
  })
})

describe('weekly toll gate ranking', () => {
  it('shows the top 50 by progress and time; place 51 is not ranked', async () => {
    const ids = await t.addNinjas(Array.from({ length: 55 }, () => ({ level: 20 })))
    const base = Date.now() - 3600_000
    for (const [i, id] of ids.entries()) await record(id, 100 - i, new Date(base + i))
    await record(t.me, 46, new Date(base - 1)) // ties place 55's 46 and wins on time
    const view = await ranking()
    expect(view.thisWeek.week).toBe(weekStart(new Date()))
    expect(view.thisWeek.rows).toHaveLength(50)
    expect(view.thisWeek.rows[0]).toMatchObject({ place: 1, name: 'Rank_0', schedule: 100 })
    expect(view.thisWeek.rows[49]).toMatchObject({ place: 50, name: 'Rank_49', schedule: 51 })
    expect(view.thisWeek.myPlace).toBeNull()
    expect(view.lastWeek).toMatchObject({ rows: [], myPlace: null, reward: null })

    await record(t.me, 99, new Date(base - 1))
    expect((await ranking()).thisWeek.myPlace).toBe(2)
  })

  it('refuses gates without a weekly ranking', async () => {
    expect((await t.client.get('/api/game/rankings/toll-gates/100021')).statusCode).toBe(404)
    expect(errorCode(await claim(100000))).toBe('unknown_gate')
  })
})

describe('claiming last week', () => {
  it('pays the place reward once (EXP with level-ups and Stone)', async () => {
    const [other] = await t.addNinjas([{ level: 20 }])
    await record(other!, 80, lastWeek())
    await record(t.me, 50, lastWeek())
    await t.set({ level: 12, exp: 0, stone: 10 })

    const view = await ranking()
    expect(view.lastWeek.myPlace).toBe(2)
    // Rank 2 = rank 1 / √2: 6000 / √2 EXP, 16908 / √2 Stone.
    expect(view.lastWeek.reward).toEqual({ place: 2, exp: 4242, stone: 11955, claimed: false })

    const response = await claim()
    expect(response.statusCode).toBe(200)
    const body = response.json<TollGateClaimResult>()
    expect(body.reward).toMatchObject({ place: 2, exp: 4242, stone: 11955 })
    expect(body.reward.levelsGained).toBeGreaterThan(0)
    expect(body.ranking.lastWeek.reward?.claimed).toBe(true)
    const row = await t.row()
    expect(row.stone).toBe(10 + 11955)
    expect(row.level).toBe(12 + body.reward.levelsGained)
    expect(body.character.level).toBe(row.level)

    expect(errorCode(await claim())).toBe('already_claimed')
    expect((await t.row()).stone).toBe(10 + 11955)
  })

  it('refuses ninjas not ranked last week, even when ranked this week', async () => {
    await record(t.me, 90, new Date())
    expect(errorCode(await claim())).toBe('not_ranked')
    const ids = await t.addNinjas(Array.from({ length: 50 }, () => ({ level: 20 })))
    for (const id of ids) await record(id, 100, lastWeek(10))
    await record(t.me, 100, lastWeek(20)) // 51st: later time on a tie
    expect((await ranking()).lastWeek.reward).toBeNull()
    expect(errorCode(await claim())).toBe('not_ranked')
  })

  it('pays only one of many concurrent claims', async () => {
    await record(t.me, 30, lastWeek())
    await t.set({ stone: 0 })
    await t.client.fetchCsrf()
    const responses = await Promise.all(Array.from({ length: 6 }, () => claim()))
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400, 400, 400, 400, 400])
    expect((await t.row()).stone).toBe(16908)
    const claims = await db
      .select()
      .from(tollGateWeeklyClaims)
      .where(and(eq(tollGateWeeklyClaims.characterId, t.me), eq(tollGateWeeklyClaims.gateId, GATE)))
    expect(claims).toHaveLength(1)
  })
})
