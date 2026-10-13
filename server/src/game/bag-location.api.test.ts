import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { inventoryItems } from '../db/schema.js'
import { countItem } from '../modules/gates/common.js'
import { setUpNinja } from '../modules/gates/test-setup.js'
import { bagFits, requireBagRoom } from './bag.js'
import { grantItems, removeItems } from './progress.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>
beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.set({ level: 30, stone: 100000, gold: 1000, hp: 10 })
})
afterEach(() => ninja.app.close())
afterAll(() => close())

for (const location of ['market', 'warehouse'] as const) {
  describe(`${location} items are outside the bag`, () => {
    it('does not count them for capacity or stack new grants onto them', async () => {
      await db.insert(inventoryItems).values(
        Array.from({ length: 120 }, () => ({
          characterId: ninja.characterId,
          itemId: 'i250101',
          location,
        })),
      )
      const potion = await ninja.give('i160006', { location, bound: true, count: 1 })
      await db.transaction(async (tx) => {
        expect(await bagFits(tx, ninja.characterId, [{ itemId: 'i250101', bound: true }])).toBe(
          true,
        )
        await expect(
          requireBagRoom(tx, ninja.characterId, [{ itemId: 'i250101', bound: true }]),
        ).resolves.toBeUndefined()
        expect(
          await grantItems(tx, ninja.characterId, [{ itemId: 'i160006', bound: true }], {
            dropOverflow: true,
          }),
        ).toHaveLength(1)
      })
      const rows = await ninja.bag('i160006')
      expect(rows.find((row) => row.id === potion.id)?.count).toBe(1)
      expect(rows.filter((row) => row.location === 'bag')).toHaveLength(1)
    })
    it('cannot be sold, used, equipped or enhanced and is hidden from inventory and forge', async () => {
      const gear = await ninja.give('i250104', { location })
      const potion = await ninja.give('i160006', { location, count: 2 })
      const talisman = await ninja.give('i161003', { location, count: 2 })
      const kept = await ninja.give('i270100')
      expect(
        (await ninja.client.get('/api/game/inventory'))
          .json()
          .items.map((row: { id: string }) => row.id),
      ).toEqual([kept.id])
      expect((await ninja.client.get('/api/game/forge/gear')).json().gear).not.toHaveProperty(
        gear.id,
      )
      expect((await ninja.client.get('/api/game/forge')).json().talismans.enhance).toBe(0)
      const shop = (await ninja.client.get('/api/game/shop/open')).json()
      expect(shop.sellable.map((row: { inventoryId: string }) => row.inventoryId)).not.toContain(
        gear.id,
      )
      expect(
        (await ninja.client.post('/api/game/shop/sell', { inventoryId: gear.id, count: 1 })).json()
          .error.code,
      ).toBe('cannot_sell')
      expect((await ninja.client.post(`/api/game/items/${potion.id}/use`)).json().error.code).toBe(
        'no_item',
      )
      expect((await ninja.client.post(`/api/game/items/${gear.id}/equip`)).json().error.code).toBe(
        'no_item',
      )
      expect(
        (
          await ninja.client.post('/api/game/forge/enhance', { itemId: gear.id, payment: 'gold' })
        ).json().error.code,
      ).toBe('no_item')
      await ninja.client.post('/api/game/shop/sell-all', { inventoryIds: [gear.id, potion.id] })
      const rows = await db
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.characterId, ninja.characterId),
            eq(inventoryItems.location, location),
          ),
        )
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: gear.id, enhanceLevel: 0, equippedSlot: null }),
          expect.objectContaining({ id: potion.id, count: 2 }),
          expect.objectContaining({ id: talisman.id, count: 2 }),
        ]),
      )
    })
    it('excludes them from bulk appraisal by id', async () => {
      const hidden = { canIdentify: true, identifyCount: 1, identifyTimes: 0 }
      const outside = await ninja.give('i250101', { location, ...hidden })
      const inside = await ninja.give('i250101', hidden)
      const response = await ninja.client.post('/api/game/forge/appraise-all', {
        itemIds: [outside.id, inside.id],
      })
      expect(response.statusCode).toBe(200)
      const rows = await ninja.bag('i250101')
      expect(rows.find((row) => row.id === outside.id)).toMatchObject({
        identifyTimes: 0,
        props: [],
      })
      expect(rows.find((row) => row.id === inside.id)).toMatchObject({ identifyTimes: 1 })
    })
    it('does not count or consume them for quest hand-ins', async () => {
      const outside = await ninja.give('i152010', { location, bound: true, count: 10 })
      const inside = await ninja.give('i152010', { count: 1 })
      await db.transaction(async (tx) => {
        expect(await countItem(tx, ninja.characterId, 'i152010')).toBe(1)
        expect(await removeItems(tx, ninja.characterId, 'i152010', 10)).toBe(false)
      })
      const rows = await ninja.bag('i152010')
      expect(rows).toEqual([expect.objectContaining({ id: outside.id, count: 10, location })])
      expect(rows.some((row) => row.id === inside.id)).toBe(false)
      await db.transaction(async (tx) => {
        expect(await countItem(tx, ninja.characterId, 'i152010')).toBe(0)
      })
    })
  })
}
