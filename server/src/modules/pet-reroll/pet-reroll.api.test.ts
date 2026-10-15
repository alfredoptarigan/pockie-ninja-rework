import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REROLL_CONFIG } from '../../../../game-core/src/pets/reroll.js'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters, inventoryItems, users } from '../../db/schema.js'
import { createSession } from '../auth/sessions.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const PET = 'i320002'
const TARGET = 'i320033'
const COST = REROLL_CONFIG.stonesPerRoll

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
})
afterEach(() => app.close())
afterAll(() => close())

async function ninja(stone: number, name = 'Reroller') {
  const client = new Client(app)
  const [user] = await db
    .insert(users)
    .values({ username: name, email: `${name.toLowerCase()}@example.com`, passwordHash: 'x' })
    .returning()
  client.setCookie('pn_session', await createSession(db, user!.id, false))
  const created = await client.post('/api/game/characters', {
    name,
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const id: string = created.json().character.id
  await db.update(characters).set({ stone }).where(eq(characters.id, id))
  const give = async (itemId: string) =>
    (await db.insert(inventoryItems).values({ characterId: id, itemId }).returning())[0]!.id
  const stoneLeft = async () =>
    (await db.select().from(characters).where(eq(characters.id, id)))[0]!.stone
  const itemOf = async (rowId: string) =>
    (await db.select().from(inventoryItems).where(eq(inventoryItems.id, rowId)))[0]?.itemId
  const reroll = (body: object) => client.post('/api/game/pet-reroll', body)
  return { give, stoneLeft, itemOf, reroll }
}

describe('POST /api/game/pet-reroll', () => {
  it('rolls once on the minimum budget and charges one roll', async () => {
    const me = await ninja(10_000)
    const pet = await me.give(PET)
    const response = await me.reroll({ inventoryId: pet, target: TARGET, maxStones: COST })
    expect(response.statusCode).toBe(200)
    const { reroll, character, items } = response.json()
    expect(reroll.rolls).toBe(1)
    expect(reroll.spent).toBe(COST)
    expect(reroll.itemId).not.toBe(PET)
    expect(REROLL_CONFIG.pets).toContain(reroll.itemId)
    expect(reroll.hit).toBe(reroll.itemId === TARGET)
    expect(character.stone).toBe(10_000 - COST)
    expect(await me.stoneLeft()).toBe(10_000 - COST)
    expect(await me.itemOf(pet)).toBe(reroll.itemId)
    expect(items.some((item: { id: string }) => item.id === pet)).toBe(true)
  })

  it('stops on the target and never spends past the Stones held', async () => {
    const me = await ninja(REROLL_CONFIG.maxStones)
    const pet = await me.give(PET)
    const response = await me.reroll({
      inventoryId: pet,
      target: TARGET,
      maxStones: REROLL_CONFIG.maxStones,
    })
    const { reroll } = response.json()
    expect(reroll.spent).toBe(reroll.rolls * COST)
    expect(reroll.spent).toBeLessThanOrEqual(REROLL_CONFIG.maxStones)
    if (reroll.hit) expect(reroll.itemId).toBe(TARGET)
    else expect(reroll.rolls).toBe(Math.floor(REROLL_CONFIG.maxStones / COST))
    expect(await me.stoneLeft()).toBe(REROLL_CONFIG.maxStones - reroll.spent)
  })

  it('refuses short Stones, low budgets, unlisted targets, non-pets and the same pet', async () => {
    const me = await ninja(COST - 1)
    const pet = await me.give(PET)
    const food = await me.give('i120001')
    const code = async (body: object) => (await me.reroll(body)).json().error.code
    const ok = { inventoryId: pet, target: TARGET, maxStones: COST }
    expect(await code(ok)).toBe('not_enough_currency')
    expect(await code({ ...ok, maxStones: COST - 1 })).toBe('low_budget')
    expect(await code({ ...ok, target: 'i320071' })).toBe('bad_target')
    expect(await code({ ...ok, inventoryId: food })).toBe('not_pet')
    expect(await code({ ...ok, target: PET })).toBe('already_target')
    expect(await me.stoneLeft()).toBe(COST - 1)
    expect(await me.itemOf(pet)).toBe(PET)
  })

  it("refuses another ninja's pet", async () => {
    const me = await ninja(10_000)
    const stranger = await ninja(10_000, 'Stranger')
    const pet = await stranger.give(PET)
    const response = await me.reroll({ inventoryId: pet, target: TARGET, maxStones: COST })
    expect(response.statusCode).toBe(404)
  })
})
