import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import {
  characterCardPrizes,
  characterCards,
  characterKennelPurchases,
  characterPetSkills,
  characterPets,
  characterPetTracing,
  characters,
  characterWingCollection,
  inventoryItems,
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

const baseProps = {
  baseAttack: 10,
  baseDefence: 10,
  baseDisturb: 10,
  baseActive: 10,
  baseSavvy: 10,
}

const pet = (characterId: string, values: Partial<typeof characterPets.$inferInsert> = {}) =>
  db
    .insert(characterPets)
    .values({ characterId, species: 'i320002', kennelSlot: 0, growth: 100, ...baseProps, ...values })
    .returning()

let a = ''
let b = ''

beforeEach(async () => {
  await truncateAll(db)
  a = await character()
  b = await character()
})

describe('characters', () => {
  it('starts with 1 kennel slot and keeps pet_slots between 1 and 5', async () => {
    const [row] = await db.select().from(characters).where(eq(characters.id, a))
    expect(row!.petSlots).toBe(1)
    for (const petSlots of [0, 6]) {
      await expect(
        db.update(characters).set({ petSlots }).where(eq(characters.id, a)),
      ).rejects.toThrow()
    }
    await db.update(characters).set({ petSlots: 5 }).where(eq(characters.id, a))
  })
})

describe('pets', () => {
  it('adopts a level 1 pet with no appetite, empty food slots and no digestion', async () => {
    const [row] = await pet(a)
    expect(row).toMatchObject({
      level: 1,
      exp: 0,
      appetite: 0,
      active: false,
      digestEndsAt: null,
      foodSlots: [],
      name: null,
    })
    expect(row!.adoptedAt).toBeInstanceOf(Date)
  })

  it('keeps kennel slots 0-4, one pet per slot per ninja', async () => {
    await pet(a, { kennelSlot: 0 })
    await pet(a, { kennelSlot: 4 })
    await pet(b, { kennelSlot: 0 })
    await expect(pet(a, { kennelSlot: 0 })).rejects.toThrow()
    await expect(pet(a, { kennelSlot: 5 })).rejects.toThrow()
    await expect(pet(a, { kennelSlot: -1 })).rejects.toThrow()
  })

  it('allows one active pet per ninja', async () => {
    await pet(a, { kennelSlot: 0, active: true })
    await pet(a, { kennelSlot: 1 })
    await pet(b, { kennelSlot: 0, active: true })
    await expect(pet(a, { kennelSlot: 2, active: true })).rejects.toThrow()
    await expect(
      db
        .update(characterPets)
        .set({ active: true })
        .where(and(eq(characterPets.characterId, a), eq(characterPets.kennelSlot, 1))),
    ).rejects.toThrow()
  })

  it('keeps level 1-50, appetite 0-7200 and non-negative EXP, growth and props', async () => {
    await pet(a, { kennelSlot: 0, level: 50, appetite: 7200 })
    for (const values of [
      { level: 0 },
      { level: 51 },
      { appetite: -1 },
      { appetite: 7201 },
      { exp: -1 },
      { growth: -1 },
      { baseAttack: -1 },
      { baseDefence: -1 },
      { baseDisturb: -1 },
      { baseActive: -1 },
      { baseSavvy: -1 },
    ]) {
      await expect(pet(a, { kennelSlot: 1, ...values })).rejects.toThrow()
    }
  })

  it('keeps at most 6 food slots in an array', async () => {
    const slot = { type: 1, mul: 0 }
    await pet(a, { kennelSlot: 0, foodSlots: Array(6).fill(slot) })
    await expect(pet(a, { kennelSlot: 1, foodSlots: Array(7).fill(slot) })).rejects.toThrow()
  })

  it('goes away with its ninja', async () => {
    await pet(a)
    await db.delete(characters).where(eq(characters.id, a))
    expect(await db.select().from(characterPets)).toHaveLength(0)
  })
})

describe('pet skills', () => {
  let petId = ''
  beforeEach(async () => {
    const [row] = await pet(a)
    petId = row!.id
  })

  const skill = (values: Partial<typeof characterPetSkills.$inferInsert>) =>
    db
      .insert(characterPetSkills)
      .values({ petId, skillId: 40100, kind: 1, learnedOrder: 0, ...values })
      .returning()

  it('learns a skill once at level 1, unlocked and unslotted', async () => {
    const [row] = await skill({})
    expect(row).toMatchObject({ level: 1, locked: false, slot: null })
    await expect(skill({})).rejects.toThrow()
  })

  it('keeps kind 1-3, level 1 or more and a non-negative learned order', async () => {
    for (const values of [
      { kind: 0 },
      { kind: 4 },
      { level: 0 },
      { learnedOrder: -1 },
    ]) {
      await expect(skill({ skillId: 40200, ...values })).rejects.toThrow()
    }
  })

  it('slots at most 6 skills per kind, one per slot', async () => {
    for (let slot = 0; slot < 6; slot++) {
      await skill({ skillId: 40100 + slot, kind: 2, slot })
    }
    await skill({ skillId: 40110, kind: 3, slot: 0 })
    await expect(skill({ skillId: 40111, kind: 2, slot: 0 })).rejects.toThrow()
    await expect(skill({ skillId: 40112, kind: 2, slot: 6 })).rejects.toThrow()
    await expect(skill({ skillId: 40113, kind: 2, slot: -1 })).rejects.toThrow()
  })

  it('goes away with its pet', async () => {
    await skill({})
    await db.delete(characterPets).where(eq(characterPets.id, petId))
    expect(await db.select().from(characterPetSkills)).toHaveLength(0)
  })
})

describe('kennel', () => {
  it('starts Pet Tracing at zero with no board and refuses negative counts', async () => {
    const [row] = await db.insert(characterPetTracing).values({ characterId: a }).returning()
    expect(row).toMatchObject({ day: null, attemptsUsed: 0, boughtDay: null, board: null, finds: 0 })
    for (const values of [{ attemptsUsed: -1 }, { finds: -1 }]) {
      await expect(
        db.insert(characterPetTracing).values({ characterId: b, ...values }),
      ).rejects.toThrow()
    }
    await expect(
      db.insert(characterPetTracing).values({ characterId: b, board: [] as never }),
    ).rejects.toThrow()
  })

  it('counts Kennel shop purchases once per ninja, day and item, above zero', async () => {
    const purchase = { characterId: a, day: '2026-10-14', itemId: 'i170114', count: 1 }
    await db.insert(characterKennelPurchases).values(purchase)
    await db.insert(characterKennelPurchases).values({ ...purchase, day: '2026-10-15' })
    await expect(db.insert(characterKennelPurchases).values(purchase)).rejects.toThrow()
    await expect(
      db.insert(characterKennelPurchases).values({ ...purchase, itemId: 'i170120', count: 0 }),
    ).rejects.toThrow()
  })
})

describe('wings', () => {
  it('enhances an item up to level 30', async () => {
    const item = { characterId: a, itemId: 'i218000' }
    await db.insert(inventoryItems).values({ ...item, enhanceLevel: 30 })
    await expect(db.insert(inventoryItems).values({ ...item, enhanceLevel: 31 })).rejects.toThrow()
  })

  it('registers each wing once per ninja', async () => {
    const [row] = await db
      .insert(characterWingCollection)
      .values({ characterId: a, itemId: 'i218000' })
      .returning()
    expect(row!.registeredAt).toBeInstanceOf(Date)
    await db.insert(characterWingCollection).values({ characterId: b, itemId: 'i218000' })
    await expect(
      db.insert(characterWingCollection).values({ characterId: a, itemId: 'i218000' }),
    ).rejects.toThrow()
  })
})

describe('cards', () => {
  it('stacks cards 1-74 with a count above zero', async () => {
    await db.insert(characterCards).values([
      { characterId: a, cardId: 1, count: 1 },
      { characterId: a, cardId: 74, count: 3 },
    ])
    for (const values of [
      { cardId: 0, count: 1 },
      { cardId: 75, count: 1 },
      { cardId: 2, count: 0 },
      { cardId: 1, count: 1 },
    ]) {
      await expect(db.insert(characterCards).values({ characterId: a, ...values })).rejects.toThrow()
    }
  })

  it('claims each collection 1-10 prize once', async () => {
    const [row] = await db
      .insert(characterCardPrizes)
      .values({ characterId: a, collection: 10 })
      .returning()
    expect(row!.claimedAt).toBeInstanceOf(Date)
    await db.insert(characterCardPrizes).values({ characterId: b, collection: 10 })
    for (const collection of [10, 0, 11]) {
      await expect(
        db.insert(characterCardPrizes).values({ characterId: a, collection }),
      ).rejects.toThrow()
    }
  })
})
