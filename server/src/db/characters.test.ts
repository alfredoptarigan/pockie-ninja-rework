import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { characterQuests, characters, inventoryItems, users } from './schema.js'

const { db, close } = createTestDb()
afterAll(() => close())

async function user(username = 'Naruto') {
  const [row] = await db
    .insert(users)
    .values({ username, email: `${username.toLowerCase()}@example.com`, passwordHash: 'x' })
    .returning()
  return row!.id
}

const ninja = { name: 'Hokage_7', gender: 0, nation: 0, clothing: 45, avatarId: 45, sceneId: 111 }

describe('characters table', () => {
  beforeEach(() => truncateAll(db))

  it('creates a level 1 ninja with the original starting values', async () => {
    const [row] = await db
      .insert(characters)
      .values({ ...ninja, userId: await user(), hp: 224, mp: 224 })
      .returning()
    expect(row).toMatchObject({
      nameLower: 'hokage_7',
      level: 1,
      exp: 0,
      stone: 0,
      gold: 0,
      giftCoupon: 0,
      hpPouch: 0,
      mpPouch: 0,
    })
  })

  it('allows one character per account', async () => {
    const userId = await user()
    await db.insert(characters).values({ ...ninja, userId, hp: 1, mp: 1 })
    await expect(
      db.insert(characters).values({ ...ninja, name: 'Other', userId, hp: 1, mp: 1 }),
    ).rejects.toThrow()
  })

  it('keeps ninja names unique regardless of case', async () => {
    await db.insert(characters).values({ ...ninja, userId: await user('A_one'), hp: 1, mp: 1 })
    await expect(
      db
        .insert(characters)
        .values({ ...ninja, name: 'HOKAGE_7', userId: await user('B_two'), hp: 1, mp: 1 }),
    ).rejects.toThrow()
  })

  it.each([
    ['name too short', { name: 'ab' }],
    ['name too long', { name: 'a'.repeat(13) }],
    ['name with a space', { name: 'Hokage 7' }],
    ['unknown nation', { nation: 5 }],
    ['unknown gender', { gender: 2 }],
    ['level above the cap', { level: 91 }],
    ['negative currency', { stone: -1 }],
  ])('rejects %s', async (_label, override) => {
    await expect(
      db.insert(characters).values({ ...ninja, userId: await user(), hp: 1, mp: 1, ...override }),
    ).rejects.toThrow()
  })
})

describe('inventory and quests', () => {
  beforeEach(() => truncateAll(db))

  async function character() {
    const [row] = await db
      .insert(characters)
      .values({ ...ninja, userId: await user(), hp: 1, mp: 1 })
      .returning()
    return row!.id
  }

  it('stacks items with a positive count and allows one item per equipment slot', async () => {
    const characterId = await character()
    await db
      .insert(inventoryItems)
      .values({ characterId, itemId: 'i270100', equippedSlot: 'Weapon' })
    await expect(
      db.insert(inventoryItems).values({ characterId, itemId: 'i250100', equippedSlot: 'Weapon' }),
    ).rejects.toThrow()
    await expect(
      db.insert(inventoryItems).values({ characterId, itemId: 'i160006', count: 0 }),
    ).rejects.toThrow()
  })

  it('tracks each quest once per character with its progress', async () => {
    const characterId = await character()
    await db.insert(characterQuests).values({ characterId, taskId: 90000, progress: [0] })
    await expect(
      db.insert(characterQuests).values({ characterId, taskId: 90000, progress: [] }),
    ).rejects.toThrow()
  })

  it('deletes a character with its inventory and quests when the account is deleted', async () => {
    const characterId = await character()
    await db.insert(inventoryItems).values({ characterId, itemId: 'i160006', count: 3 })
    await db.insert(characterQuests).values({ characterId, taskId: 90000, progress: [0] })
    await db.delete(users)
    expect(await db.select().from(inventoryItems)).toHaveLength(0)
    expect(
      await db.select().from(characterQuests).where(eq(characterQuests.characterId, characterId)),
    ).toHaveLength(0)
  })
})
