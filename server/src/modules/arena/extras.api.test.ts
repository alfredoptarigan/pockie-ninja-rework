// Arena extras: Buy Tickets, Weekly Rewards, Squad Arena 3v3 and the Championship.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  arenaExtras,
  arenaWeeklyHours,
  arenaWeeklyPoints,
  championshipMatches,
  championships,
  inventoryItems,
  squadPlayers,
} from '../../db/schema.js'
import { settleChampionships } from './championship.js'
import { arenaTestApp, errorCode, today, type Ninja } from './test-setup.js'
import { accrueWeekly, hourlyPoints, rewardFor } from './weekly.js'

// Each test registers two or three ninjas (argon2), slow on a loaded machine.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const { db, close } = createTestDb()
let setup: ReturnType<typeof arenaTestApp>
let a: Ninja

beforeEach(async () => {
  await truncateAll(db)
  await db.delete(arenaWeeklyHours)
  setup = arenaTestApp(db)
  a = await setup.ninja('Attacker')
})
afterEach(async () => {
  vi.useRealTimers()
  await setup.app.close()
})
afterAll(() => close())

const extras = async (ninja: Ninja) =>
  (await db.select().from(arenaExtras).where(eq(arenaExtras.characterId, ninja.id)))[0]

describe('Buy Arena Tickets', () => {
  it('sells tickets for 100 Gift Certificates each and refuses more than you can pay', async () => {
    // Arrange
    await a.set({ giftCoupon: 250 })
    // Act
    const bought = await a.client.post('/api/game/arena/tickets', { amount: 2 })
    const short = await a.client.post('/api/game/arena/tickets', { amount: 1 })
    const tooMany = await a.client.post('/api/game/arena/tickets', { amount: 21 })
    // Assert
    expect(bought.statusCode).toBe(200)
    expect(bought.json().arena.tickets).toBe(2)
    expect((await a.row()).giftCoupon).toBe(50)
    expect(errorCode(short)).toBe('no_coupons')
    expect(tooMany.statusCode).toBe(400)
  })

  it('uses a ticket once the free tries are gone, before any Gold', async () => {
    // Arrange: no free try left, one ticket, no Gold.
    await a.join({ day: today(), triesUsed: 20 })
    await a.set({ gold: 0, giftCoupon: 100 })
    await a.client.post('/api/game/arena/tickets', { amount: 1 })
    expect((await a.client.get('/api/game/arena')).json()).toMatchObject({ tickets: 1, tryGold: 0 })
    // Act
    const fought = await a.client.post('/api/game/arena/fight', { slot: 0 })
    // Assert: the ticket paid; the next try needs Gold again.
    expect(fought.statusCode).toBe(200)
    expect(fought.json().arena).toMatchObject({ tickets: 0, tryGold: 8, triesBought: 0 })
    expect((await extras(a))!.arenaTickets).toBe(0)
  })
})

describe('Weekly Rewards', () => {
  it('pays the ladder top points once per hour (10, 9, ... then 1)', async () => {
    // Arrange: two ninjas on the arena list.
    const b = await setup.ninja('Second')
    await a.join({ tier: 2, score: 120000 })
    await b.join({ tier: 2, score: 110000 })
    const at = new Date('2026-10-14T10:20:00Z')
    // Act: the same hour twice, then the next hour.
    await accrueWeekly(db, at)
    await accrueWeekly(db, new Date('2026-10-14T10:59:00Z'))
    await accrueWeekly(db, new Date('2026-10-14T11:01:00Z'))
    // Assert
    const points = await db.select().from(arenaWeeklyPoints)
    const of = (id: string) => points.find((row) => row.characterId === id && row.kind === 'arena')
    expect(of(a.id)).toMatchObject({ week: '2026-10-12', points: 20 })
    expect(of(b.id)).toMatchObject({ week: '2026-10-12', points: 18 })
    expect([1, 9, 10, 50, 51].map(hourlyPoints)).toEqual([10, 2, 1, 1, 0])
  })

  it('shows the standings and lets last week top 50 claim once, within 5 days of the reset', async () => {
    // Arrange: Tuesday; last week the attacker was first.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'))
    await a.set({ giftCoupon: 0, gold: 0, honor: 0 })
    await db.insert(arenaWeeklyPoints).values([
      { kind: 'arena', week: '2026-10-05', characterId: a.id, points: 500 },
      { kind: 'arena', week: '2026-10-12', characterId: a.id, points: 30 },
    ])
    // Act
    const view = (await a.client.get('/api/game/arena/weekly?kind=arena')).json()
    const claim = await a.client.post('/api/game/arena/weekly/claim', { kind: 'arena' })
    const again = await a.client.post('/api/game/arena/weekly/claim', { kind: 'arena' })
    // Assert
    expect(view).toMatchObject({
      isMonday: false,
      week: '2026-10-12',
      userRank: 1,
      userPoints: 30,
      canClaim: true,
      claim: { week: '2026-10-05', rank: 1, claimed: false },
      resetAt: '2026-10-19T00:00:00.000Z',
    })
    const reward = rewardFor('arena', 1)!
    expect(claim.statusCode).toBe(200)
    expect(claim.json().weekly).toMatchObject({ canClaim: false, claim: { claimed: true } })
    expect(await a.row()).toMatchObject({
      honor: reward.medals,
      giftCoupon: reward.giftCoupons,
      gold: reward.gold,
    })
    const items = await db.select().from(inventoryItems).where(eq(inventoryItems.characterId, a.id))
    for (const itemId of reward.items) expect(items.some((row) => row.itemId === itemId)).toBe(true)
    expect(errorCode(again)).toBe('already_claimed')
  })

  it('refuses a ninja outside last week top 50 and a claim after the 5 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-17T08:00:00Z'))
    await db
      .insert(arenaWeeklyPoints)
      .values({ kind: 'squad', week: '2026-10-05', characterId: a.id, points: 5 })
    expect(errorCode(await a.client.post('/api/game/arena/weekly/claim', { kind: 'arena' }))).toBe(
      'no_reward',
    )
    expect(errorCode(await a.client.post('/api/game/arena/weekly/claim', { kind: 'squad' }))).toBe(
      'claim_closed',
    )
  })
})

// Set I wears the creation outfit (AGI); sets II and III get a STR and a STA outfit.
const STR_OUTFIT = 'i290001'
const STA_OUTFIT = 'i290006'

async function squadReady(ninja: Ninja) {
  await ninja.set({ level: 60 })
  await db.insert(inventoryItems).values([
    { characterId: ninja.id, itemId: STR_OUTFIT, equippedSlot: 'Outfit', equippedSet: 2 },
    { characterId: ninja.id, itemId: STA_OUTFIT, equippedSlot: 'Outfit', equippedSet: 3 },
  ])
}

describe('Squad Arena', () => {
  it('needs three loadouts with different main stats', async () => {
    // Arrange
    await squadReady(a)
    // Act
    const view = (await a.client.get('/api/game/arena/squad')).json()
    const same = await a.client.post('/api/game/arena/squad/loadouts', { loadouts: [1, 2, 4] })
    const saved = await a.client.post('/api/game/arena/squad/loadouts', { loadouts: [2, 1, 3] })
    // Assert
    expect(view.loadouts.slice(0, 4).map((l: { mainStat: string | null }) => l.mainStat)).toEqual([
      'AGI',
      'STR',
      'STA',
      null,
    ])
    expect(view.loadouts[3].vipLocked).toBe(true)
    expect(errorCode(same)).toBe('squad_invalid')
    expect(saved.statusCode).toBe(200)
    expect(saved.json().squad).toMatchObject({ selected: [2, 1, 3], squadValid: true, rank: 1 })
  })

  it('fights three rounds against a real squad: ticket, Team Coins, zero-sum score, history', async () => {
    // Arrange
    const b = await setup.ninja('Defender')
    await squadReady(a)
    await squadReady(b)
    await b.client.post('/api/game/arena/squad/loadouts', { loadouts: [1, 2, 3] })
    const saved = await a.client.post('/api/game/arena/squad/loadouts', { loadouts: [1, 2, 3] })
    expect(saved.json().squad.opponents).toMatchObject([{ index: 0, name: 'Defender' }])
    // Act
    const response = await a.client.post('/api/game/arena/squad/fight', { index: 0 })
    // Assert
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.rounds).toHaveLength(3)
    expect(body.rounds.map((r: { sets: number[] }) => r.sets)).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    const roundWins = body.rounds.filter((r: { won: boolean }) => r.won).length
    expect(body.won).toBe(roundWins >= 2)
    expect(body.teamCoins).toBe(50)
    expect(body.squad).toMatchObject({ freeTickets: 9, teamCoins: 50, fights: 1 })
    const [mine] = await db.select().from(squadPlayers).where(eq(squadPlayers.characterId, a.id))
    const [theirs] = await db.select().from(squadPlayers).where(eq(squadPlayers.characterId, b.id))
    expect(mine!.score + theirs!.score).toBe(2 * 93500)
    expect(mine!.score - 93500).toBe(body.scoreDelta)
    expect(theirs!.history).toMatchObject([{ name: 'Attacker', challenged: false, won: !body.won }])
    // The active set did not change.
    expect((await a.row()).activeSet).toBe(1)
  })

  it('refreshes for a ticket only when there is a squad to fight, and sells tickets for 200', async () => {
    await squadReady(a)
    await a.client.post('/api/game/arena/squad/loadouts', { loadouts: [1, 2, 3] })
    const empty = await a.client.post('/api/game/arena/squad/refresh')
    expect(empty.json()).toMatchObject({ empty: true, squad: { freeTickets: 10 } })
    await a.set({ giftCoupon: 400 })
    const bought = await a.client.post('/api/game/arena/squad/tickets', { amount: 2 })
    expect(bought.json().squad.boughtTickets).toBe(2)
    expect((await a.row()).giftCoupon).toBe(0)
    expect(errorCode(await a.client.post('/api/game/arena/squad/tickets', { amount: 11 }))).toBe(
      'too_many',
    )
  })

  it('refuses ninjas under level 50', async () => {
    expect(
      errorCode(await a.client.post('/api/game/arena/squad/loadouts', { loadouts: [1, 2, 3] })),
    ).toBe('level_too_low')
  })
})

describe('Championship', () => {
  const tournamentDay = '2026-10-15'
  const at = (time: string) => new Date(`${tournamentDay}T${time}:00Z`)

  it('registers, steals a slot by winning, then fights each round once with Hero Coins', async () => {
    // Arrange: registration time; three level 40 ninjas.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at('10:00'))
    const b = await setup.ninja('Second')
    const c = await setup.ninja('Third')
    for (const ninja of [a, b, c]) await ninja.set({ level: 40 })
    // Act: a takes slot 0, b slot 2; c challenges a for slot 0.
    expect(
      (await a.client.post('/api/game/arena/championship/enter', { slot: 0 })).statusCode,
    ).toBe(200)
    await b.client.post('/api/game/arena/championship/enter', { slot: 2 })
    const [row] = await db.select().from(championships)
    // Fights use the ninja as they are: the holder drops to level 1, the challenger rises to 90.
    await a.set({ level: 1 })
    await c.set({ level: 90 })
    const challenge = await c.client.post('/api/game/arena/championship/enter', { slot: 0 })
    const twice = await c.client.post('/api/game/arena/championship/enter', { slot: 5 })
    // Assert the registration.
    expect(challenge.statusCode).toBe(200)
    expect(challenge.json().fight.won).toBe(true)
    expect(challenge.json().championship).toMatchObject({
      phase: 'registration',
      mySlot: 0,
      challenges: [{ challengerName: 'Third', defenderName: 'Attacker', won: true }],
    })
    expect(errorCode(twice)).toBe('registered')

    // Act: the whole bracket is due; settle twice.
    await settleChampionships(db, at('23:30'))
    await settleChampionships(db, at('23:30'))
    // Assert: 15 matches once, a champion, Hero Coins only for fought wins.
    const matches = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championshipId, row!.id))
    expect(matches).toHaveLength(15)
    const [done] = await db.select().from(championships).where(eq(championships.id, row!.id))
    expect(done).toMatchObject({ roundsSettled: 4 })
    expect(['Second', 'Third']).toContain(done!.winnerName)
    const champion = done!.winnerName === 'Second' ? b : c
    const runnerUp = champion === b ? c : b
    // R16 are byes (0-1, 2-3); the Quarterfinal 0 vs 2 is the only fight and pays 100.
    expect(await extras(champion)).toMatchObject({
      heroCoins: 100,
      championshipWins: 1,
      championshipTop3: 1,
    })
    expect(await extras(runnerUp)).toMatchObject({ heroCoins: 0, championshipLosses: 1 })
    expect(await extras(a)).toBeUndefined()

    // After the battles: registration is closed and the view shows the champion.
    vi.setSystemTime(at('23:30'))
    await a.set({ level: 40 })
    expect(errorCode(await a.client.post('/api/game/arena/championship/enter', { slot: 7 }))).toBe(
      'registration_closed',
    )
    const view = (await champion.client.get('/api/game/arena/championship')).json()
    expect(view).toMatchObject({ phase: 'cooldown', champion: done!.winnerName, heroCoins: 100 })
    const qf = view.matches.find(
      (m: { round: number; matchIndex: number }) => m.round === 2 && m.matchIndex === 0,
    )
    expect(qf).toMatchObject({ slot1: 0, slot2: 2, hasReplay: true })
    const replay = await champion.client.get('/api/game/arena/championship/matches/2/0')
    expect(replay.json().looks).toHaveLength(2)
  })

  it('spends Hero Coins in the shop', async () => {
    await db.insert(arenaExtras).values({ characterId: a.id, heroCoins: 120 })
    const bought = await a.client.post('/api/game/arena/championship/shop/buy', {
      id: 'exp-bag-10',
    })
    expect(bought.statusCode).toBe(200)
    expect(bought.json().championship.heroCoins).toBe(20)
    expect(
      errorCode(await a.client.post('/api/game/arena/championship/shop/buy', { id: 'exp-bag-10' })),
    ).toBe('no_coins')
  })
})
