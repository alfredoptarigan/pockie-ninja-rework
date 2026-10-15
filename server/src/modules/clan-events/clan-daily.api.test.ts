// Clan Training (three courses once a UTC day: cost, EXP, Bankai EXP, Clan Points), Clan
// Protection (3 boss fights a day, rewards) and the Logs tab.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROTECTION_PLACEHOLDERS,
  TRAINING_RULES,
  type ClanLogsView,
  type ProtectionFightResult,
  type ProtectionView,
  type TrainingResult,
  type TrainingView,
} from '../../../../shared/src/schemas/clan-activities.js'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterBankai, characters, clanMembers, users } from '../../db/schema.js'
import { createSession } from '../auth/sessions.js'
import { protectionBoss } from './daily.js'

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

async function leader() {
  const client = new Client(app)
  const [user] = await db
    .insert(users)
    .values({ username: 'Player_1', email: 'player1@example.com', passwordHash: 'x' })
    .returning()
  client.setCookie('pn_session', await createSession(db, user!.id, false))
  const created = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const id: string = created.json().character.id
  await db
    .update(characters)
    .set({ level: 30, giftCoupon: 1_000, stone: 100_000 })
    .where(eq(characters.id, id))
  const clanId = (await client.post('/api/game/clans/create', { name: 'Konoha' })).json().clan.id
  const get = <T>(path: string) =>
    client.get(`/api/game/clan-events${path}`).then((r) => r.json<T>())
  const post = (path: string, body: object = {}) =>
    client.post(`/api/game/clan-events/${path}`, body)
  return { client, id, clanId, get, post }
}

const bankaiExp = async (id: string) =>
  (await db.select().from(characterBankai).where(eq(characterBankai.characterId, id)))[0]
    ?.expPool ?? 0
const points = async (id: string) =>
  (await db.select().from(clanMembers).where(eq(clanMembers.characterId, id)))[0]!.totalPoints

describe('Training', () => {
  it('pays each course once a day and resets at midnight UTC', async () => {
    const ninja = await leader()
    expect((await ninja.get<TrainingView>('/training')).donated).toEqual({
      primary: false,
      advanced: false,
      final: false,
    })

    const primary = await ninja.post('training', { course: 'primary' })
    expect(primary.statusCode, primary.body).toBe(200)
    const result = primary.json<TrainingResult>()
    expect(result.training.donated.primary).toBe(true)
    expect(result.character.stone).toBe(100_000 - TRAINING_RULES.primary.cost)
    expect(result.character.exp).toBeGreaterThan(0)
    expect(result.clan.exp).toBe(TRAINING_RULES.primary.clanPoints)
    expect(await points(ninja.id)).toBe(TRAINING_RULES.primary.clanPoints)
    expect(code(await ninja.post('training', { course: 'primary' }))).toBe('donated')

    const final = (await ninja.post('training', { course: 'final' })).json<TrainingResult>()
    expect(final.character.giftCoupon).toBe(1_000 - TRAINING_RULES.final.cost)
    expect(await bankaiExp(ninja.id)).toBe(TRAINING_RULES.final.bankaiExp)
    await db.update(characters).set({ giftCoupon: 100 }).where(eq(characters.id, ninja.id))
    expect(code(await ninja.post('training', { course: 'advanced' }))).toBe('not_enough')

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 86_400_000))
    expect((await ninja.get<TrainingView>('/training')).donated.primary).toBe(false)
  })

  it('rejects unknown courses and ninjas without a clan', async () => {
    const ninja = await leader()
    expect(code(await ninja.post('training', { course: 'expert' }))).toBe('validation')
    await ninja.client.post('/api/game/clans/leave')
    expect(code(await ninja.post('training', { course: 'primary' }))).toBe('no_clan')
  })
})

describe('Protection', () => {
  it('fights the Bloodboil Demon of the ninja level three times a day', async () => {
    const ninja = await leader()
    const view = await ninja.get<ProtectionView>('/protection')
    expect(view).toMatchObject({ fightsRemaining: 3, boss: { npcId: 'n3205706', level: 30 } })
    for (let left = 2; left >= 0; left--) {
      const response = await ninja.post('protection/fight')
      expect(response.statusCode, response.body).toBe(200)
      const fight = response.json<ProtectionFightResult>()
      expect(fight.protection.fightsRemaining).toBe(left)
      expect(fight.reward).toEqual(
        fight.won ? PROTECTION_PLACEHOLDERS.win : PROTECTION_PLACEHOLDERS.loss,
      )
    }
    expect(code(await ninja.post('protection/fight'))).toBe('no_fights')
    expect(await points(ninja.id)).toBeGreaterThan(0)
  })

  it('maps levels onto the boss rows', () => {
    expect(protectionBoss(1)).toEqual({ npcId: 'n3205701', level: 5 })
    expect(protectionBoss(64)).toEqual({ npcId: 'n3205712', level: 60 })
    expect(protectionBoss(100)).toEqual({ npcId: 'n3205700', level: 100 })
  })
})

describe('Logs', () => {
  it('lists clan actions newest first', async () => {
    const ninja = await leader()
    await ninja.post('training', { course: 'primary' })
    await ninja.client.post('/api/game/clans/donate', { currency: 'stone', amount: 15_000 })
    const { logs } = await ninja.get<ClanLogsView>('/logs')
    expect(logs.map((log) => [log.actor, log.action, log.details])).toEqual([
      ['Ninja_01', 'Donated', '15,000 Stones'],
      ['Ninja_01', 'Training', "Beginner's Course"],
      ['Ninja_01', 'Founded the clan', 'Konoha'],
    ])
  })
})
