// Skill bars, active combat inputs, paid resets and free-reset item consumption.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { playerFighter } from '../../game/combat.js'
import { simulateFight } from '@pockie/game-core'
import {
  characters,
  inventoryItems,
  characterSkills,
  characterSkillSlots,
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
  // Clothing 3: Ggio Vega (sharp in Reborn), Fire Village; level 1 max HP 220.
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

vi.mock('@pockie/game-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pockie/game-core')>()
  return { ...actual, simulateFight: vi.fn(actual.simulateFight) }
})
const row = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const give = async (itemId: string, count = 1) =>
  (await db.insert(inventoryItems).values({ characterId, itemId, count }).returning())[0]!
const view = async () => (await client.get('/api/game/skills')).json()
const setSlot = (slot: number, skillId: number | null, tree = 0, level = 1) =>
  client.post('/api/game/skills/slot', { tree, slot, skillId, level })
const learned = () =>
  db
    .select()
    .from(characterSkills)
    .where(eq(characterSkills.characterId, characterId))
    .orderBy(characterSkills.skillId)
const slots = () =>
  db.select().from(characterSkillSlots).where(eq(characterSkillSlots.characterId, characterId))
const reset = (currency = 'gold') => client.post('/api/game/skills/reset', { currency })
async function seedSkills() {
  await view()
  await db
    .insert(characterSkills)
    .values([1803, 1807, 2801].map((skillId) => ({ characterId, skillId, level: 1 })))
}

describe('outfit star skill slots (Reborn: a 7th at 2 stars, an 8th at 5)', () => {
  const setStars = async (stars: number) =>
    db.update(inventoryItems).set({ stars }).where(eq(inventoryItems.characterId, characterId))

  it('opens slots 7 and 8 with the worn outfit stars and drops them from fights without', async () => {
    await seedSkills()
    expect(code(await setSlot(6, 1803))).toBe('slot_locked')
    await setStars(2)
    expect((await view()).trees[0]).toHaveLength(7)
    expect((await setSlot(6, 1803)).statusCode).toBe(200)
    expect(code(await setSlot(7, 1807))).toBe('slot_locked')
    await setStars(5)
    expect((await view()).trees[0]).toHaveLength(8)
    expect((await setSlot(7, 1807)).statusCode).toBe(200)
    const ids = async () =>
      (await playerFighter(db, await row())).skills?.map((skill) => skill.secondid ?? skill.id)
    expect(await ids()).toEqual(expect.arrayContaining([1803, 1807]))
    await setStars(0)
    expect(await ids()).not.toContain(1803)
    expect((await view()).trees[0]).toHaveLength(6)
  })
})

const code = (response: { json: () => { error?: { code: string } } }) => response.json().error?.code

describe('skill trees', () => {
  it('has five six-slot trees (Reborn presets 1-5) and loads only the active tree plus learned passives', async () => {
    await seedSkills()
    expect((await view()).trees.map((tree: unknown[]) => tree.length)).toEqual([6, 6, 6, 6, 6])
    expect((await setSlot(0, 1803)).statusCode).toBe(200)
    expect((await setSlot(0, 1807, 1)).statusCode).toBe(200)
    expect(
      (await playerFighter(db, await row())).skills?.map((skill) => skill.secondid ?? skill.id),
    ).toEqual(expect.arrayContaining([1803, 2801]))
    expect((await playerFighter(db, await row())).skills?.map((skill) => skill.id)).not.toContain(
      1807,
    )
    expect((await client.post('/api/game/skills/tree', { tree: 1 })).statusCode).toBe(200)
    expect((await playerFighter(db, await row())).skills?.map((skill) => skill.id)).toContain(1807)
    expect((await playerFighter(db, await row())).skills?.map((skill) => skill.id)).not.toContain(
      1803,
    )
    // Preset 5 is the last tree.
    expect((await setSlot(0, 1803, 4)).statusCode).toBe(200)
    expect((await client.post('/api/game/skills/tree', { tree: 4 })).statusCode).toBe(200)
    expect((await view()).activeTree).toBe(4)
    expect((await client.post('/api/game/skills/tree', { tree: 5 })).statusCode).toBe(400)
  })
  it('moves duplicate skills within a tree, allows them in other trees, and clears slots', async () => {
    await seedSkills()
    await setSlot(0, 1803)
    await setSlot(1, 1803)
    await setSlot(0, 1803, 1)
    expect(await slots()).toHaveLength(2)
    expect((await view()).trees[0][0].skillId).toBeNull()
    expect((await view()).trees[0][1].skillId).toBe(1803)
    expect((await setSlot(1, null)).statusCode).toBe(200)
    expect(await slots()).toHaveLength(1)
  })
  it('rejects unlearned skills, passive slots, invalid trees and levels without changing the bar', async () => {
    await seedSkills()
    await setSlot(0, 1803)
    for (const args of [
      [0, 1802, 0, 1],
      [0, 2801, 0, 1],
      [6, 1803, 0, 1],
      [0, 1803, 5, 1],
      [0, 1803, 0, 2],
    ]) {
      expect((await setSlot(args[0]!, args[1]!, args[2]!, args[3]!)).statusCode).toBe(400)
    }
    expect(await slots()).toEqual([expect.objectContaining({ skillId: 1803, slot: 0, level: 1 })])
  })
  it('supports a lower selected level and resolves the matching original skill row', async () => {
    await view()
    await db.insert(characterSkills).values({ characterId, skillId: 1803, level: 2 })
    expect((await setSlot(0, 1803, 0, 2)).statusCode).toBe(200)
    expect((await playerFighter(db, await row())).skills).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 11803, secondid: 1803, level: 2 })]),
    )
    await setSlot(0, 1803, 0, 1)
    expect((await playerFighter(db, await row())).skills).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 1803, level: 1 })]),
    )
  })
  it('records the original fill-six-skills quest command only when the first tree is full', async () => {
    await db.update(characters).set({ level: 8 }).where(eq(characters.id, characterId))
    const learned = (await view()).learned as { skillId: number }[]
    await db.insert(characterQuests).values({ characterId, taskId: 50017, state: 0, progress: [0] })
    for (let slot = 0; slot < 5; slot++) await setSlot(slot, learned[slot]!.skillId)
    expect(
      (await db.select().from(characterQuests).where(eq(characterQuests.taskId, 50017)))[0]!.state,
    ).toBe(0)
    await setSlot(5, learned[5]!.skillId)
    expect(
      (await db.select().from(characterQuests).where(eq(characterQuests.taskId, 50017)))[0]!.state,
    ).toBe(1)
  })
  it('feeds slotted skills into the actual field fight and refreshes arena defence on change', async () => {
    await seedSkills()
    await db.insert(arenaPlayers).values({ characterId })
    await setSlot(0, 1803)
    const [arena] = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.characterId, characterId))
    expect(arena!.snapshot).toMatchObject({
      fighter: { skills: expect.arrayContaining([expect.objectContaining({ id: 1803 })]) },
    })
    await db.update(characters).set({ sceneId: 2101 }).where(eq(characters.id, characterId))
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId: 'i260100', equippedSlot: 'Weapon' })
    vi.mocked(simulateFight).mockClear()
    expect((await client.post('/api/game/fight', { monsterId: 'n33017' })).statusCode).toBe(200)
    expect(simulateFight).toHaveBeenCalledWith(
      expect.objectContaining({
        attackers: [
          expect.objectContaining({
            skills: expect.arrayContaining([expect.objectContaining({ id: 1803 })]),
          }),
        ],
      }),
    )
  })
})

describe('skill resets', () => {
  it.each(['gold', 'giftCoupon'])(
    'charges 8 %s, rerolls learned skills and empties every tree',
    async (currency) => {
      await db
        .update(characters)
        .set({ level: 10, gold: 8, giftCoupon: 8 })
        .where(eq(characters.id, characterId))
      const before = await view()
      const first = before.learned.find(
        (skill: { skillId: number }) => skill.skillId < 2801 || skill.skillId > 2810,
      ).skillId
      await setSlot(0, first)
      await setSlot(1, first, 2)
      expect((await reset(currency)).statusCode).toBe(200)
      expect((await row())[currency as 'gold' | 'giftCoupon']).toBe(0)
      expect(await learned()).toHaveLength(10)
      expect(await slots()).toEqual([])
    },
  )
  it('refuses insufficient funds and an invalid currency without changing currency, skills or slots', async () => {
    await seedSkills()
    await db.update(characters).set({ gold: 7 }).where(eq(characters.id, characterId))
    await setSlot(0, 1803)
    const before = await learned()
    expect((await reset()).json().error.code).toBe('no_money')
    expect((await reset('stone')).statusCode).toBe(400)
    expect((await row()).gold).toBe(7)
    expect(await learned()).toEqual(before)
    expect(await slots()).toHaveLength(1)
  })
  it('consumes a free-reset item once and uses the free reset before charging', async () => {
    const token = await give('i161005', 2)
    expect((await client.post(`/api/game/items/${token.id}/use`)).statusCode).toBe(200)
    expect((await db.select().from(inventoryItems))[0]!.count).toBe(1)
    expect((await view()).freeResets).toBe(1)
    expect((await reset('giftCoupon')).statusCode).toBe(200)
    expect((await view()).freeResets).toBe(0)
    expect((await row()).giftCoupon).toBe(0)
    expect((await reset()).statusCode).toBe(400)
  })
  it('serializes simultaneous resets so one balance cannot pay twice', async () => {
    await seedSkills()
    await db.update(characters).set({ gold: 8 }).where(eq(characters.id, characterId))
    const results = await Promise.all([reset(), reset()])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect((await row()).gold).toBe(0)
  })
})
