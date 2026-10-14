// Reborn pet tutorial quests (M6 task 13): the Kennel routes complete the EQUIP_PET and FEED_PET
// command steps, and the Village Elder hands out the pet and its first food.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Random } from '@pockie/game-core'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../test/helpers.js'
import { characterPets, characterQuests, characters, inventoryItems } from '../db/schema.js'
import { adoptPetItem } from '../modules/pets/kennel.js'
import { petRoutes } from '../modules/pets/routes.js'

const CONTRACT = 820012
const EQUIP = 820014
const FEED = 820015

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

/** Food slots of type 1 (any), so any food fits. */
const fixed: () => Random = () => ({ next: () => 0, int: () => 0, between: (a) => a })

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  app.register(petRoutes, { db, prefix: '/api/test/pets', random: fixed })
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
  await db.update(characters).set({ level: 10 }).where(eq(characters.id, characterId))
})
afterEach(() => app.close())
afterAll(() => close())

const hold = (taskId: number) =>
  db.insert(characterQuests).values({ characterId, taskId, progress: [0], state: 0 })
const state = async (taskId: number) =>
  (
    await db
      .select()
      .from(characterQuests)
      .where(and(eq(characterQuests.characterId, characterId), eq(characterQuests.taskId, taskId)))
  )[0]?.state
const bag = async () =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.characterId, characterId)))
    .filter((row) => !row.equippedSlot)
    .map((row) => row.itemId)
    .sort()

/** Adopts the pet the Village Elder hands out, as using it from the bag does. */
async function adoptedPet() {
  const [row] = await db
    .insert(inventoryItems)
    .values({ characterId, itemId: 'i320002', bound: true })
    .returning()
  await db.transaction(async (tx) => {
    const [character] = await tx.select().from(characters).where(eq(characters.id, characterId))
    await adoptPetItem(tx, character!, row!, fixed())
  })
  return (
    await db.select().from(characterPets).where(eq(characterPets.characterId, characterId))
  )[0]!
}

describe('Reborn pet tutorial quests', () => {
  it('the Village Elder hands out a Baby Vulture for the contract', async () => {
    await db
      .insert(characterQuests)
      .values({ characterId, taskId: 820009, progress: [1], state: 2 })
    expect((await client.post(`/api/game/quests/${CONTRACT}/accept`)).statusCode).toBe(200)
    const talk = await client.post('/api/game/npcs/n11001/talk')
    expect(talk.json().completed).toContain(CONTRACT)
    expect(await bag()).toContain('i320002')
  })

  it('setting an active pet completes the equip step, feeding does not', async () => {
    await hold(EQUIP)
    const pet = await adoptedPet()
    await db.insert(inventoryItems).values({ characterId, itemId: 'i170113', bound: true })
    await client.post(`/api/test/pets/${pet.id}/feed`, { foods: ['i170113'] })
    expect(await state(EQUIP)).toBe(0)
    const response = await client.post(`/api/test/pets/${pet.id}/active`, { active: true })
    expect(response.statusCode).toBe(200)
    expect(await state(EQUIP)).toBe(1)
  })

  it('feeding completes the feed step, equipping does not; the equip quest pays the food', async () => {
    await db.insert(characterQuests).values({ characterId, taskId: EQUIP, progress: [1], state: 1 })
    const pet = await adoptedPet()
    expect((await client.post('/api/game/npcs/n11001/talk')).json().completed).toContain(EQUIP)
    expect(await bag()).toEqual(
      expect.arrayContaining(['i170113', 'i170114', 'i170115', 'i170116']),
    )
    expect((await client.post(`/api/game/quests/${FEED}/accept`)).statusCode).toBe(200)
    await client.post(`/api/test/pets/${pet.id}/active`, { active: true })
    expect(await state(FEED)).toBe(0)
    const fed = await client.post(`/api/test/pets/${pet.id}/feed`, {
      foods: ['i170113', 'i170114', null, null, null, null],
    })
    expect(fed.statusCode).toBe(200)
    expect(await state(FEED)).toBe(1)
  })
})
