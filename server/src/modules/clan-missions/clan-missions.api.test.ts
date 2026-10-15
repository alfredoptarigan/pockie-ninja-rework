// Clan Missions: the leader starts or schedules a boss from clan storage (3 a day) or a Free Entry,
// members attack it (each fight at most 10% of its HP), a defeat pays clan storage and unlocks the
// next boss, an untouched escaped boss is refunded, + adds 20 s for 150 Gold.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLAN_MISSION_PLACEHOLDERS as P,
  CLAN_MISSION_RULES,
  type ClanMissionAttackResult,
  type ClanMissionsResult,
  type ClanMissionsView,
} from '../../../../shared/src/schemas/clan-activities.js'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters, clanMembers, clanMissions, clans, users } from '../../db/schema.js'
import { createSession } from '../auth/sessions.js'
import { settleMissions } from './missions.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
})
afterEach(() => {
  vi.useRealTimers()
  return app.close()
})
afterAll(() => close())

type Response = Awaited<ReturnType<Client['get']>>
const code = (response: Response) => response.json().error?.code as string | undefined

let made = 0
async function ninja(clanId?: string) {
  made += 1
  const client = new Client(app)
  const [user] = await db
    .insert(users)
    .values({ username: `Player_${made}`, email: `p${made}@example.com`, passwordHash: 'x' })
    .returning()
  client.setCookie('pn_session', await createSession(db, user!.id, false))
  const created = await client.post('/api/game/characters', {
    name: `Ninja_${String(made).padStart(2, '0')}`,
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const id: string = created.json().character.id
  await db.update(characters).set({ level: 60, gold: 1_000 }).where(eq(characters.id, id))
  if (clanId) await db.insert(clanMembers).values({ characterId: id, clanId })
  else clanId = (await client.post('/api/game/clans/create', { name: 'Konoha' })).json().clan.id
  const get = () =>
    client.get('/api/game/clan-events/missions').then((r) => r.json<ClanMissionsView>())
  const post = (path: string, body: object = {}) =>
    client.post(`/api/game/clan-events/missions/${path}`, body)
  return { client, id, clanId: clanId!, get, post }
}

const fund = (clanId: string, stone: number, giftCoupon = 0) =>
  db.update(clans).set({ stone, giftCoupon }).where(eq(clans.id, clanId))
const treasury = async (clanId: string) =>
  (await db.select().from(clans).where(eq(clans.id, clanId)))[0]!

describe('Clan Missions', () => {
  it('starts the first boss from clan storage; only the leader starts', async () => {
    const leader = await ninja()
    const member = await ninja(leader.clanId)
    expect(await leader.get()).toMatchObject({ unlockedBoss: 0, activeBoss: null, canStart: true })
    expect((await member.get()).canStart).toBe(false)
    expect(code(await leader.post('start', { bossIndex: 0, delayHours: 0 }))).toBe('not_enough')
    expect(code(await leader.post('start', { bossIndex: 1, delayHours: 0 }))).toBe('boss_locked')
    expect((await member.post('start', { bossIndex: 0, delayHours: 0 })).statusCode).toBe(403)

    await fund(leader.clanId, P.costs[0]!.stones)
    const started = await leader.post('start', { bossIndex: 0, delayHours: 0 })
    expect(started.statusCode, started.body).toBe(200)
    const { missions } = started.json<ClanMissionsResult>()
    expect(missions.activeBoss).toMatchObject({ bossIndex: 0, minimumAttacks: 10 })
    expect(missions.battlesUsedToday).toBe(1)
    expect((await treasury(leader.clanId)).stone).toBe(0)
    expect(code(await leader.post('start', { bossIndex: 0, delayHours: 0 }))).toBe('boss_running')
  })

  it('takes a slice of the shared HP per attack; the defeat pays and unlocks the next boss', async () => {
    const leader = await ninja()
    const member = await ninja(leader.clanId)
    await fund(leader.clanId, P.costs[0]!.stones)
    await leader.post('start', { bossIndex: 0, delayHours: 0 })
    const maxHp = (await leader.get()).activeBoss!.maxHp
    // Leave 1 HP so the next hit defeats it.
    await db.update(clanMissions).set({ hp: 1 }).where(eq(clanMissions.clanId, leader.clanId))
    let result: ClanMissionAttackResult | undefined
    for (let i = 0; i < 10 && !result?.defeated; i++) {
      const response = await member.post('attack')
      expect(response.statusCode, response.body).toBe(200)
      result = response.json<ClanMissionAttackResult>()
      expect(result.damage).toBeLessThanOrEqual(Math.ceil(maxHp / 10))
    }
    expect(result!.defeated).toBe(true)
    expect(result!.missions).toMatchObject({ activeBoss: null, unlockedBoss: 1 })
    expect(result!.missions.lastOutcome).toMatchObject({ bossIndex: 0, defeated: true })
    const clan = await treasury(leader.clanId)
    expect(clan.stone).toBe(P.rewards[0]!.stone)
    expect(clan.giftCoupon).toBe(P.rewards[0]!.giftCoupon)
    expect(code(await member.post('attack'))).toBe('no_boss')
  })

  it('refunds a boss nobody attacked when it escapes, and a cancelled schedule', async () => {
    const leader = await ninja()
    await fund(leader.clanId, P.costs[0]!.stones)
    const scheduled = (
      await leader.post('start', { bossIndex: 0, delayHours: 2 })
    ).json<ClanMissionsResult>()
    expect(scheduled.missions.scheduledBoss).toMatchObject({ bossIndex: 0 })
    expect(code(await leader.post('attack'))).toBe('no_boss')
    const cancelled = (await leader.post('cancel')).json<ClanMissionsResult>()
    expect(cancelled.missions).toMatchObject({ scheduledBoss: null, battlesUsedToday: 0 })
    expect((await treasury(leader.clanId)).stone).toBe(P.costs[0]!.stones)

    await leader.post('start', { bossIndex: 0, delayHours: 0 })
    const extended = await leader.post('extend')
    expect(extended.json<ClanMissionsResult>().character.gold).toBe(
      1_000 - CLAN_MISSION_RULES.extendGold,
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 11 * 60_000))
    await settleMissions(db)
    const after = await leader.get()
    expect(after).toMatchObject({ activeBoss: null, battlesUsedToday: 0 })
    expect(after.lastOutcome).toMatchObject({ bossIndex: 0, defeated: false })
    expect((await treasury(leader.clanId)).stone).toBe(P.costs[0]!.stones)
  })

  it('uses Clan Boss Free Entries before clan storage and the daily limit', async () => {
    const leader = await ninja()
    await db.insert(clanMissions).values({ clanId: leader.clanId, freeEntries: 1 })
    const started = (
      await leader.post('start', { bossIndex: 0, delayHours: 0 })
    ).json<ClanMissionsResult>()
    expect(started.missions).toMatchObject({ freeBattleEntries: 0, battlesUsedToday: 0 })
  })
})
