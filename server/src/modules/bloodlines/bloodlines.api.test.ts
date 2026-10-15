// Bloodline limits (M5 task 7): Ninja House turn-ins, 3 active limits and their fight bonuses.
import { playerFighter, playerFighterFrom } from '../../game/combat.js'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  arenaPlayers,
  characterBloodlinePrayer,
  characterBloodlines,
  characters,
  characterSouls,
  inventoryItems,
} from '../../db/schema.js'
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
const limitRow = async (limitId: number) =>
  (
    await db
      .select()
      .from(characterBloodlines)
      .where(
        and(
          eq(characterBloodlines.characterId, characterId),
          eq(characterBloodlines.limitId, limitId),
        ),
      )
  )[0]
const give = (itemId: string, count: number) =>
  db.insert(inventoryItems).values({ characterId, itemId, count, bound: true })
const held = async (itemId: string) =>
  (
    await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.characterId, characterId), eq(inventoryItems.itemId, itemId)))
  ).reduce((sum, r) => sum + r.count, 0)
const unlock = (limitId: number) =>
  db
    .insert(characterBloodlines)
    .values({ characterId, limitId, amity: 4500, unlockedAt: new Date() })
const turnIn = (id: number) => client.post(`/api/game/bloodlines/${id}/turn-in`, {})
const activate = (id: number, active = true) =>
  client.post(`/api/game/bloodlines/${id}/active`, { active })

describe('GET /api/game/bloodlines', () => {
  it('lists the 44 limits with amity, target, level, items held and the daily count', async () => {
    await give('i148023', 6)
    const response = await client.get('/api/game/bloodlines')
    expect(response.statusCode).toBe(200)
    const view = response.json()
    expect(view.limits).toHaveLength(44)
    expect(view.limits[0]).toMatchObject({
      limitId: 1,
      nameKey: 'reborn_limit_1',
      npcId: 81001,
      requiredLevel: 16,
      unlockItem: 'i148023',
      dropLevel: 16,
      itemsHeld: 6,
      amity: 0,
      amityNeeded: 30,
      unlocked: false,
      active: false,
      activeSlot: null,
    })
    // Reborn's Ninja House card: "Drops: SM Lv71+" for the last band.
    expect(
      view.limits.find((l: { unlockItem: string }) => l.unlockItem === 'i148040'),
    ).toMatchObject({
      dropLevel: 71,
    })
    expect(view).toMatchObject({
      turnInsUsed: 0,
      turnInsPerDay: 10,
      itemsPerTurnIn: 4,
      maxActive: 3,
      bonuses: [],
    })
  })

  it('labels the active bonuses', async () => {
    await unlock(1)
    await activate(1)
    const { bonuses } = (await client.get('/api/game/bloodlines')).json()
    expect(bonuses).toContainEqual({ field: 'tough', label: 'Constitution', value: 43 })
    expect(bonuses).toContainEqual({ field: 'strength', label: 'Strength', value: 5300 })
  })
})

describe('POST /api/game/bloodlines/:id/turn-in', () => {
  it('refuses fewer than 4 items and keeps them', async () => {
    await give('i148024', 3)
    const response = await turnIn(3)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('not_enough_items')
    expect(await held('i148024')).toBe(3)
    expect((await row()).bloodlineTurnIns).toBe(0)
  })

  it('refuses below the required level', async () => {
    await set({ level: 24 })
    await give('i148024', 4)
    const response = await turnIn(3)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('too_low')
    expect(await held('i148024')).toBe(4)
  })

  it('takes 4 items for +30 amity and unlocks on the exact turn-in', async () => {
    await give('i148024', 30)
    for (let i = 1; i <= 6; i++) {
      const view = (await turnIn(3)).json()
      expect(view.limits[2]).toMatchObject({ amity: 30 * i, unlocked: false })
    }
    const last = await turnIn(3)
    expect(last.statusCode).toBe(200)
    expect(last.json().limits[2]).toMatchObject({ amity: 210, unlocked: true })
    expect(last.json().character.id).toBe(characterId)
    expect(await held('i148024')).toBe(2)
    expect((await limitRow(3))!.unlockedAt).not.toBeNull()
    expect(await row()).toMatchObject({ bloodlineDay: today(), bloodlineTurnIns: 7 })
  })

  it('refuses a limit that is already unlocked', async () => {
    await unlock(1)
    await give('i148023', 4)
    const response = await turnIn(1)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('already_unlocked')
    expect(await held('i148023')).toBe(4)
  })

  it('refuses the 11th turn-in of the day and resets on a new UTC day', async () => {
    await give('i148027', 8)
    await set({ bloodlineDay: today(), bloodlineTurnIns: 10 })
    const response = await turnIn(9)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('daily_limit')
    expect(await held('i148027')).toBe(8)
    await set({ bloodlineDay: '2020-01-01' })
    expect((await turnIn(9)).statusCode).toBe(200)
    expect(await row()).toMatchObject({ bloodlineDay: today(), bloodlineTurnIns: 1 })
  })

  it('spends the items once when two turn-ins race', async () => {
    await give('i148024', 4)
    const responses = await Promise.all([turnIn(3), turnIn(3)])
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect(await held('i148024')).toBe(0)
    expect((await limitRow(3))!.amity).toBe(30)
    expect((await row()).bloodlineTurnIns).toBe(1)
  })
})

describe('POST /api/game/bloodlines/:id/active', () => {
  it('needs an unlocked limit', async () => {
    const response = await activate(1)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('locked')
  })

  it('activates at most 3 and deactivates', async () => {
    for (const id of [1, 2, 3, 4]) await unlock(id)
    for (const id of [1, 2, 3]) expect((await activate(id)).statusCode).toBe(200)
    const fourth = await activate(4)
    expect(fourth.statusCode).toBe(400)
    expect(fourth.json().error.code).toBe('too_many_active')
    expect((await activate(2, false)).statusCode).toBe(200)
    const view = (await activate(4)).json()
    expect(
      view.limits
        .filter((l: { active: boolean }) => l.active)
        .map((l: { limitId: number }) => l.limitId),
    ).toEqual([1, 3, 4])
    expect((await activate(4)).statusCode).toBe(200)
  })

  it('reports the slot of each active limit, refilling the lowest free one', async () => {
    for (const id of [1, 2, 3]) await unlock(id)
    for (const id of [1, 2]) await activate(id)
    await activate(1, false)
    const view = (await activate(3)).json()
    const slotOf = (id: number) =>
      view.limits.find((l: { limitId: number }) => l.limitId === id).activeSlot
    expect([slotOf(1), slotOf(2), slotOf(3)]).toEqual([null, 1, 0])
  })

  it('refreshes the arena snapshot', async () => {
    await unlock(1)
    await client.get('/api/game/arena')
    const old = new Date('2020-01-01T00:00:00Z')
    await db
      .update(arenaPlayers)
      .set({ snapshotAt: old })
      .where(eq(arenaPlayers.characterId, characterId))
    await activate(1)
    const [after] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, characterId))
    expect(after!.snapshotAt!.getTime()).toBeGreaterThan(old.getTime())
  })
})

describe('bloodlineBonuses', () => {
  it('is empty without active limits', async () => {
    await unlock(1)
    expect(await bloodlineBonuses(db, characterId)).toEqual({})
  })

  it('sums limits 1 + 2, socketed souls and prayer, and raises the fighter by those terms', async () => {
    await unlock(1)
    await unlock(2)
    await activate(1)
    await activate(2)
    // Firm (type 1, defense) level 2 socketed in limit 1; a loose soul adds nothing.
    await db.insert(characterSouls).values([
      { characterId, type: 1, level: 2, limitId: 1, socket: 0 },
      { characterId, type: 1, level: 5 },
    ])
    // Prayer on limit 2: Agility (2) level 3 = 3 x 800.
    await db
      .insert(characterBloodlinePrayer)
      .values({ characterId, limitId: 2, attribute: 2, level: 3 })
    const bonuses = await bloodlineBonuses(db, characterId)
    expect(bonuses).toEqual({
      strength: 2300 + 3000 + 1800,
      agility: 1100 + 1300 + 2400,
      stamina: 2300 + 2400,
      skillAdd5: 2,
      skillAdd6: 2,
      tough: 43,
      // Firm level 2 is 22.1: summed, then truncated.
      defense: 75,
      neglectDefense: 47,
    })
    const character = await row()
    const without = playerFighterFrom(character, [])
    const withLimits = playerFighterFrom(character, [], bonuses)
    expect(withLimits.tough - without.tough).toBe(43)
    expect(withLimits.neglectDefense - without.neglectDefense).toBe(47)
    expect(withLimits.maxHp).toBeGreaterThan(without.maxHp)
  })
  it('raises the live fighter and the arena defence of an active limit', async () => {
    await client.get('/api/game/arena')
    const before = await playerFighter(db, await row())
    await unlock(1)
    await activate(1)
    const after = await playerFighter(db, await row())
    expect(after.maxHp).toBeGreaterThan(before.maxHp)
    expect(after.tough).toBeGreaterThan(before.tough)
    const [arena] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, characterId))
    const snapshot = arena!.snapshot as unknown as { fighter: { maxHp: number } }
    expect(snapshot.fighter.maxHp).toBe(after.maxHp)
  })
})
