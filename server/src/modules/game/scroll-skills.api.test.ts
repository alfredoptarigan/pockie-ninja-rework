// Scroll skills (M5 decision 18): learning from 7-day and permanent scrolls, 2 per skill-bar tree,
// expired skills out of fights and arena snapshots.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { playerFighter } from '../../game/combat.js'
import {
  arenaPlayers,
  characters,
  characterSkills,
  characterSkillSlots,
  inventoryItems,
} from '../../db/schema.js'
import { arenaFighter } from '../arena/snapshot.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

const DAY = 24 * 60 * 60 * 1000
// i540001 / i540101: Izanagi (1831); i540007: skill 1833; i540112: skill 18046.
const IZANAGI = 1831

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
})
afterEach(() => app.close())
afterAll(() => close())

const give = async (itemId: string, count = 1) =>
  (await db.insert(inventoryItems).values({ characterId, itemId, count }).returning())[0]!
const use = (id: string) => client.post(`/api/game/items/${id}/use`)
const row = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const scrollRow = async (skillId = IZANAGI) =>
  (
    await db
      .select()
      .from(characterSkills)
      .where(
        and(eq(characterSkills.characterId, characterId), eq(characterSkills.skillId, skillId)),
      )
  )[0]
const bag = () =>
  db.select().from(inventoryItems).where(eq(inventoryItems.characterId, characterId))
const setSlot = (slot: number, skillId: number | null, tree = 0) =>
  client.post('/api/game/skills/slot', { tree, slot, skillId })
const fighterSkillIds = async () =>
  ((await playerFighter(db, await row())).skills ?? []).map((skill) => skill.id)
const expire = (skillId = IZANAGI) =>
  db
    .update(characterSkills)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(and(eq(characterSkills.characterId, characterId), eq(characterSkills.skillId, skillId)))

describe('scroll skill items', () => {
  it('learns a 7-day scroll and extends from the current expiry on reuse', async () => {
    const scrolls = await give('i540001', 2)
    const before = Date.now()
    expect((await use(scrolls.id)).statusCode).toBe(200)
    const first = (await scrollRow())!.expiresAt!.getTime()
    expect(first).toBeGreaterThanOrEqual(before + 7 * DAY)
    expect(first).toBeLessThanOrEqual(Date.now() + 7 * DAY)
    expect((await use(scrolls.id)).statusCode).toBe(200)
    expect((await scrollRow())!.expiresAt!.getTime()).toBe(first + 7 * DAY)
    expect(await bag()).toEqual([])
  })

  it('restarts an expired 7-day skill from now', async () => {
    const scrolls = await give('i540001', 2)
    await use(scrolls.id)
    await expire()
    const before = Date.now()
    expect((await use(scrolls.id)).statusCode).toBe(200)
    const expiry = (await scrollRow())!.expiresAt!.getTime()
    expect(expiry).toBeGreaterThanOrEqual(before + 7 * DAY)
    expect(expiry).toBeLessThanOrEqual(Date.now() + 7 * DAY)
  })

  it('makes a skill permanent and then refuses a 7-day scroll without consuming it', async () => {
    const week = await give('i540001', 2)
    const forever = await give('i540101')
    await use(week.id)
    expect((await use(forever.id)).statusCode).toBe(200)
    expect((await scrollRow())!.expiresAt).toBeNull()
    const refused = await use(week.id)
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error.code).toBe('already_permanent')
    expect(await bag()).toEqual([expect.objectContaining({ itemId: 'i540001', count: 1 })])
  })

  it('consumes the scroll exactly once under concurrent use', async () => {
    const scroll = await give('i540001')
    const results = await Promise.all([use(scroll.id), use(scroll.id), use(scroll.id)])
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1)
    expect(await bag()).toEqual([])
    const expiry = (await scrollRow())!.expiresAt!.getTime()
    expect(expiry).toBeLessThanOrEqual(Date.now() + 7 * DAY)
  })

  it('lists learned scroll skills apart from ninjutsu in the skill view', async () => {
    await use((await give('i540101')).id)
    await use((await give('i540007')).id)
    const view = (await client.get('/api/game/skills')).json()
    expect(view.scrolls).toEqual([
      { skillId: IZANAGI, expiresAt: null },
      { skillId: 1833, expiresAt: expect.any(String) },
    ])
    expect(view.learned.map((skill: { skillId: number }) => skill.skillId)).not.toContain(IZANAGI)
  })
})

describe('scroll skills in the skill bar', () => {
  it('slots at most two scroll skills per tree', async () => {
    for (const itemId of ['i540101', 'i540107', 'i540112']) await use((await give(itemId)).id)
    expect((await setSlot(0, IZANAGI)).statusCode).toBe(200)
    expect((await setSlot(1, 1833)).statusCode).toBe(200)
    const third = await setSlot(2, 18046)
    expect(third.statusCode).toBe(400)
    expect(third.json().error.code).toBe('not_slottable')
    // Replacing one of the two, or using another tree, is fine.
    expect((await setSlot(1, 18046)).statusCode).toBe(200)
    expect((await setSlot(0, 1833, 1)).statusCode).toBe(200)
    expect((await fighterSkillIds()).filter((id) => [IZANAGI, 18046].includes(id))).toEqual([
      IZANAGI,
      18046,
    ])
  })

  it('refuses unlearned scroll skills', async () => {
    const response = await setSlot(0, IZANAGI)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('not_learned')
  })

  it('drops an expired skill from fights and the arena snapshot, and deletes it lazily', async () => {
    await db.insert(arenaPlayers).values({ characterId })
    await use((await give('i540001')).id)
    expect((await setSlot(0, IZANAGI)).statusCode).toBe(200)
    expect(await fighterSkillIds()).toContain(IZANAGI)
    await expire()
    expect(await fighterSkillIds()).not.toContain(IZANAGI)
    const built = await db.transaction(async (tx) => arenaFighter(tx, await row()))
    expect(built.fighter.skills?.map((skill) => skill.id)).not.toContain(IZANAGI)
    const view = (await client.get('/api/game/skills')).json()
    expect(view.scrolls).toEqual([])
    expect(await scrollRow()).toBeUndefined()
    expect(
      await db
        .select()
        .from(characterSkillSlots)
        .where(eq(characterSkillSlots.characterId, characterId)),
    ).toEqual([])
    expect((await setSlot(0, IZANAGI)).json().error.code).toBe('not_learned')
  })

  it('keeps scroll skills through a skill reset', async () => {
    await use((await give('i540101')).id)
    await db.update(characters).set({ gold: 100 }).where(eq(characters.id, characterId))
    expect((await client.post('/api/game/skills/reset', { currency: 'gold' })).statusCode).toBe(200)
    expect(await scrollRow()).toMatchObject({ expiresAt: null })
  })
})
