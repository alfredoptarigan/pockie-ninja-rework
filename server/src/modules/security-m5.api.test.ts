// M5 security review (docs/security-review-m5.md): one regression test per fixed finding, plus the
// job races the review checked (two overlapping runs of each periodic M5 job).
import { eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import {
  tailedBeastKages,
  tailedBeastPlayers,
  teamStoneMatches,
  teamStonePlayers,
  teamStoneQueue,
} from '../db/schema.js'
import { arenaHonorShop } from '../game/data.js'
import { arenaTestApp, errorCode, type Ninja } from './arena/test-setup.js'
import { weekStart } from './rankings/toll-gate-weekly.js'
import { tailedBeastWeeklyReset } from './tailed-beast/routes.js'
import { matchTeamStone, payTeamStoneWeek } from './team-stone/routes.js'
import { monthStart } from './team-stone/store.js'

// Each test registers several ninjas (argon2), slow on a loaded machine.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 60_000 })

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
const player = async (n: Ninja) =>
  (await db.select().from(teamStonePlayers).where(eq(teamStonePlayers.characterId, n.id)))[0]

describe('the Team Stone Battle Coin shop', () => {
  // The BC shop sells the Honor shop list (decision 28); the list's arena rank gate comes with it.
  const ranked = () => Object.entries(arenaHonorShop()).find(([, offer]) => offer.rank > 0)!

  it('refuses an item above the ninja’s arena rank and keeps the Battle Coins', async () => {
    // Arrange
    const a = await ninja('Collector')
    const [itemId, offer] = ranked()
    await a.join({ tier: offer.rank - 1 })
    await a.set({ battleCoins: offer.honor })

    // Act
    const response = await a.client.post('/api/game/team-stone/shop/buy', { itemId })

    // Assert
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('tier_too_low')
    expect((await a.row()).battleCoins).toBe(offer.honor)
  })

  it('sells it once the arena rank is reached', async () => {
    const a = await ninja('Champion')
    const [itemId, offer] = ranked()
    await a.join({ tier: offer.rank })
    await a.set({ battleCoins: offer.honor })

    const response = await a.client.post('/api/game/team-stone/shop/buy', { itemId })

    expect(response.statusCode).toBe(200)
    expect((await a.row()).battleCoins).toBe(0)
  })
})

describe('periodic M5 jobs under two overlapping runs', () => {
  it('Team Stone matchmaking starts one match and spends one attempt', async () => {
    // Arrange: one queued ninja past the bot fill and enough arena ninjas to fill both sides.
    const a = await ninja('Queued')
    for (let i = 0; i < 5; i++) await (await ninja(`Filler_${i}`)).join()
    expect((await a.client.post('/api/game/team-stone/queue')).statusCode).toBe(200)
    await db
      .update(teamStoneQueue)
      .set({ queuedAt: new Date(Date.now() - 31_000) })
      .where(eq(teamStoneQueue.characterId, a.id))

    // Act
    const runs = await Promise.all([matchTeamStone(db), matchTeamStone(db)])

    // Assert
    expect(runs.flat()).toHaveLength(1)
    expect(await db.select().from(teamStoneMatches)).toHaveLength(1)
    expect(await player(a)).toMatchObject({ attemptsUsed: 1 })
  })

  it('the Team Stone weekly pay pays a league once', async () => {
    const a = await ninja('Payee')
    const lastWeek = weekStart(new Date(Date.now() - 7 * DAY_MS))
    await db.insert(teamStonePlayers).values({
      characterId: a.id,
      score: 350,
      week: lastWeek,
      playedThisWeek: true,
      month: monthStart(new Date()),
    })

    await Promise.all([payTeamStoneWeek(db), payTeamStoneWeek(db)])

    // Bronze pays 500 Battle Coins.
    expect((await a.row()).battleCoins).toBe(500)
  })

  it('the Tailed Beast weekly reset names one Kage per village', async () => {
    const a = await ninja('Top_honor')
    const b = await ninja('Second_honor')
    const lastWeek = weekStart(new Date(Date.now() - 7 * DAY_MS))
    await db.insert(tailedBeastPlayers).values([
      { week: lastWeek, characterId: a.id, village: 0, honor: 900 },
      { week: lastWeek, characterId: b.id, village: 0, honor: 100 },
    ])

    await Promise.all([tailedBeastWeeklyReset(db), tailedBeastWeeklyReset(db)])

    const kages = await db.select().from(tailedBeastKages)
    expect(kages.map((k) => [k.village, k.characterId])).toEqual([[0, a.id]])
  })
})
