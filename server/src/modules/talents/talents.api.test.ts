// Talents (M5 task 6): upgrade cost by attempt, daily attempts, caps, activation and races.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { arenaPlayers, characters, characterTalents } from '../../db/schema.js'
import { talentFighterInput, talentRoutes } from './routes.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  // Remove once server/src/app.ts registers talentRoutes (coordinator wiring).
  app.register(talentRoutes, { db, prefix: '/api/game/talents' })
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
  await set({ level: 60, stone: 100_000_000, gold: 1000 })
})
afterEach(() => app.close())
afterAll(() => close())

const today = () => new Date().toISOString().slice(0, 10)
const set = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const row = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const talentRow = async (talentId: number) =>
  (
    await db
      .select()
      .from(characterTalents)
      .where(
        and(eq(characterTalents.characterId, characterId), eq(characterTalents.talentId, talentId)),
      )
  )[0]
const setTalent = (talentId: number, values: { level: number; exp?: number }) =>
  db
    .insert(characterTalents)
    .values({ characterId, talentId, ...values })
    .onConflictDoUpdate({
      target: [characterTalents.characterId, characterTalents.talentId],
      set: values,
    })
const upgrade = (id: number, useGold = false) =>
  client.post(`/api/game/talents/${id}/upgrade`, { useGold })
const activate = (id: number, active = true) =>
  client.post(`/api/game/talents/${id}/active`, { active })

describe('GET /api/game/talents', () => {
  it('lists 8 talents with the cap, attempts and the first cost', async () => {
    const response = await client.get('/api/game/talents')
    expect(response.statusCode).toBe(200)
    const view = response.json()
    expect(view.talents).toHaveLength(8)
    expect(view.talents[0]).toMatchObject({ talentId: 1, level: 0, exp: 0, expNeeded: 100 })
    expect(view).toMatchObject({
      unlockLevel: 51,
      cap: 10,
      attemptsUsed: 0,
      attemptsPerDay: 40,
      maxActive: 3,
      nextCost: { gold: 2, stones: 10000 },
    })
  })
})

describe('POST /api/game/talents/:id/upgrade', () => {
  it('refuses below level 51', async () => {
    await set({ level: 50 })
    const response = await upgrade(1)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('too_low')
    expect((await row()).stone).toBe(100_000_000)
  })

  it('charges the 1st attempt in Stone and gives 100 or 300 EXP', async () => {
    const response = await upgrade(1)
    expect(response.statusCode).toBe(200)
    const { upgrade: result, character } = response.json()
    expect([100, 300]).toContain(result.exp)
    expect(result.crit).toBe(result.exp === 300)
    expect(character.stone).toBe(100_000_000 - 10000)
    expect((await row()).talentAttemptsUsed).toBe(1)
    expect((await row()).talentDay).toBe(today())
    // 100 EXP reaches level 1 (expNeeded[0] = 100).
    expect((await talentRow(1))!.level).toBe(1)
  })

  it.each([
    [10, 'stone', 5_120_000],
    [10, 'gold', 11],
    [17, 'stone', 5_120_000],
    [17, 'gold', 18],
  ] as const)('charges the %ith attempt %s', async (attempt, currency, cost) => {
    await set({ talentDay: today(), talentAttemptsUsed: attempt - 1, level: 90 })
    const before = await row()
    const response = await upgrade(2, currency === 'gold')
    expect(response.statusCode).toBe(200)
    expect(before[currency] - (await row())[currency]).toBe(cost)
    expect((await row()).talentAttemptsUsed).toBe(attempt)
  })

  it('refuses the 41st attempt of the day', async () => {
    await set({ talentDay: today(), talentAttemptsUsed: 40 })
    const response = await upgrade(1)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('no_attempts')
    expect((await row()).stone).toBe(100_000_000)
  })

  it('resets the attempts on a new UTC day', async () => {
    await set({ talentDay: '2020-01-01', talentAttemptsUsed: 40 })
    expect((await client.get('/api/game/talents')).json().attemptsUsed).toBe(0)
    const response = await upgrade(1)
    expect(response.statusCode).toBe(200)
    expect((await row()).stone).toBe(100_000_000 - 10000)
    expect(await row()).toMatchObject({ talentDay: today(), talentAttemptsUsed: 1 })
  })

  it.each([
    ['stone', { stone: 9999 }],
    ['gold', { gold: 1 }],
  ] as const)('refuses when %s is short and spends nothing', async (currency, values) => {
    await set(values)
    const response = await upgrade(1, currency === 'gold')
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('no_money')
    expect(await row()).toMatchObject({ ...values, talentAttemptsUsed: 0 })
    expect(await talentRow(1)).toBeUndefined()
  })

  it('refuses a talent at the level cap (level - 50)', async () => {
    await setTalent(3, { level: 10 })
    const response = await upgrade(3)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('talent_capped')
    expect((await row()).talentAttemptsUsed).toBe(0)
  })

  it('levels up with carried EXP but never past the cap', async () => {
    await set({ level: 52 })
    // Level 1 with 230 EXP: +100 or +300 reaches level 2 (240) and stops at the cap 2.
    await setTalent(4, { level: 1, exp: 230 })
    const { upgrade: result } = (await upgrade(4)).json()
    expect(result.levelsGained).toBe(1)
    const talent = (await talentRow(4))!
    expect(talent.level).toBe(2)
    expect(talent.exp).toBe(230 + result.exp - 240)
    expect((await upgrade(4)).json().error.code).toBe('talent_capped')
  })

  it('never overspends under concurrent upgrades', async () => {
    // Enough Stone for exactly attempts 1 and 2 (10,000 + 20,000).
    await set({ stone: 30000 })
    const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => upgrade((i % 8) + 1)))
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(2)
    expect(await row()).toMatchObject({ stone: 0, talentAttemptsUsed: 2 })
  })
})

describe('POST /api/game/talents/:id/active', () => {
  it('needs talent level 1 to activate', async () => {
    const response = await activate(1)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('talent_untrained')
  })

  it('activates at most 3 and deactivates', async () => {
    for (const id of [1, 2, 3, 4]) await setTalent(id, { level: 2 })
    for (const id of [1, 2, 3]) expect((await activate(id)).statusCode).toBe(200)
    const fourth = await activate(4)
    expect(fourth.statusCode).toBe(400)
    expect(fourth.json().error.code).toBe('too_many_active')
    expect((await activate(2, false)).statusCode).toBe(200)
    const view = (await activate(4)).json()
    expect(
      view.talents
        .filter((t: { active: boolean }) => t.active)
        .map((t: { talentId: number }) => t.talentId),
    ).toEqual([1, 3, 4])
    // Activating an active talent again is a no-op.
    expect((await activate(4)).statusCode).toBe(200)
  })

  it('feeds active talents, capped by level, into the fighter and the arena snapshot', async () => {
    await setTalent(1, { level: 10 })
    await setTalent(5, { level: 4 })
    await setTalent(6, { level: 3 })
    await activate(1)
    await activate(5)
    await set({ level: 55 })
    expect(await talentFighterInput(db, characterId)).toEqual({ 1: 5, 5: 4 })
    await client.get('/api/game/arena')
    const old = new Date('2020-01-01T00:00:00Z')
    await db
      .update(arenaPlayers)
      .set({ snapshotAt: old })
      .where(eq(arenaPlayers.characterId, characterId))
    await activate(5, false)
    const [after] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, characterId))
    expect(after!.snapshotAt!.getTime()).toBeGreaterThan(old.getTime())
  })
})
