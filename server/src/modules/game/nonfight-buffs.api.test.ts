// Item consumption, expiry, replacement, title ownership and non-fight bonuses.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { buffBonuses, buffExp, buffStone } from '../../game/nonfight-buffs.js'
import { playerOpponent } from '../arena/fights.js'
import { npc } from '../../game/data.js'
import { playerFighter } from '../../game/combat.js'
import {
  characters,
  inventoryItems,
  characterBuffs,
  characterTitles,
  arenaPlayers,
  characterQuests,
} from '../../db/schema.js'

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
  // Clothing 3: Ggio Vega (fists), Fire Village; level 1 max HP 220.
  const created = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  characterId = created.json().character.id
})
afterEach(() => app.close())
afterAll(() => close())

const give = async (itemId: string, count = 1) =>
  (await db.insert(inventoryItems).values({ characterId, itemId, count }).returning())[0]!
const use = (id: string) => client.post(`/api/game/items/${id}/use`)
const row = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const buffs = () =>
  db.select().from(characterBuffs).where(eq(characterBuffs.characterId, characterId))
// The worn creation outfit (outfits are items) is not bag contents.
const bag = () =>
  db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.characterId, characterId))
    .then((rows) => rows.filter((row) => row.equippedSlot !== 'Outfit'))
const view = async () => (await client.get('/api/game/buffs')).json()

describe('non-fight consumables', () => {
  it('consumes one food and applies its original properties to the live fighter', async () => {
    await db.update(characters).set({ level: 21 }).where(eq(characters.id, characterId))
    const food = await give('i120001', 2)
    expect((await use(food.id)).statusCode).toBe(200)
    expect(await buffs()).toEqual([expect.objectContaining({ buffId: 42103, group: 0 })])
    expect(await bag()).toEqual([expect.objectContaining({ count: 1 })])
    expect(await buffBonuses(db, characterId)).toMatchObject({ minAttack: 5, maxAttack: 5 })
    const before = (await playerFighter(db, await row())).maxAttack
    const active = (await view()).buffs[0]
    expect(active.nameKey).toBe('lg_Food11_itemname')
    expect(new Date(active.expiresAt).getTime() - Date.now()).toBeGreaterThan(3_590_000)
    expect((await client.post('/api/game/buffs/42103/remove')).statusCode).toBe(200)
    expect((await playerFighter(db, await row())).maxAttack).toBeLessThan(before)
  })
  it('lets potions heal up to the buffed HP maximum', async () => {
    await db.update(characters).set({ level: 21 }).where(eq(characters.id, characterId))
    await use((await give('i120019')).id)
    const maxHp = (await playerFighter(db, await row())).maxHp
    await db
      .update(characters)
      .set({ hp: maxHp - 1 })
      .where(eq(characters.id, characterId))
    const response = await use((await give('i160006')).id)
    expect(response.statusCode).toBe(200)
    expect(response.json().character.hp).toBe(maxHp)
  })
  it('replaces the same group, keeps the EXP group, and refreshes duration instead of stacking', async () => {
    await db.update(characters).set({ level: 21 }).where(eq(characters.id, characterId))
    await use((await give('i120001')).id)
    await use((await give('i120002')).id)
    await use((await give('i120019', 2)).id)
    expect((await buffs()).map((row) => row.buffId).sort()).toEqual([42101, 50001])
    await use((await bag()).find((row) => row.itemId === 'i120019')!.id)
    expect(await buffs()).toHaveLength(2)
    expect(await buffBonuses(db, characterId)).toMatchObject({ hp: 36, expMul: 100 })
    expect((await buffBonuses(db, characterId)).minAttack ?? 0).toBe(0)
  })
  it('keeps food when the level is too low and rejects items held in market storage', async () => {
    const food = await give('i120001')
    expect((await use(food.id)).json().error.code).toBe('too_low')
    expect(await bag()).toHaveLength(1)
    const other = await give('i120002')
    await db
      .update(inventoryItems)
      .set({ location: 'warehouse' })
      .where(eq(inventoryItems.id, other.id))
    expect((await use(other.id)).statusCode).toBe(404)
    expect(await buffs()).toEqual([])
  })
  it('consumes a shared item at most once across simultaneous requests', async () => {
    const food = await give('i120002')
    const results = await Promise.all([use(food.id), use(food.id)])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404])
    expect(await bag()).toEqual([])
    expect(await buffs()).toHaveLength(1)
  })
  it('ignores expired effects in stats, lists and EXP rewards', async () => {
    await use((await give('i120002')).id)
    expect(buffExp(100, await row(), (await buffBonuses(db, characterId)).expMul)).toBe(200)
    await db
      .update(characterBuffs)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(characterBuffs.characterId, characterId))
    expect(await buffBonuses(db, characterId)).toEqual({})
    expect((await view()).buffs).toEqual([])
    expect(buffExp(100, await row(), (await buffBonuses(db, characterId)).expMul)).toBe(100)
  })
  it('records the food command when using a consumable', async () => {
    await db.insert(characterQuests).values({ characterId, taskId: 59402, state: 0, progress: [0] })
    expect((await use((await give('i120002')).id)).statusCode).toBe(200)
    const [quest] = await db.select().from(characterQuests).where(eq(characterQuests.taskId, 59402))
    expect(quest!.state).toBe(1)
    expect(quest!.progress).toEqual([1])
  })
  it('pays the food EXP bonus after an actual field fight', async () => {
    await db
      .update(characters)
      .set({ level: 21, sceneId: 2101, hp: 99999, mp: 99999 })
      .where(eq(characters.id, characterId))
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId: 'i270100', equippedSlot: 'Weapon' })
    await use((await give('i120002')).id)
    const response = await client.post('/api/game/fight', { monsterId: 'n33017' })
    expect(response.statusCode).toBe(200)
    expect(response.json().won).toBe(true)
    expect(response.json().rewards.exp).toBe(Number(npc('n33017')!.NpcExp) * 2)
  })
  it('adds VIP and food EXP bonuses, and follows the original Stone multiplier bounds', async () => {
    await db
      .update(characters)
      .set({ vipUntil: new Date(Date.now() + 60_000) })
      .where(eq(characters.id, characterId))
    expect(buffExp(100, await row(), 100)).toBe(250)
    expect(buffStone(200, 5)).toBe(210)
    expect(buffStone(200, 300)).toBe(800)
    expect(buffStone(200, 301)).toBe(200)
    expect(buffStone(200, -5)).toBe(200)
  })
})

describe('title items', () => {
  it('unlocks a title once, keeps duplicate items, and applies a bonus only while equipped', async () => {
    const title = await give('i190202')
    expect((await use(title.id)).statusCode).toBe(200)
    expect(await db.select().from(characterTitles)).toEqual([
      expect.objectContaining({ titleId: 12, active: false, expiresAt: null }),
    ])
    expect(await buffBonuses(db, characterId)).toEqual({})
    const duplicate = await give('i190202')
    expect((await use(duplicate.id)).json().error.code).toBe('title_owned')
    expect(await bag()).toHaveLength(1)
    expect((await client.post('/api/game/titles/activate', { titleId: 12 })).statusCode).toBe(200)
    expect(await buffBonuses(db, characterId)).toMatchObject({ capMul: 5 })
    expect((await client.post('/api/game/buffs/90010/remove')).statusCode).toBe(400)
    expect((await client.post('/api/game/titles/activate', { titleId: 0 })).statusCode).toBe(200)
    expect(await buffBonuses(db, characterId)).toEqual({})
  })
  it('expires temporary titles and their bonuses, and never equips an unowned title', async () => {
    await use((await give('i190201')).id)
    const [title] = await db.select().from(characterTitles)
    const expected = new Date()
    expected.setUTCHours(0, 0, 0, 0)
    expected.setUTCDate(expected.getUTCDate() + 14)
    expect(title!.expiresAt).toEqual(expected)
    expect((await client.post('/api/game/titles/activate', { titleId: 30 })).statusCode).toBe(200)
    expect((await buffBonuses(db, characterId)).neglectDefense).toBe(54)
    await db
      .update(characterTitles)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(characterTitles.characterId, characterId))
    await db
      .update(characterBuffs)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(characterBuffs.characterId, characterId))
    expect((await view()).titles).toEqual([])
    expect(await buffBonuses(db, characterId)).toEqual({})
    expect((await client.post('/api/game/titles/activate', { titleId: 30 })).statusCode).toBe(400)
    expect((await client.post('/api/game/titles/activate', { titleId: 999 })).statusCode).toBe(400)
  })
})

describe('arena buff snapshots', () => {
  it('refreshes on a food change and rebuilds an expired defence snapshot', async () => {
    await db.update(characters).set({ level: 21 }).where(eq(characters.id, characterId))
    await db.insert(arenaPlayers).values({ characterId })
    await use((await give('i120001')).id)
    const [arena] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, characterId))
    const snapshot = arena!.snapshot as { fighter: { maxAttack: number }; buffExpiresAt: string }
    expect(snapshot.buffExpiresAt).toBe((await buffs())[0]!.expiresAt!.toISOString())
    await db
      .update(characterBuffs)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(characterBuffs.characterId, characterId))
    const stale = {
      ...arena!,
      snapshot: { ...snapshot, buffExpiresAt: new Date(Date.now() - 1).toISOString() },
    }
    const character = await row()
    const opponent = await db.transaction((tx) => playerOpponent(tx, character, stale))
    expect(opponent.fighter.maxAttack).toBeLessThan(snapshot.fighter.maxAttack)
  })
})
