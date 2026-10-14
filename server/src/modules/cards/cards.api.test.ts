// Cards (M6 task 8): box opening, stacking, collection view and the once-only completion prize.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CARD_COLLECTIONS, cardIdsOf } from '../../../../game-core/src/cards/constants.js'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterCardPrizes, characterCards, characters, inventoryItems } from '../../db/schema.js'
import { BAG_CELLS } from '../../game/bag.js'
import { item, rebornCards } from '../../game/data.js'
import cardRoutes, { openCardBox } from './routes.js'

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let client: Client
let characterId: string

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  app.register(cardRoutes, { db, prefix: '/api/game/cards' })
  client = new Client(app)
  await client.post('/api/auth/register', {
    username: 'Card_player',
    email: 'cards@example.com',
    password: 'believe-it',
  })
  const created = await client.post('/api/game/characters', {
    name: 'Collector_1',
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
const bagCount = async (itemId: string) =>
  (
    await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.characterId, characterId), eq(inventoryItems.itemId, itemId)))
  ).reduce((sum, row) => sum + row.count, 0)
const cards = () =>
  db.select().from(characterCards).where(eq(characterCards.characterId, characterId))
const ownAll = (collectionId: number) =>
  db.insert(characterCards).values(
    cardIdsOf(CARD_COLLECTIONS[collectionId - 1]!).map((cardId) => ({
      characterId,
      cardId,
      count: 1,
    })),
  )
const claim = (id: number) => client.post(`/api/game/cards/collections/${id}/claim`)
const open = (row: typeof inventoryItems.$inferSelect) =>
  db.transaction(async (tx) => {
    await tx.select().from(characters).where(eq(characters.id, characterId)).for('update')
    return openCardBox(tx, characterId, row)
  })

describe('card data', () => {
  it('matches cards.json collections, rarities and boxes', () => {
    const data = rebornCards()
    expect(data.collections.map((c) => [c.id, c.rarity, c.cards.map((card) => card.id)])).toEqual(
      CARD_COLLECTIONS.map((c) => [c.id, c.rarity, cardIdsOf(c)]),
    )
    for (const box of data.boxes) expect(item(box.item)).toMatchObject({ CardRarity: box.rarity })
  })
})

describe('openCardBox', () => {
  it('adds a card of the box rarity and uses up the box', async () => {
    const box = await give('i171005', 2)
    const opened = await open(box)
    expect(opened!.cardId).toBeGreaterThanOrEqual(64)
    expect(opened!.cardId).toBeLessThanOrEqual(74)
    expect(await cards()).toEqual([{ characterId, cardId: opened!.cardId, count: 1 }])
    expect(await bagCount('i171005')).toBe(1)
  })

  it('stacks duplicates', async () => {
    // The only PURPLE collection has 9 cards; 10 boxes must repeat one.
    let box = await give('i171003', 10)
    for (let i = 0; i < 10; i++) {
      await open(box)
      ;[box] = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, box.id))) as [
        typeof box,
      ]
    }
    const rows = await cards()
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(10)
    expect(rows.length).toBeLessThan(10)
    expect(await bagCount('i171003')).toBe(0)
  })

  it('ignores items that are not card boxes', async () => {
    const potion = await give('i160006')
    expect(await open(potion)).toBeNull()
    expect(await bagCount('i160006')).toBe(1)
  })
})

describe('GET /api/game/cards', () => {
  it('lists 10 collections with counts and prize state', async () => {
    await db.insert(characterCards).values({ characterId, cardId: 2, count: 3 })
    const response = await client.get('/api/game/cards')
    expect(response.statusCode).toBe(200)
    const { collections } = response.json()
    expect(collections).toHaveLength(10)
    expect(collections[0]).toMatchObject({
      id: 1,
      nameKey: 'reborn_card_collection_1',
      rarity: 'GREEN',
      owned: 1,
      total: 7,
      claimed: false,
      prize: [{ itemId: 'i218021', count: 3 }],
    })
    expect(collections[0].cards[1]).toEqual({ id: 2, nameKey: 'reborn_card_2', count: 3 })
  })
})

describe('POST /api/game/cards/collections/:id/claim', () => {
  it('refuses while the collection is incomplete', async () => {
    await db.insert(characterCards).values({ characterId, cardId: 1, count: 5 })
    const response = await claim(1)
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('collection_incomplete')
    expect(await bagCount('i218021')).toBe(0)
  })

  it('pays the prize once and keeps the cards', async () => {
    await ownAll(4)
    const response = await claim(4)
    expect(response.statusCode).toBe(200)
    expect(response.json().collections[3]).toMatchObject({ claimed: true, owned: 8 })
    expect(response.json().character.id).toBe(characterId)
    expect(await bagCount('i218022')).toBe(2)
    expect(await bagCount('i218050')).toBe(1)
    expect((await cards()).length).toBe(8)

    const again = await claim(4)
    expect(again.statusCode).toBe(400)
    expect(again.json().error.code).toBe('already_claimed')
    expect(await bagCount('i218022')).toBe(2)
  })

  it('refuses the prize on a full bag and keeps the claim', async () => {
    await ownAll(6)
    await db
      .insert(inventoryItems)
      .values(
        Array.from({ length: BAG_CELLS }, () => ({ characterId, itemId: 'i160006', count: 1 })),
      )
    const full = await claim(6)
    expect(full.statusCode).toBe(400)
    expect(full.json().error.code).toBe('bag_full')
    expect(await bagCount('i218009')).toBe(0)
    expect(await db.select().from(characterCardPrizes)).toHaveLength(0)

    await db.delete(inventoryItems).where(eq(inventoryItems.characterId, characterId))
    const later = await claim(6)
    expect(later.statusCode).toBe(200)
    expect(await bagCount('i218009')).toBe(1)
  })

  it('gives one prize to concurrent claims', async () => {
    await ownAll(10)
    const responses = await Promise.all([claim(10), claim(10), claim(10)])
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1)
    expect(await bagCount('i218207')).toBe(1)
    expect(await db.select().from(characterCardPrizes)).toHaveLength(1)
  })

  it('rejects unknown collections', async () => {
    expect((await claim(11)).statusCode).toBe(400)
  })
})
