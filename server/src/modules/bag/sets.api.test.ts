// Reborn equipment sets (loadouts): five sets I-V, IV-V need VIP; everything worn is the active set.
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

// Sharp: the setUpNinja outfit (clothing 3) is Sharp in Reborn.
const WEAPON = 'i260100' // sharp weapon, level 1
const WEAPON_2 = 'i260101' // sharp weapon, level 1

interface Row {
  id: string
  equippedSlot: string | null
  equippedSet: number | null
  page: number | null
}
const inventory = async (): Promise<Row[]> =>
  (await ninja.client.get('/api/game/inventory')).json().items
const find = async (id: string) => (await inventory()).find((row) => row.id === id)!
const switchTo = (set: unknown) => ninja.client.post('/api/game/sets/active', { set })
const stats = async () => (await ninja.client.get('/api/game/character')).json().stats
const dbRow = async (id: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0]!

describe('equipment sets', () => {
  it('starts on set I and reports the set of each worn row', async () => {
    const worn = await ninja.give(WEAPON, { equippedSlot: 'Weapon' })
    const loose = await ninja.give(WEAPON_2)
    expect((await ninja.client.get('/api/game/character')).json().character.activeSet).toBe(1)
    expect(await find(worn.id)).toMatchObject({ equippedSlot: 'Weapon', equippedSet: 1 })
    expect(await find(loose.id)).toMatchObject({ equippedSlot: null, equippedSet: null })
  })

  it('switches sets: the other set keeps its gear out of the bag and out of the fight', async () => {
    const worn = await ninja.give(WEAPON, { equippedSlot: 'Weapon' })
    const armed = await stats()

    const switched = await switchTo(2)
    expect(switched.statusCode).toBe(200)
    expect(switched.json().character.activeSet).toBe(2)
    expect(switched.json().items.find((row: Row) => row.id === worn.id)).toMatchObject({
      equippedSlot: 'Weapon',
      equippedSet: 1,
      page: null,
    })
    expect((await stats()).maxAttack).toBeLessThan(armed.maxAttack)

    expect((await switchTo(1)).json().character.activeSet).toBe(1)
    expect(await stats()).toEqual(armed)
  })

  it('equips and unequips in the active set only', async () => {
    const first = await ninja.give(WEAPON, { equippedSlot: 'Weapon' })
    const second = await ninja.give(WEAPON_2)
    await switchTo(2)

    const equipped = await ninja.client.post(`/api/game/items/${second.id}/equip`)
    expect(equipped.statusCode).toBe(200)
    expect(await find(second.id)).toMatchObject({ equippedSlot: 'Weapon', equippedSet: 2 })
    // Set I still wears its own weapon.
    expect(await find(first.id)).toMatchObject({ equippedSlot: 'Weapon', equippedSet: 1 })

    const other = await ninja.client.post(`/api/game/items/${first.id}/unequip`)
    expect(other.statusCode).toBe(400)
    expect(errorCode(other)).toBe('not_equipped')

    expect((await ninja.client.post(`/api/game/items/${second.id}/unequip`)).statusCode).toBe(200)
    expect(await find(second.id)).toMatchObject({ equippedSlot: null, equippedSet: null })
  })

  it('moves an item worn in another set into the active one', async () => {
    const weapon = await ninja.give(WEAPON, { equippedSlot: 'Weapon' })
    const spare = await ninja.give(WEAPON_2, { equippedSlot: 'Weapon', equippedSet: 2 })
    await switchTo(2)

    expect((await ninja.client.post(`/api/game/items/${weapon.id}/equip`)).statusCode).toBe(200)
    expect(await dbRow(weapon.id)).toMatchObject({ equippedSlot: 'Weapon', equippedSet: 2 })
    // The piece it replaced goes back to the bag; set I is left without a weapon.
    expect(await find(spare.id)).toMatchObject({ equippedSlot: null, page: 0 })
    await switchTo(1)
    const setOne = (await inventory()).filter((row) => row.equippedSet === 1)
    expect(setOne.map((row) => row.equippedSlot)).toEqual(['Outfit'])
  })

  it('refuses sets IV and V without VIP and allows them with it', async () => {
    const refused = await switchTo(4)
    expect(refused.statusCode).toBe(400)
    expect(errorCode(refused)).toBe('vip_required')
    expect(refused.json().error.message).toBe('VIP required for equipment sets')
    expect((await ninja.row()).activeSet).toBe(1)

    await ninja.set({ vipUntil: new Date(Date.now() + 86_400_000) })
    expect((await switchTo(5)).json().character.activeSet).toBe(5)
  })

  it('treats the active set as a no-op and rejects sets outside I-V', async () => {
    expect((await switchTo(1)).statusCode).toBe(200)
    for (const set of [0, 6, 1.5, 'II', null])
      expect((await switchTo(set)).statusCode, String(set)).toBe(400)
  })

  it('counts a wing only while its set is worn', async () => {
    const wing = await ninja.give('i218000', { equippedSlot: 'Wing' })
    const winged = await stats()
    const wings = async () => (await ninja.client.get('/api/game/wings')).json().equipped
    expect(await wings()).toMatchObject({ id: wing.id })
    await switchTo(2)
    expect(await wings()).toBeNull()
    expect(await stats()).not.toEqual(winged)
  })

  it('shows only the active set on View Character', async () => {
    await ninja.give(WEAPON, { equippedSlot: 'Weapon' })
    const view = async () =>
      (await ninja.client.get(`/api/game/social/players/${ninja.characterId}`)).json().equipped
    // The creation outfit is worn in set I and is the fallback outfit of the other sets.
    const outfit = expect.objectContaining({ slot: 'Outfit' })
    const weapon = expect.objectContaining({ slot: 'Weapon', itemId: WEAPON })
    expect(await view()).toEqual(expect.arrayContaining([outfit, weapon]))
    expect(await view()).toHaveLength(2)
    await switchTo(3)
    expect(await view()).toEqual([])
  })
})
