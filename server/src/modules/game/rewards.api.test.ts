// Quest rewards (GET /quests, /quests/available), what a hand-in granted (POST /npcs/:id/talk)
// and what monsters can drop (GET /scene).
import {
  lootQuestCompletionSchema,
  monsterDropSchema,
  questCompletionSchema,
  questHandInSchema,
  questRewardsSchema,
  type QuestRewards,
} from '@pockie/shared'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterQuests, characters, inventoryItems } from '../../db/schema.js'

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
  // Fire Village (111); the tutorial starts with quest 90000.
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

const none: QuestRewards = { exp: 0, stone: 0, gold: 0, giftCoupon: 0, honor: 0, items: [] }
const newbiePack = { itemId: 'i159104', count: 1, nameKey: 'lg_Debris159104_itemname' }
// Quest 37102 (hand in to n11003 in 111): kill 4 n33006, pays 5 + 5 potions.
const potions = [
  { itemId: 'i160007', count: 5, nameKey: 'lg_HP2_itemname' },
  { itemId: 'i160017', count: 5, nameKey: 'lg_SP2_itemname' },
]
const quest37102 = { ...none, exp: 263, stone: 62, items: potions }

const quests = async () => (await client.get('/api/game/quests')).json().quests
const questOf = async (taskId: number) =>
  (await quests()).find((q: { taskId: number }) => q.taskId === taskId)

describe('GET /api/game/quests rewards', () => {
  it('lists the EXP, money and items a quest pays', async () => {
    const quest = await questOf(90000)
    expect(questRewardsSchema.parse(quest.rewards)).toEqual({
      ...none,
      exp: 5,
      stone: 100,
      giftCoupon: 10,
      items: [newbiePack],
    })
  })

  it('lists several reward items with their counts', async () => {
    await db.insert(characterQuests).values({ characterId, taskId: 37102, progress: [4], state: 1 })
    expect((await questOf(37102)).rewards).toEqual(quest37102)
  })
})

describe('GET /api/game/quests/available rewards', () => {
  it('lists the rewards of quests an NPC offers', async () => {
    await db.delete(characterQuests).where(eq(characterQuests.characterId, characterId))
    await db.insert(characterQuests).values([
      { characterId, taskId: 90000, progress: [1], state: 2 },
      { characterId, taskId: 90001, progress: [1], state: 2 },
    ])
    const { available } = (await client.get('/api/game/quests/available')).json()
    const offer = available.find((q: { taskId: number }) => q.taskId === 90002)
    expect(questRewardsSchema.parse(offer.rewards)).toEqual({ ...none, exp: 10, giftCoupon: 10 })
  })
})

describe('POST /api/game/npcs/:npcId/talk rewards', () => {
  it('returns what a completed tutorial quest granted, keeping `completed`', async () => {
    const body = (await client.post('/api/game/npcs/n11001/talk')).json()
    expect(body.completed).toEqual([90000])
    expect(body.rewards).toEqual([
      {
        taskId: 90000,
        ...none,
        exp: 5,
        stone: 100,
        giftCoupon: 10,
        items: [newbiePack],
        levelsGained: 0,
      },
    ])
    expect(questHandInSchema.array().parse(body.rewards)).toHaveLength(1)
  })

  it('returns the items a quest handed in at its NPC granted', async () => {
    await db.insert(characterQuests).values({ characterId, taskId: 37102, progress: [4], state: 1 })
    const body = (await client.post('/api/game/npcs/n11003/talk')).json()
    expect(body.completed).toEqual([37102])
    // 263 EXP at level 1: 15 + 48 + 99 to reach level 4.
    expect(body.rewards).toEqual([{ taskId: 37102, ...quest37102, levelsGained: 3 }])
    expect(body.character.level).toBe(4)
    const items = (await client.get('/api/game/inventory')).json().items
    expect(items).toEqual(
      expect.arrayContaining(
        potions.map(({ itemId, count }) => expect.objectContaining({ itemId, count })),
      ),
    )
  })

  it('returns no rewards when nothing was completed', async () => {
    const body = (await client.post('/api/game/npcs/n11002/talk')).json()
    expect(body).toMatchObject({ completed: [], rewards: [] })
  })
})

describe('rewards of quests completed by other actions', () => {
  const tutorialCoupons = (taskId: number, exp: number, levelsGained = 0) => ({
    taskId,
    ...none,
    exp,
    giftCoupon: 10,
    levelsGained,
  })
  const bagItem = async (itemId: string) =>
    (await client.get('/api/game/inventory'))
      .json()
      .items.find((i: { itemId: string }) => i.itemId === itemId)

  it('item use and equip return `rewards` next to `completed`', async () => {
    await client.post('/api/game/npcs/n11001/talk')
    const used = (await client.post(`/api/game/items/${(await bagItem('i159104')).id}/use`)).json()
    expect(used.completed).toEqual([90001])
    expect(questHandInSchema.array().parse(used.rewards)).toEqual([tutorialCoupons(90001, 5)])

    await client.post('/api/game/quests/90002/accept')
    const fists = await bagItem('i270100')
    const equipped = (await client.post(`/api/game/items/${fists.id}/equip`)).json()
    expect(questCompletionSchema.parse(equipped)).toEqual({
      completed: [90002],
      // 5 + 5 + 10 EXP: level 2.
      rewards: [tutorialCoupons(90002, 10, 1)],
      levelsGained: 1,
    })
  })

  it('a fight returns them as `questRewards`, with the quest level-up in its result', async () => {
    // 90007: kill one Sunflower (n33017) in 2101; pays 40 EXP, 10 coupons and an HP pouch.
    await db.delete(characterQuests).where(eq(characterQuests.characterId, characterId))
    await db.insert(characterQuests).values({ characterId, taskId: 90007, progress: [0] })
    await db.update(characters).set({ sceneId: 2101 }).where(eq(characters.id, characterId))
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId: 'i270100', equippedSlot: 'Weapon' })

    const body = (await client.post('/api/game/fight', { monsterId: 'n33017' })).json()
    expect(body.won).toBe(true)
    expect(body.rewards.exp).toBe(8)
    // 8 EXP from the Sunflower, then 40 from the quest: 48 reaches level 2 (15).
    expect(body.rewards.levelsGained).toBe(1)
    expect(body.character.level).toBe(2)
    expect(lootQuestCompletionSchema.parse(body).completed).toEqual([90007])
    expect(body.questRewards).toEqual([
      {
        ...tutorialCoupons(90007, 40, 1),
        items: [{ itemId: 'i160050', count: 1, nameKey: expect.any(String) }],
      },
    ])
  })
})

describe('GET /api/game/scene monster drops', () => {
  it('lists each item a monster can drop once, without drop chances', async () => {
    await db.update(characters).set({ sceneId: 2101 }).where(eq(characters.id, characterId))
    const { monsters } = (await client.get('/api/game/scene')).json()
    const sunflower = monsters.find((m: { id: string }) => m.id === 'n33017')

    // Drop list 3000001: 15 different items, several listed more than once.
    expect(sunflower.drops).toHaveLength(15)
    expect(sunflower.drops).toContainEqual({ itemId: 'i250101', nameKey: 'lg_Equip_Blunt1' })
    for (const drop of sunflower.drops) {
      expect(monsterDropSchema.strict().parse(drop)).toEqual(drop)
    }
    // The boss has no drop list.
    expect(monsters.find((m: { id: string }) => m.id === 'n32002').drops).toEqual([])
  })
})
