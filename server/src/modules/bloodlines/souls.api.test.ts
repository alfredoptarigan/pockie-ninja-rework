// Bloodline souls and prayer (M5 task 10, decisions 15, 16).
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  arenaPlayers,
  characterBloodlinePrayer,
  characterBloodlines,
  characters,
  characterSouls,
} from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { bloodlineBonuses } from './routes.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Player_one',
    email: 'player@example.com',
    password: 'believe-it',
  })
  const created = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  characterId = created.json().character.id
  await set({ level: 60 })
})
afterEach(() => app.close())
afterAll(() => close())

const today = () => new Date().toISOString().slice(0, 10)
const set = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const row = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const unlock = (limitId: number) =>
  db
    .insert(characterBloodlines)
    .values({ characterId, limitId, amity: 4500, unlockedAt: new Date() })
const addSoul = async (type: number, level: number, limitId?: number, socket?: number) =>
  (
    await db
      .insert(characterSouls)
      .values({ characterId, type, level, limitId, socket })
      .returning()
  )[0]!.id
const souls = () =>
  db.select().from(characterSouls).where(eq(characterSouls.characterId, characterId))
const soul = async (id: string) => (await souls()).find((s) => s.id === id)
const prayer = async (limitId: number) =>
  (
    await db
      .select()
      .from(characterBloodlinePrayer)
      .where(
        and(
          eq(characterBloodlinePrayer.characterId, characterId),
          eq(characterBloodlinePrayer.limitId, limitId),
        ),
      )
  )[0]

const discover = (count: number) => client.post('/api/game/bloodlines/souls/discover', { count })
const synthesize = (soulIds: string[]) =>
  client.post('/api/game/bloodlines/souls/synthesize', { soulIds })
const destroy = (soulIds: string[]) =>
  client.post('/api/game/bloodlines/souls/destroy', { soulIds })
const refine = (targetId: string, fuelIds: string[]) =>
  client.post('/api/game/bloodlines/souls/refine', { targetId, fuelIds })
const bind = (soulId: string, limitId: number) =>
  client.post(`/api/game/bloodlines/souls/${soulId}/bind`, { limitId })
const unbind = (soulId: string) => client.post(`/api/game/bloodlines/souls/${soulId}/unbind`, {})
const pray = (limitId: number, attribute: number, soulIds: string[]) =>
  client.post(`/api/game/bloodlines/${limitId}/prayer`, { attribute, soulIds })
const code = (response: { json: () => { error: { code: string } } }) => response.json().error.code

describe('GET /api/game/bloodlines/souls', () => {
  it('shows the empty inventory and the daily discoveries', async () => {
    const response = await client.get('/api/game/bloodlines/souls')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      souls: [],
      inventory: 250,
      socketsPerLimit: 5,
      discoveredToday: 0,
      discoverPerDay: 10,
      prayers: [],
      prayerMaxLevel: 9,
    })
    expect(response.json().types).toHaveLength(13)
  })
})

describe('POST /api/game/bloodlines/souls/discover', () => {
  it('adds loose souls of level 1-3 and counts them for today', async () => {
    const response = await discover(3)
    expect(response.statusCode).toBe(200)
    expect(response.json().souls).toHaveLength(3)
    expect(response.json().discoveredToday).toBe(3)
    for (const s of await souls()) {
      expect(s.limitId).toBeNull()
      expect([1, 2, 3]).toContain(s.level)
    }
    expect(await row()).toMatchObject({ soulDay: today(), soulsDiscovered: 3 })
  })

  it('caps discoveries at 10 per UTC day and resets on a new day', async () => {
    await set({ soulDay: today(), soulsDiscovered: 9 })
    const over = await discover(2)
    expect(over.statusCode).toBe(400)
    expect(code(over)).toBe('daily_limit')
    expect(await souls()).toHaveLength(0)
    expect((await discover(1)).statusCode).toBe(200)
    expect(code(await discover(1))).toBe('daily_limit')
    await set({ soulDay: '2020-01-01', soulsDiscovered: 10 })
    expect((await discover(10)).statusCode).toBe(200)
    expect(await row()).toMatchObject({ soulDay: today(), soulsDiscovered: 10 })
  })

  it('allows 30 a day with VIP', async () => {
    await set({
      vipUntil: new Date(Date.now() + 86_400_000),
      soulDay: today(),
      soulsDiscovered: 10,
    })
    expect((await client.get('/api/game/bloodlines/souls')).json().discoverPerDay).toBe(30)
    expect((await discover(20)).statusCode).toBe(200)
    expect(code(await discover(1))).toBe('daily_limit')
  })

  it('refuses when the inventory of 250 would overflow, socketed souls included', async () => {
    await unlock(1)
    await addSoul(1, 1, 1, 0)
    await db
      .insert(characterSouls)
      .values(Array.from({ length: 248 }, () => ({ characterId, type: 2, level: 1 })))
    const full = await discover(2)
    expect(full.statusCode).toBe(400)
    expect(code(full)).toBe('inventory_full')
    expect((await row()).soulsDiscovered).toBe(0)
    expect((await discover(1)).statusCode).toBe(200)
    expect(code(await discover(1))).toBe('inventory_full')
  })

  it('cannot pass the daily cap when two requests race', async () => {
    await set({ soulDay: today(), soulsDiscovered: 9 })
    const responses = await Promise.all([discover(1), discover(1)])
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect(await souls()).toHaveLength(1)
    expect((await row()).soulsDiscovered).toBe(10)
  })
})

describe('POST /api/game/bloodlines/souls/synthesize', () => {
  it('turns 3 souls of one level into 1 of level + 1', async () => {
    const ids = [await addSoul(1, 2), await addSoul(5, 2), await addSoul(9, 2)]
    const response = await synthesize(ids)
    expect(response.statusCode).toBe(200)
    const left = await souls()
    expect(left).toHaveLength(1)
    expect(left[0]!.level).toBe(3)
    expect(ids).not.toContain(left[0]!.id)
  })

  it('synthesizes several groups in one request', async () => {
    const ids = []
    for (const level of [1, 1, 1, 4, 4, 4]) ids.push(await addSoul(3, level))
    expect((await synthesize(ids)).statusCode).toBe(200)
    expect((await souls()).map((s) => s.level).sort()).toEqual([2, 5])
  })

  it('refuses mixed levels, level 10 and socketed souls and keeps them', async () => {
    const mixed = [await addSoul(1, 1), await addSoul(1, 1), await addSoul(1, 2)]
    expect(code(await synthesize(mixed))).toBe('bad_synthesis')
    const max = [await addSoul(1, 10), await addSoul(2, 10), await addSoul(3, 10)]
    expect(code(await synthesize(max))).toBe('bad_synthesis')
    await unlock(1)
    const socketed = [await addSoul(4, 1, 1, 0), await addSoul(4, 1), await addSoul(4, 1)]
    expect(code(await synthesize(socketed))).toBe('socketed')
    expect(await souls()).toHaveLength(9)
  })

  it('refuses souls of another ninja', async () => {
    const response = await synthesize([
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ])
    expect(response.statusCode).toBe(400)
    expect(code(response)).toBe('no_soul')
  })

  it('spends the souls once when two requests race', async () => {
    const ids = [await addSoul(1, 1), await addSoul(2, 1), await addSoul(3, 1)]
    const responses = await Promise.all([synthesize(ids), synthesize(ids)])
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect((await souls()).map((s) => s.level)).toEqual([2])
  })
})

describe('POST /api/game/bloodlines/souls/refine', () => {
  it('changes the type and consumes the fuel', async () => {
    const target = await addSoul(1, 2)
    const fuel = await addSoul(7, 2)
    const response = await refine(target, [fuel])
    expect(response.statusCode).toBe(200)
    const left = await souls()
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ id: target, level: 2 })
    expect(left[0]!.type).not.toBe(1)
  })

  it('needs fuel of the same level and refuses the target as its own fuel', async () => {
    const target = await addSoul(1, 2)
    const fuel = await addSoul(7, 1)
    expect(code(await refine(target, [fuel]))).toBe('level_mismatch')
    expect(code(await refine(target, [target]))).toBe('duplicate_soul')
    expect(await soul(target)).toMatchObject({ type: 1 })
    expect(await souls()).toHaveLength(2)
  })
})

describe('bind and unbind', () => {
  it('sockets a soul in an unlocked limit and frees it again', async () => {
    await unlock(1)
    const id = await addSoul(1, 1)
    const response = await bind(id, 1)
    expect(response.statusCode).toBe(200)
    expect(await soul(id)).toMatchObject({ limitId: 1, socket: 0 })
    expect((await unbind(id)).statusCode).toBe(200)
    expect(await soul(id)).toMatchObject({ limitId: null, socket: null })
    expect(code(await unbind(id))).toBe('not_socketed')
  })

  it('refuses a locked limit', async () => {
    const id = await addSoul(1, 1)
    expect(code(await bind(id, 2))).toBe('locked')
  })

  it('refuses a second soul of the same type in one limit', async () => {
    await unlock(1)
    await unlock(2)
    await bind(await addSoul(1, 1), 1)
    const second = await addSoul(1, 3)
    expect(code(await bind(second, 1))).toBe('duplicate_type')
    expect((await bind(second, 2)).statusCode).toBe(200)
  })

  it('has 5 sockets per limit', async () => {
    await unlock(1)
    for (const type of [1, 2, 3, 4, 5])
      expect((await bind(await addSoul(type, 1), 1)).statusCode).toBe(200)
    expect(code(await bind(await addSoul(6, 1), 1))).toBe('sockets_full')
    expect(
      (await souls())
        .filter((s) => s.limitId === 1)
        .map((s) => s.socket)
        .sort(),
    ).toEqual([0, 1, 2, 3, 4])
  })

  it('gates the soul level by character level', async () => {
    await unlock(1)
    await set({ level: 35 })
    expect(code(await bind(await addSoul(1, 4), 1))).toBe('too_low')
    expect((await bind(await addSoul(2, 3), 1)).statusCode).toBe(200)
  })

  it('cannot fill one socket twice when two binds race', async () => {
    await unlock(1)
    const a = await addSoul(1, 1)
    const b = await addSoul(1, 2)
    const responses = await Promise.all([bind(a, 1), bind(b, 1)])
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect((await souls()).filter((s) => s.limitId === 1)).toHaveLength(1)
  })
})

describe('POST /api/game/bloodlines/souls/destroy', () => {
  it('deletes loose souls only', async () => {
    await unlock(1)
    const loose = await addSoul(1, 1)
    const socketed = await addSoul(2, 1, 1, 0)
    expect(code(await destroy([loose, socketed]))).toBe('socketed')
    expect(await souls()).toHaveLength(2)
    expect((await destroy([loose])).statusCode).toBe(200)
    expect((await souls()).map((s) => s.id)).toEqual([socketed])
  })
})

describe('POST /api/game/bloodlines/:id/prayer', () => {
  it('feeds souls, levels up and carries the rest', async () => {
    await unlock(1)
    // 6 level-3 souls give 6 x 900 = 5400: level 1 with 400 toward 10000.
    const ids = []
    for (let i = 0; i < 6; i++) ids.push(await addSoul(1, 3))
    const response = await pray(1, 1, ids)
    expect(response.statusCode).toBe(200)
    expect(response.json().prayers).toEqual([
      { limitId: 1, attribute: 1, level: 1, progress: 400, needed: 10_000 },
    ])
    expect(await souls()).toHaveLength(0)
  })

  it('levels up several times from one bulk feed', async () => {
    await unlock(1)
    // Level 6 soul: 100 x 3^5 = 24300 -> 5000 + 10000 to level 2, 9300 toward 20000.
    await pray(1, 2, [await addSoul(1, 6)])
    expect(await prayer(1)).toMatchObject({ attribute: 2, level: 2, progress: 9300 })
  })

  it('resets level and progress when the attribute switches', async () => {
    await unlock(1)
    await db
      .insert(characterBloodlinePrayer)
      .values({ characterId, limitId: 1, attribute: 1, level: 4, progress: 300 })
    expect((await pray(1, 3, [await addSoul(1, 1)])).statusCode).toBe(200)
    expect(await prayer(1)).toMatchObject({ attribute: 3, level: 0, progress: 100 })
  })

  it('refuses a locked limit, socketed souls and the max level', async () => {
    const loose = await addSoul(1, 1)
    expect(code(await pray(1, 1, [loose]))).toBe('locked')
    await unlock(1)
    const socketed = await addSoul(2, 1, 1, 0)
    expect(code(await pray(1, 1, [socketed]))).toBe('socketed')
    await db
      .insert(characterBloodlinePrayer)
      .values({ characterId, limitId: 1, attribute: 1, level: 9 })
    expect(code(await pray(1, 1, [loose]))).toBe('max_level')
    expect(await souls()).toHaveLength(2)
  })
})

describe('fight stats', () => {
  it('socketed souls and prayer raise the fighter and refresh the arena defence', async () => {
    await unlock(1)
    await client.post('/api/game/bloodlines/1/active', { active: true })
    await client.get('/api/game/arena')
    const before = await playerFighter(db, await row())
    const baseline = await bloodlineBonuses(db, characterId)
    const old = new Date('2020-01-01T00:00:00Z')
    await db
      .update(arenaPlayers)
      .set({ snapshotAt: old })
      .where(eq(arenaPlayers.characterId, characterId))

    // Firm (defense) level 2 = 22.1; Guard (parry) level 1 = 7.8.
    await bind(await addSoul(1, 2), 1)
    await bind(await addSoul(10, 1), 1)
    // Prayer Strength level 1 = +800 (x100 internal).
    await pray(1, 1, [
      await addSoul(3, 2),
      await addSoul(3, 2),
      await addSoul(3, 3),
      await addSoul(3, 3),
      await addSoul(3, 3),
      await addSoul(3, 3),
      await addSoul(3, 3),
    ])
    const bonuses = await bloodlineBonuses(db, characterId)
    expect((bonuses.defense ?? 0) - (baseline.defense ?? 0)).toBe(22)
    expect((bonuses.parry ?? 0) - (baseline.parry ?? 0)).toBe(7)
    expect(bonuses.strength! - baseline.strength!).toBe(800)

    const after = await playerFighter(db, await row())
    expect(after.defense).toBeGreaterThan(before.defense)
    expect(after.parry).toBeGreaterThan(before.parry)
    const [arena] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, characterId))
    expect(arena!.snapshotAt!.getTime()).toBeGreaterThan(old.getTime())
    expect(
      await db.select().from(characterSouls).where(isNull(characterSouls.limitId)),
    ).toHaveLength(0)
  })
})
