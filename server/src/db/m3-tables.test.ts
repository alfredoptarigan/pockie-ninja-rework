import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import {
  characterDailyQuests,
  characterMysticPurchases,
  characterQuests,
  characters,
  characterShops,
  characterShopStock,
  mysticItemSales,
  mysticSpawns,
  users,
} from './schema.js'

const { db, close } = createTestDb()
afterAll(() => close())

let userCount = 0
async function character() {
  const username = `Ninja_${++userCount}`
  const [user] = await db
    .insert(users)
    .values({ username, email: `${username.toLowerCase()}@example.com`, passwordHash: 'x' })
    .returning()
  const [row] = await db
    .insert(characters)
    .values({
      userId: user!.id,
      name: username,
      gender: 0,
      nation: 0,
      clothing: 45,
      avatarId: 45,
      sceneId: 2601,
      hp: 1,
      mp: 1,
    })
    .returning()
  return row!.id
}

beforeEach(async () => {
  await truncateAll(db)
  await db.execute(sql`truncate table mystic_spawns, mystic_item_sales cascade`)
})

describe('world and daily quests', () => {
  it('starts a new ninja with no entered scenes and empty daily counters', async () => {
    const [row] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, await character()))
    expect(row).toMatchObject({
      scenesEntered: [],
      dailyQuestDay: null,
      dailyQuestsAccepted: 0,
      dailyQuestsCompleted: 0,
      dailyScore: 0,
    })
  })

  it('keeps each daily quest once on the board, in states 0-3', async () => {
    const characterId = await character()
    await db.insert(characterDailyQuests).values({ characterId, taskId: 26001 })
    await expect(
      db.insert(characterDailyQuests).values({ characterId, taskId: 26001, state: 3 }),
    ).rejects.toThrow()
    await expect(
      db.insert(characterDailyQuests).values({ characterId, taskId: 26002, state: 4 }),
    ).rejects.toThrow()
  })

  it('rejects negative daily counters and unknown complete types', async () => {
    const characterId = await character()
    await expect(
      db.update(characters).set({ dailyQuestsCompleted: -1 }).where(eq(characters.id, characterId)),
    ).rejects.toThrow()
    await expect(
      db
        .insert(characterQuests)
        .values({ characterId, taskId: 26001, progress: [], completeType: 3 }),
    ).rejects.toThrow()
  })
})

describe('refresh shops', () => {
  const stock = { shopType: 1, slot: 0, itemId: 'i250101', priceStone: 111, bound: true }

  it('keeps one shop row per character and shop type, with a daily free restock day', async () => {
    const characterId = await character()
    const [row] = await db
      .insert(characterShops)
      .values({ characterId, shopType: 1, freeRestockDay: '2026-10-12' })
      .returning()
    expect(row).toMatchObject({ lastRefreshAt: null, freeRestockDay: '2026-10-12' })
    await expect(db.insert(characterShops).values({ characterId, shopType: 1 })).rejects.toThrow()
    await expect(db.insert(characterShops).values({ characterId, shopType: 4 })).rejects.toThrow()
  })

  it('allows one stock item per slot of a character shop', async () => {
    const characterId = await character()
    const [row] = await db
      .insert(characterShopStock)
      .values({ characterId, ...stock })
      .returning()
    expect(row).toMatchObject({
      priceGold: null,
      priceGiftCoupon: null,
      identifyCount: 0,
      appraised: false,
      props: [],
    })
    await expect(db.insert(characterShopStock).values({ characterId, ...stock })).rejects.toThrow()
    // Same slot in another shop or for another character is fine.
    await db.insert(characterShopStock).values({ characterId, ...stock, shopType: 3 })
    await db.insert(characterShopStock).values({ characterId: await character(), ...stock })
  })

  it.each([
    ['shop type 0', { shopType: 0 }],
    ['slot 100', { slot: 100 }],
    ['a negative price', { priceGold: -1 }],
    ['identify count 5', { identifyCount: 5 }],
  ])('rejects stock with %s', async (_label, override) => {
    const characterId = await character()
    await expect(
      db.insert(characterShopStock).values({ characterId, ...stock, ...override }),
    ).rejects.toThrow()
  })
})

describe('Mysterious Merchant', () => {
  const spawn = {
    sceneId: 2601,
    startsAt: new Date('2026-10-12T09:00:00Z'),
    endsAt: new Date('2026-10-12T09:10:00Z'),
    stock: [{ itemId: 'i150078', price: 40, maxCount: 10, left: 10 }],
  }

  it('creates each hourly spawn once', async () => {
    await db.insert(mysticSpawns).values(spawn)
    await expect(db.insert(mysticSpawns).values({ ...spawn, sceneId: 2602 })).rejects.toThrow()
    await expect(
      db.insert(mysticSpawns).values({ ...spawn, startsAt: spawn.endsAt, endsAt: spawn.startsAt }),
    ).rejects.toThrow()
  })

  it('counts purchases per spawn, character and item', async () => {
    const characterId = await character()
    const [row] = await db.insert(mysticSpawns).values(spawn).returning()
    const purchase = { spawnId: row!.id, characterId, itemId: 'i150078', count: 1 }
    await db.insert(characterMysticPurchases).values(purchase)
    await expect(db.insert(characterMysticPurchases).values(purchase)).rejects.toThrow()
    await expect(
      db.insert(characterMysticPurchases).values({ ...purchase, itemId: 'i160004', count: 0 }),
    ).rejects.toThrow()
    // Purchases go with their spawn or their character.
    await db.execute(sql`delete from mystic_spawns`)
    expect(await db.select().from(characterMysticPurchases)).toHaveLength(0)
  })

  it('keeps the server-wide sales per item', async () => {
    await db.insert(mysticItemSales).values({ itemId: 'i150078', sold: 3 })
    await expect(db.insert(mysticItemSales).values({ itemId: 'i150078' })).rejects.toThrow()
    await expect(
      db.insert(mysticItemSales).values({ itemId: 'i160004', sold: -1 }),
    ).rejects.toThrow()
  })
})

describe('deleting an account', () => {
  it('removes the character shop, merchant and daily quest rows', async () => {
    const characterId = await character()
    const [spawn] = await db
      .insert(mysticSpawns)
      .values({
        sceneId: 2601,
        startsAt: new Date('2026-10-12T10:00:00Z'),
        endsAt: new Date('2026-10-12T10:10:00Z'),
        stock: [],
      })
      .returning()
    await db.insert(characterShops).values({ characterId, shopType: 2 })
    await db.insert(characterDailyQuests).values({ characterId, taskId: 26001 })
    await db
      .insert(characterShopStock)
      .values({ characterId, shopType: 2, slot: 0, itemId: 'i250101', priceGold: 8, bound: false })
    await db
      .insert(characterMysticPurchases)
      .values({ spawnId: spawn!.id, characterId, itemId: 'i150078', count: 2 })
    await db.delete(users)
    for (const table of [
      characterShops,
      characterShopStock,
      characterMysticPurchases,
      characterDailyQuests,
    ]) {
      expect(await db.select().from(table)).toHaveLength(0)
    }
    expect(await db.select().from(mysticSpawns)).toHaveLength(1)
  })
})
