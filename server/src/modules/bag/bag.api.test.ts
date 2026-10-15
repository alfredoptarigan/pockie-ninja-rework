// Reborn bag: stored positions on 10x6 pages, move/swap/lock/split/sell/sort and multi-use.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { inventoryItems } from '../../db/schema.js'
import { errorCode, setUpNinja } from '../gates/test-setup.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const POTION = 'i160006' // PharmacyItem hp.js, 1x1, stacks to 100, Price 16, CanTrade 1
const FISTS = 'i270100' // fists weapon, 2x3, level 1, Price 1
const FISTS_2 = 'i270101' // fists weapon, 2x3, level 1, Price 44
const DEBRIS = 'i150102' // DebrisItem 2x2, not usable
const UNTRADABLE = 'i159104' // CanTrade 0

interface Row {
  id: string
  itemId: string
  count: number
  page: number | null
  slot: number | null
  locked: boolean
  equippedSlot: string | null
  info: Record<string, unknown>
}
const inventory = async (): Promise<Row[]> =>
  (await ninja.client.get('/api/game/inventory')).json().items
const find = (items: Row[], id: string) => items.find((row) => row.id === id)!
const post = (path: string, body?: object) => ninja.client.post(`/api/game/items/${path}`, body)
const dbRow = async (id: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]
/** Fills pages 0..pages-1 with placed 1x1 potions. */
const fillPages = (pages: number) =>
  db.insert(inventoryItems).values(
    Array.from({ length: pages * 60 }, (_, cell) => ({
      characterId: ninja.characterId,
      itemId: 'i160001',
      count: 1,
      bagPage: Math.floor(cell / 60),
      bagSlot: cell % 60,
    })),
  )

describe('GET /inventory placement', () => {
  it('places granted items first-fit, persists the positions and describes each item', async () => {
    const potion = await ninja.give(POTION, { count: 3 })
    const fists = await ninja.give(FISTS_2)
    const debris = await ninja.give(DEBRIS)
    const equipped = await ninja.give(FISTS, { equippedSlot: 'Weapon' })

    const items = await inventory()
    expect(find(items, potion.id)).toMatchObject({ page: 0, slot: 0, locked: false })
    expect(find(items, fists.id)).toMatchObject({ page: 0, slot: 1 })
    expect(find(items, debris.id)).toMatchObject({ page: 0, slot: 3 })
    expect(find(items, equipped.id)).toMatchObject({ page: null, slot: null })
    expect(await dbRow(fists.id)).toMatchObject({ bagPage: 0, bagSlot: 1 })

    expect(find(items, potion.id).info).toEqual({
      kind: 'use',
      equipSlot: null,
      level: 0,
      sellPrice: 16,
      stack: 100,
      w: 1,
      h: 1,
      class: 'PharmacyItem',
      value: 1,
    })
    expect(find(items, fists.id)).toMatchObject({ fitsOutfit: true })
    expect(find(items, fists.id).info).toEqual({
      kind: 'equip',
      equipSlot: 'Weapon',
      level: 1,
      sellPrice: 44,
      stack: 1,
      w: 2,
      h: 3,
      class: 'EquipItem',
      value: 1,
    })
    expect(find(items, debris.id).info).toMatchObject({ kind: 'other', w: 2, h: 2 })
    expect((await inventory()).map((row) => row.slot)).toEqual(items.map((row) => row.slot))
  })

  it('overflows onto a later page instead of dropping an item', async () => {
    await fillPages(2)
    const extra = await ninja.give(DEBRIS)
    expect(find(await inventory(), extra.id)).toMatchObject({ page: 2, slot: 0 })
  })
})

describe('move and swap', () => {
  it('moves an item to a free spot and refuses bad targets', async () => {
    const potion = await ninja.give(POTION)
    const fists = await ninja.give(FISTS_2)
    await inventory()

    const moved = await post(`${fists.id}/move`, { page: 1, slot: 4 })
    expect(moved.statusCode).toBe(200)
    expect(find(moved.json().items, fists.id)).toMatchObject({ page: 1, slot: 4 })
    expect(moved.json().character.id).toBe(ninja.characterId)

    for (const target of [
      { page: 0, slot: 0 }, // overlaps the potion
      { page: 0, slot: 9 }, // leaves the page on the right
      { page: 0, slot: 40 }, // leaves the page at the bottom
      { page: 2, slot: 0 }, // not a usable page
    ]) {
      const refused = await post(`${fists.id}/move`, target)
      expect(refused.statusCode).toBe(400)
      expect(refused.json().error).toMatchObject({
        code: 'no_room',
        message: 'There is no room there.',
      })
    }
    expect((await post(`${potion.id}/move`, { page: 0, slot: 59 })).statusCode).toBe(200)
    expect(errorCode(await post(`${potion.id}/move`, { page: 0, slot: 60 }))).toBe('validation')
  })

  it('swaps positions when both still fit and refuses otherwise', async () => {
    const fists = await ninja.give(FISTS_2, { bagPage: 0, bagSlot: 0 })
    const potion = await ninja.give(POTION, { bagPage: 1, bagSlot: 0 })
    const low = await ninja.give(POTION, { bagPage: 0, bagSlot: 50 })

    const swapped = await post(`${fists.id}/swap`, { targetId: potion.id })
    expect(swapped.statusCode).toBe(200)
    expect(find(swapped.json().items, fists.id)).toMatchObject({ page: 1, slot: 0 })
    expect(find(swapped.json().items, potion.id)).toMatchObject({ page: 0, slot: 0 })

    const same = await post(`${potion.id}/swap`, { targetId: low.id })
    expect(find(same.json().items, potion.id)).toMatchObject({ page: 0, slot: 50 })
    expect(find(same.json().items, low.id)).toMatchObject({ page: 0, slot: 0 })

    // The fists would hang off the bottom of page 0 at slot 50.
    const refused = await post(`${fists.id}/swap`, { targetId: potion.id })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error).toMatchObject({ code: 'invalid_swap', message: 'Invalid Swap' })
  })
})

describe('lock, split and sell', () => {
  it('toggles the lock', async () => {
    const potion = await ninja.give(POTION)
    const locked = await post(`${potion.id}/lock`)
    expect(locked.json()).toMatchObject({ locked: true })
    expect(find(locked.json().items, potion.id).locked).toBe(true)
    expect((await post(`${potion.id}/lock`)).json()).toMatchObject({ locked: false })
  })

  it('splits a stack into a new first-fit row', async () => {
    const potion = await ninja.give(POTION, { count: 5, bound: true })
    const split = await post(`${potion.id}/split`, { count: 2 })
    expect(split.statusCode).toBe(200)
    const potions = split.json().items.filter((row: Row) => row.itemId === POTION)
    expect(potions).toEqual([
      expect.objectContaining({ id: potion.id, count: 3, page: 0, slot: 0 }),
      expect.objectContaining({ count: 2, page: 0, slot: 1, bound: true }),
    ])
    expect(errorCode(await post(`${potion.id}/split`, { count: 3 }))).toBe('invalid_count')
  })

  it('refuses to split into a full bag', async () => {
    await fillPages(2)
    const potion = await ninja.give(POTION, { count: 5, bagPage: 2, bagSlot: 0 })
    const refused = await post(`${potion.id}/split`, { count: 1 })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error).toMatchObject({
      code: 'bag_full',
      message: 'Inventory is full! Please make some space first.',
    })
  })

  it('sells whole stacks from anywhere for Price x count', async () => {
    await ninja.set({ sceneId: 2101, stone: 0 })
    const potion = await ninja.give(POTION, { count: 3 })
    const fists = await ninja.give(FISTS_2)
    const sold = await post('sell', { inventoryIds: [potion.id, fists.id] })
    expect(sold.statusCode).toBe(200)
    expect(sold.json()).toMatchObject({ earned: 3 * 16 + 44, character: { stone: 92 } })
    // Only the worn creation outfit is left.
    expect(sold.json().items).toEqual([expect.objectContaining({ equippedSlot: 'Outfit' })])
  })

  it('refuses the whole sale for locked, equipped or untradable items', async () => {
    const potion = await ninja.give(POTION, { count: 3 })
    const locked = await ninja.give(POTION, { locked: true })
    const equipped = await ninja.give(FISTS, { equippedSlot: 'Weapon' })
    const untradable = await ninja.give(UNTRADABLE)
    for (const bad of [locked, equipped, untradable])
      expect(errorCode(await post('sell', { inventoryIds: [potion.id, bad.id] }))).toBe(
        'cannot_sell',
      )
    expect((await ninja.row()).stone).toBe(0)
    expect(await dbRow(potion.id)).toMatchObject({ count: 3 })
    expect(errorCode(await post('sell', { inventoryIds: [potion.id, potion.id] }))).toBe(
      'validation',
    )
  })
})

describe('use multiple', () => {
  it('uses the item several times and stops when the stack runs out', async () => {
    await ninja.set({ hp: 10 })
    const potion = await ninja.give(POTION, { count: 4 })
    const used = await post(`${potion.id}/use-multiple`, { amount: 2 })
    expect(used.statusCode).toBe(200)
    expect(used.json()).toMatchObject({ used: 2, character: { hp: 220 } })
    expect(find(used.json().items, potion.id).count).toBe(2)

    await ninja.set({ hp: 10 })
    const drained = await post(`${potion.id}/use-multiple`, { amount: 1000 })
    expect(drained.json()).toMatchObject({ used: 2 })
    expect(await dbRow(potion.id)).toBeUndefined()
  })

  it('stops quietly when a later use fails and refuses when the first one does', async () => {
    await ninja.set({ hp: 200 })
    const potion = await ninja.give(POTION, { count: 3 })
    const used = await post(`${potion.id}/use-multiple`, { amount: 3 })
    expect(used.json()).toMatchObject({ used: 1, character: { hp: 220 } })
    expect(await dbRow(potion.id)).toMatchObject({ count: 2 })

    const refused = await post(`${potion.id}/use-multiple`, { amount: 3 })
    expect(errorCode(refused)).toBe('full')
    expect(await dbRow(potion.id)).toMatchObject({ count: 2 })
  })
})

describe('sort', () => {
  it('merges stacks and re-places everything, equipment first', async () => {
    const a = await ninja.give(POTION, { count: 60, bagPage: 1, bagSlot: 9 })
    const b = await ninja.give(POTION, { count: 70, bagPage: 0, bagSlot: 0 })
    const fists = await ninja.give(FISTS_2, { bagPage: 1, bagSlot: 0 })
    const sorted = await post('sort', { scope: 'all', stack: true })
    expect(sorted.statusCode).toBe(200)
    const items: Row[] = sorted.json().items
    expect(find(items, fists.id)).toMatchObject({ page: 0, slot: 0 })
    const potions = items.filter((row) => row.itemId === POTION)
    expect(potions.map((row) => row.count).sort()).toEqual([100, 30])
    expect(potions.map((row) => row.slot).sort()).toEqual([2, 3])
    expect(potions.every((row) => row.page === 0)).toBe(true)
    expect([a.id, b.id]).toEqual(expect.arrayContaining(potions.map((row) => row.id)))
  })

  it('sorts one tab without stacking and leaves the others alone', async () => {
    const other = await ninja.give(POTION, { count: 1, bagPage: 0, bagSlot: 7 })
    const a = await ninja.give(POTION, { count: 1, bagPage: 1, bagSlot: 30 })
    const b = await ninja.give(DEBRIS, { bagPage: 1, bagSlot: 12 })
    const sorted = await post('sort', { scope: 'tab', page: 1, stack: false })
    const items: Row[] = sorted.json().items
    expect(find(items, other.id)).toMatchObject({ page: 0, slot: 7, count: 1 })
    expect(find(items, b.id)).toMatchObject({ page: 1, slot: 0 })
    expect(find(items, a.id)).toMatchObject({ page: 1, slot: 2, count: 1 })
    expect(errorCode(await post('sort', { scope: 'tab', stack: true }))).toBe('validation')
  })
})

describe('equip and unequip positions', () => {
  it('puts the replaced item into the new item’s spot and unequips to a chosen spot', async () => {
    const worn = await ninja.give(FISTS, { equippedSlot: 'Weapon' })
    const fresh = await ninja.give(FISTS_2, { bagPage: 1, bagSlot: 4 })
    const equipped = await post(`${fresh.id}/equip`)
    expect(equipped.statusCode).toBe(200)
    expect(find(equipped.json().items, worn.id)).toMatchObject({
      equippedSlot: null,
      page: 1,
      slot: 4,
    })
    expect(find(equipped.json().items, fresh.id)).toMatchObject({
      equippedSlot: 'Weapon',
      page: null,
      slot: null,
    })

    const unequipped = await post(`${fresh.id}/unequip`, { page: 0, slot: 5 })
    expect(unequipped.statusCode).toBe(200)
    expect(find(unequipped.json().items, fresh.id)).toMatchObject({ page: 0, slot: 5 })
  })

  it('falls back to first-fit when the chosen spot is taken', async () => {
    await ninja.give(POTION, { bagPage: 0, bagSlot: 0 })
    const worn = await ninja.give(FISTS, { equippedSlot: 'Weapon' })
    const unequipped = await post(`${worn.id}/unequip`, { page: 0, slot: 0 })
    expect(find(unequipped.json().items, worn.id)).toMatchObject({ page: 0, slot: 1 })
  })
})
