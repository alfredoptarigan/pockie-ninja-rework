// Outfits as items (Reborn's Outfit slot, Manage Outfit and Wardrobe): the worn outfit is an
// AvatarItem in the Outfit slot of the active set and drives clothing / avatarId.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { inventoryItems } from '../../db/schema.js'
import { unequipMisfitWeaponsEverywhere } from '../../game/weapon-fit.js'
import { errorCode, setUpNinja } from '../gates/test-setup.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const CREATION = 'i290003' // clothing 3, AvatarLevel 1, the setUpNinja outfit (sharp)
const BLUNT = 'i290017' // clothing 17, AvatarLevel 1, value 27 (blunt in 2011, sharp in Reborn)
const BLUNT_2 = 'i290117' // clothing 17, AvatarLevel 2
const HIGH = 'i2931010' // clothing 1, AvatarLevel 32, value 42: required level 50
const FISTS = 'i260100' // not an outfit

interface Row {
  id: string
  itemId: string
  equippedSlot: string | null
  equippedSet: number | null
  page: number | null
  info: { kind: string; equipSlot: string | null; level: number; outfit?: object }
}
const inventory = async (): Promise<Row[]> =>
  (await ninja.client.get('/api/game/inventory')).json().items
const character = async () => (await ninja.client.get('/api/game/character')).json().character
const equip = (id: string) => ninja.client.post(`/api/game/items/${id}/equip`)
const switchTo = (set: number) => ninja.client.post('/api/game/sets/active', { set })
const wardrobe = async () => (await ninja.client.get('/api/game/wardrobe')).json().items
const store = (inventoryId: string, slot: number) =>
  ninja.client.post('/api/game/wardrobe/store', { inventoryId, slot })
const take = (slot: number) => ninja.client.post('/api/game/wardrobe/take', { slot })
const setVisual = (inventoryId: string) =>
  ninja.client.post('/api/game/outfit/visual', { inventoryId })

describe('the outfit item', () => {
  it('gives a new ninja its creation outfit, worn in set I as an equippable item', async () => {
    const [outfit] = await inventory()
    expect(outfit).toMatchObject({
      itemId: CREATION,
      equippedSlot: 'Outfit',
      equippedSet: 1,
      info: { kind: 'equip', equipSlot: 'Outfit', level: 1, outfit: { clothing: 3, plus: 0 } },
    })
  })

  it('equips a second outfit: clothing, avatar and weapon class follow it', async () => {
    const before = await character()
    // i290005: clothing 5, Blunt in Reborn.
    const second = await ninja.give('i290005')
    const equipped = await equip(second.id)
    expect(equipped.statusCode).toBe(200)
    expect(equipped.json().character).toMatchObject({ clothing: 5, avatarId: 5, weaponClass: 1 })
    expect(before).toMatchObject({ clothing: 3, avatarId: 3, weaponClass: 2 })
    // The replaced outfit goes back to the bag.
    const old = (await inventory()).find((row) => row.itemId === CREATION)!
    expect(old).toMatchObject({ equippedSlot: null, page: 0 })
  })

  it('switches sets: each set wears its own outfit, a set without one falls back to set I', async () => {
    const second = await ninja.give(BLUNT)
    expect((await switchTo(2)).json().character).toMatchObject({ clothing: 3, avatarId: 3 })
    await equip(second.id)
    expect((await character()).clothing).toBe(17)
    expect((await switchTo(1)).json().character).toMatchObject({ clothing: 3, avatarId: 3 })
    expect((await switchTo(2)).json().character).toMatchObject({ clothing: 17, avatarId: 17 })
  })

  it('refuses an outfit above the required level (ceil((plus - 1) * r / 31))', async () => {
    const high = await ninja.give(HIGH)
    const refused = await equip(high.id)
    expect(errorCode(refused)).toBe('too_low')
    // Our top outfit is Reborn's +31: ceil(30 * 50 / 31).
    expect((await inventory()).find((row) => row.id === high.id)!.info.level).toBe(49)
    await ninja.set({ level: 49 })
    expect((await equip(high.id)).statusCode).toBe(200)
  })

  it('keeps the outfit on: it can only be replaced, and not with one worn in another set', async () => {
    const [outfit] = await inventory()
    const off = await ninja.client.post(`/api/game/items/${outfit!.id}/unequip`)
    expect(errorCode(off)).toBe('cannot_unequip')
    await switchTo(2)
    expect(errorCode(await equip(outfit!.id))).toBe('worn_elsewhere')
  })

  it('shows Reborn\'s "+N": AvatarLevel - 1', async () => {
    const plus2 = await ninja.give(BLUNT_2)
    expect((await inventory()).find((row) => row.id === plus2.id)!.info.outfit).toMatchObject({
      clothing: 17,
      plus: 1,
    })
  })
})

describe('outfit stars', () => {
  const stats = async () => (await ninja.client.get('/api/game/character')).json().stats

  it("count in the worn outfit's stats like Reborn's tooltip: +5% ISV, then +1 to +N", async () => {
    const [outfit] = await inventory()
    // Clothing 3 at +0 (ISV 0.65 / 1.1 / 0.65), character level 1 (setUpNinja).
    const level = (await ninja.client.get('/api/game/character')).json().character.level
    const shown = (isv: number, tier: number) => Math.floor(20 * isv + 8 * isv * tier + isv * level)
    const plain = await stats()
    await db.update(inventoryItems).set({ stars: 1 }).where(eq(inventoryItems.id, outfit!.id))
    const one = await stats()
    await db.update(inventoryItems).set({ stars: 3 }).where(eq(inventoryItems.id, outfit!.id))
    const three = await stats()
    expect(Math.floor(plain.agility / 100)).toBe(shown(1.1, 0))
    expect(Math.floor(one.agility / 100)).toBe(shown(1.1 * 1.05, 0))
    expect(Math.floor(three.agility / 100)).toBe(shown(1.1 * 1.05, 1))
    expect(three.agility).toBeGreaterThan(one.agility)
  })
})

describe('the visual outfit', () => {
  it('costs 250 gold to set and is free to clear; stats stay with the worn outfit', async () => {
    const look = await ninja.give(BLUNT)
    expect(errorCode(await setVisual(look.id))).toBe('not_enough_currency')

    await ninja.set({ gold: 300 })
    const set = await setVisual(look.id)
    expect(set.statusCode).toBe(200)
    expect(set.json().character).toMatchObject({
      gold: 50,
      clothing: 3,
      avatarId: 3,
      visualClothing: 17,
    })

    const cleared = await ninja.client.post('/api/game/outfit/visual/clear')
    expect(cleared.json().character).toMatchObject({ gold: 50, visualClothing: null })
  })

  it('only takes an outfit of your own bag', async () => {
    await ninja.set({ gold: 1000 })
    const sword = await ninja.give(FISTS)
    expect(errorCode(await setVisual(sword.id))).toBe('not_outfit')
    const listed = await ninja.give(BLUNT, { location: 'warehouse' })
    expect((await setVisual(listed.id)).statusCode).toBe(404)
    expect((await ninja.row()).gold).toBe(1000)
  })
})

describe('the wardrobe', () => {
  it('stores a bag outfit in one of 20 slots and takes it back out', async () => {
    const spare = await ninja.give(BLUNT)
    const stored = await store(spare.id, 7)
    expect(stored.statusCode).toBe(200)
    expect(stored.json().items.some((row: Row) => row.id === spare.id)).toBe(false)
    expect(stored.json().wardrobe).toEqual([
      expect.objectContaining({ id: spare.id, wardrobeSlot: 7 }),
    ])
    expect(await wardrobe()).toEqual([expect.objectContaining({ id: spare.id, wardrobeSlot: 7 })])

    const taken = await take(7)
    expect(taken.statusCode).toBe(200)
    expect(taken.json().wardrobe).toEqual([])
    expect(taken.json().items.find((row: Row) => row.id === spare.id)).toMatchObject({ page: 0 })
  })

  it('refuses what is not a loose bag outfit, a taken slot and slots outside 0-19', async () => {
    const [worn] = await inventory()
    const sword = await ninja.give(FISTS)
    const spare = await ninja.give(BLUNT)
    const other = await ninja.give(BLUNT_2)
    expect(errorCode(await store(sword.id, 0))).toBe('not_outfit')
    expect(errorCode(await store(worn!.id, 0))).toBe('equipped')
    expect((await store(spare.id, 20)).statusCode).toBe(400)
    expect((await store(spare.id, 0)).statusCode).toBe(200)
    expect(errorCode(await store(other.id, 0))).toBe('slot_taken')
    expect(errorCode(await take(1))).toBe('empty_slot')
  })

  it('keeps stored outfits out of the bag until there is room for them', async () => {
    const spare = await ninja.give(BLUNT)
    await store(spare.id, 0)
    // 30 2x2 outfits fill the 120 cells of the bag.
    await db
      .insert(inventoryItems)
      .values(
        Array.from({ length: 30 }, () => ({ characterId: ninja.characterId, itemId: BLUNT_2 })),
      )
    await inventory()
    expect(errorCode(await take(0))).toBe('bag_full')
    const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, spare.id))
    expect(row).toMatchObject({ location: 'wardrobe', wardrobeSlot: 0 })
  })
})

describe('weapons that no longer fit the outfit (Reborn Weapon Type)', () => {
  const SHARP = 'i260100' // sharp newbie weapon: fits the creation outfit (clothing 3, Sharp)
  const FIST_OUTFIT = 'i290021' // clothing 21, Fists in Reborn
  const ANY_OUTFIT = 'i290065' // clothing 65, Any in Reborn
  const rowOf = async (id: string) =>
    (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]!

  it('takes a worn weapon off into the bag when the new outfit cannot use it', async () => {
    const sword = await ninja.give(SHARP, { equippedSlot: 'Weapon', equippedSet: 1 })
    // Set II wears no outfit, so it fights in set I's: its sword goes too.
    const spare = await ninja.give(SHARP, { equippedSlot: 'Weapon', equippedSet: 2 })
    const fists = await ninja.give(FIST_OUTFIT)
    expect((await equip(fists.id)).statusCode).toBe(200)
    for (const id of [sword.id, spare.id]) {
      expect(await rowOf(id)).toMatchObject({ equippedSlot: null, location: 'bag' })
      expect((await rowOf(id)).bagPage).not.toBeNull()
    }
  })

  it('keeps a weapon the outfit can use, and any weapon under an Any outfit', async () => {
    const sword = await ninja.give(SHARP, { equippedSlot: 'Weapon', equippedSet: 1 })
    const any = await ninja.give(ANY_OUTFIT)
    expect((await equip(any.id)).statusCode).toBe(200)
    expect(await rowOf(sword.id)).toMatchObject({ equippedSlot: 'Weapon' })
  })

  it('never loses the weapon: with the usable pages full it lands on an overflow page', async () => {
    const sword = await ninja.give(SHARP, { equippedSlot: 'Weapon', equippedSet: 1 })
    // 30 2x2 outfits fill the 120 cells of the bag; the new outfit frees its own 4.
    await db
      .insert(inventoryItems)
      .values(
        Array.from({ length: 30 }, () => ({ characterId: ninja.characterId, itemId: BLUNT_2 })),
      )
    const fists = await ninja.give(FIST_OUTFIT)
    await inventory()
    expect((await equip(fists.id)).statusCode).toBe(200)
    expect(await rowOf(sword.id)).toMatchObject({ equippedSlot: null, location: 'bag' })
    expect((await rowOf(sword.id)).bagPage).toBeGreaterThanOrEqual(2)
  })

  it('fixes ninjas saved before the change once, idempotently', async () => {
    const sword = await ninja.give(SHARP, { equippedSlot: 'Weapon', equippedSet: 1 })
    // An old save: a fists outfit worn with a sharp weapon.
    await db
      .update(inventoryItems)
      .set({ itemId: FIST_OUTFIT })
      .where(eq(inventoryItems.itemId, CREATION))
    expect(await unequipMisfitWeaponsEverywhere(db)).toBe(1)
    expect(await rowOf(sword.id)).toMatchObject({ equippedSlot: null })
    expect(await unequipMisfitWeaponsEverywhere(db)).toBe(0)
  })
})
