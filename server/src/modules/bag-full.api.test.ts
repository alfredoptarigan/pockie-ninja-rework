// Full bag rules (docs/security-review-m3.md findings 6 and 8): fight loot that does not fit is
// lost, a box stays closed, and an exchange of bound crystals gives a bound result.
import { BAG_CELLS, itemCells } from '../game/bag.js'
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { inventoryItems } from '../db/schema.js'
import { grantDrops } from '../game/progress.js'
import { DEMON_CITY } from './gates/common.js'
import { errorCode, setUpNinja } from './gates/test-setup.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const bagRows = () =>
  db
    .select()
    .from(inventoryItems)
    .where(
      and(eq(inventoryItems.characterId, ninja.characterId), isNull(inventoryItems.equippedSlot)),
    )

/** Fills the bag up to BAG_CELLS rows with single, unstackable filler items. */
async function fillBag() {
  const free = BAG_CELLS - (await bagRows()).reduce((sum, row) => sum + itemCells(row.itemId), 0)
  await db.insert(inventoryItems).values(
    Array.from({ length: free }, () => ({
      characterId: ninja.characterId,
      itemId: 'i160001',
      count: 999,
    })),
  )
}

describe('fight loot in a full bag', () => {
  it('stacks what fits and loses what needs a new row', async () => {
    await ninja.give('i160006', { bound: true, count: 1 })
    await fillBag()

    const kept = await db.transaction((tx) =>
      grantDrops(tx, ninja.characterId, [
        { itemId: 'i160006', bound: true },
        { itemId: 'i152010', bound: false },
        { itemId: 'i250101', bound: false },
      ]),
    )

    expect(kept).toEqual([{ itemId: 'i160006', bound: true }])
    expect((await bagRows()).reduce((sum, row) => sum + itemCells(row.itemId), 0)).toBe(BAG_CELLS)
    expect((await ninja.bag('i160006'))[0]!.count).toBe(2)
    expect(await ninja.bag('i152010')).toHaveLength(0)
  })

  it('fills the last free rows, then loses the rest', async () => {
    await fillBag()
    await db.delete(inventoryItems).where(eq(inventoryItems.id, (await bagRows())[0]!.id))

    const kept = await db.transaction((tx) =>
      grantDrops(tx, ninja.characterId, [
        { itemId: 'i152010', bound: false },
        { itemId: 'i250101', bound: false },
      ]),
    )

    expect(kept).toEqual([{ itemId: 'i152010', bound: false }])
    expect((await bagRows()).reduce((sum, row) => sum + itemCells(row.itemId), 0)).toBe(BAG_CELLS)
  })
})

describe('opening a box in a full bag', () => {
  it('refuses and keeps the box', async () => {
    const box = await ninja.give('i150128', { count: 2 })
    await fillBag()

    const response = await ninja.client.post(`/api/game/items/${box.id}/use`)

    expect(errorCode(response)).toBe('bag_full')
    expect((await ninja.bag('i150128'))[0]!.count).toBe(2)
    expect((await bagRows()).reduce((sum, row) => sum + itemCells(row.itemId), 0)).toBe(BAG_CELLS)
  })
})

describe('toll gate exchange binding', () => {
  beforeEach(() => ninja.set({ sceneId: DEMON_CITY }))
  const crystals = (itemId: string, count: number, bound: boolean) =>
    Array.from({ length: count }, () => ({ characterId: ninja.characterId, itemId, bound }))

  it('gives a bound result when any crystal used was bound', async () => {
    await db
      .insert(inventoryItems)
      .values([...crystals('i152010', 45, false), ...crystals('i152015', 5, true)])

    const response = await ninja.client.post('/api/game/gates/exchange', { exchangeId: 1 })

    expect(response.statusCode).toBe(200)
    expect(response.json().items[0]).toMatchObject({ itemId: 'i491001', bound: true })
    expect((await ninja.bag('i491001'))[0]!.bound).toBe(true)
  })

  it('gives an unbound result from unbound crystals', async () => {
    await db.insert(inventoryItems).values(crystals('i152010', 50, false))

    const response = await ninja.client.post('/api/game/gates/exchange', { exchangeId: 1 })

    expect(response.statusCode).toBe(200)
    expect((await ninja.bag('i491001'))[0]!.bound).toBe(false)
  })
})
