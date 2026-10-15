// Bankai (Reborn bottom menu, level 30): weapons, the EXP pool, crystals and crystal cells.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import type { BankaiWeaponView } from '../../../../shared/src/schemas/bankai.js'
import { bankaiCrystals, bankaiWeapons, characterBankai, characters } from '../../db/schema.js'

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
  const created = await client.post('/api/game/characters', {
    name: 'Ninja_01',
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  characterId = created.json().character.id
  await setCharacter({ level: 40 })
})
afterEach(() => app.close())
afterAll(() => close())

const setCharacter = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const setBankai = (values: Partial<typeof characterBankai.$inferInsert>) =>
  db
    .insert(characterBankai)
    .values({ characterId, ...values })
    .onConflictDoUpdate({ target: characterBankai.characterId, set: values })
const giveWeapon = (weapon: string, level: number, exp = 0) =>
  db.insert(bankaiWeapons).values({ characterId, weapon, level, exp })
const giveCrystal = async (values: Partial<typeof bankaiCrystals.$inferInsert>) =>
  (
    await db
      .insert(bankaiCrystals)
      .values({ characterId, quality: 'green', stat: 'strength', inventorySlot: 0, ...values })
      .returning()
  )[0]!
const crystal = async (id: string) =>
  (await db.select().from(bankaiCrystals).where(eq(bankaiCrystals.id, id)))[0]
const bankaiRow = async () =>
  (await db.select().from(characterBankai).where(eq(characterBankai.characterId, characterId)))[0]
const characterRow = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const post = (path: string, body: object) => client.post(`/api/game/bankai${path}`, body)
const weaponOf = (view: { weapons: { weapon: string }[] }, weapon: string) =>
  view.weapons.find((w) => w.weapon === weapon) as BankaiWeaponView

describe('GET /api/game/bankai', () => {
  it('opens at level 30', async () => {
    await setCharacter({ level: 29 })
    const response = await client.get('/api/game/bankai')
    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('level_too_low')
  })

  it('starts with three locked weapons and 8 open crystal cells', async () => {
    await setCharacter({ level: 30 })
    const response = await client.get('/api/game/bankai')
    expect(response.statusCode).toBe(200)
    const view = response.json()
    expect(view).toMatchObject({ expPool: 0, coins: 0, activeWeapon: null })
    expect(view.weapons.map((w: { weapon: string }) => w.weapon)).toEqual([
      'zangetsu',
      'senbonzakura',
      'iceRing',
    ])
    expect(weaponOf(view, 'zangetsu')).toMatchObject({
      level: 0,
      unlockable: false,
      requirement: 'Character Level 40',
      ringSlotLevels: [1, 2, 3, 4, 5, 6, 8, 10],
    })
    expect(weaponOf(view, 'senbonzakura').requirement).toBe('Zangetsu Level 10')
    expect(view.inventory).toHaveLength(80)
    expect(view.lockedSlots).toHaveLength(72)
    expect(view.lockedSlots[0]).toBe(8)
    expect(view.forgeNpcs[0]).toEqual({ name: 'Konan', cost: 50 })
  })

  it('describes crystals and sums the ringed ones as Soul Crystal', async () => {
    await giveWeapon('zangetsu', 2)
    await giveCrystal({ quality: 'blue', stat: 'speed', level: 2, inventorySlot: 3 })
    await giveCrystal({ stat: 'strength', inventorySlot: null, weapon: 'zangetsu', ringSlot: 0 })
    await giveCrystal({ stat: 'strength', inventorySlot: null, weapon: 'zangetsu', ringSlot: 1 })
    const view = (await client.get('/api/game/bankai')).json()
    expect(view.inventory[3]).toMatchObject({
      name: 'Soft Wind',
      label: 'Speed %',
      value: 0.75,
      level: 2,
      maxLevel: 10,
      xpNeeded: 900,
      foodXp: 650,
      price: 2,
    })
    expect(weaponOf(view, 'zangetsu').ring).toHaveLength(8)
    expect(weaponOf(view, 'zangetsu').soulCrystal).toEqual([{ label: 'Strength', value: 8 }])
  })
})

describe('weapons', () => {
  it('unlocks Zangetsu at level 40 and refuses the next weapon before Zangetsu Lv10', async () => {
    const unlocked = await post('/unlock', { weapon: 'zangetsu' })
    expect(unlocked.statusCode).toBe(200)
    expect(weaponOf(unlocked.json(), 'zangetsu')).toMatchObject({
      level: 1,
      required: 3000,
      form: 1,
      forms: 1,
    })
    expect(weaponOf(unlocked.json(), 'zangetsu').stats).toContainEqual(
      expect.objectContaining({ label: 'Strength', value: 40, swapped: false }),
    )
    const again = await post('/unlock', { weapon: 'zangetsu' })
    expect(again.json().error.code).toBe('already_unlocked')
    const next = await post('/unlock', { weapon: 'senbonzakura' })
    expect(next.statusCode).toBe(400)
    expect(next.json().error.code).toBe('locked')
  })

  it('refuses Zangetsu below character level 40', async () => {
    await setCharacter({ level: 39 })
    expect((await post('/unlock', { weapon: 'zangetsu' })).json().error.code).toBe('locked')
  })

  it('upgrades from the EXP pool, one level per press', async () => {
    await giveWeapon('zangetsu', 1, 2500)
    await setBankai({ expPool: 10000 })
    const response = await post('/upgrade', { weapon: 'zangetsu' })
    expect(response.statusCode).toBe(200)
    expect(response.json().expPool).toBe(9500)
    expect(weaponOf(response.json(), 'zangetsu')).toMatchObject({ level: 2, exp: 0 })
  })

  it('refuses to upgrade with an empty pool, a locked weapon or at the max level', async () => {
    await giveWeapon('zangetsu', 15)
    expect((await post('/upgrade', { weapon: 'zangetsu' })).json().error.code).toBe('max_level')
    await setBankai({ expPool: 100 })
    expect((await post('/upgrade', { weapon: 'iceRing' })).json().error.code).toBe('not_unlocked')
    await giveWeapon('senbonzakura', 1)
    await setBankai({ expPool: 0 })
    expect((await post('/upgrade', { weapon: 'senbonzakura' })).json().error.code).toBe('no_exp')
  })

  it('activates an unlocked weapon and picks only opened forms', async () => {
    await giveWeapon('zangetsu', 5)
    expect((await post('/activate', { weapon: 'iceRing' })).json().error.code).toBe('not_unlocked')
    expect((await post('/activate', { weapon: 'zangetsu' })).json().activeWeapon).toBe('zangetsu')
    expect((await post('/form', { weapon: 'zangetsu', form: 3 })).json().error.code).toBe(
      'form_locked',
    )
    const form = await post('/form', { weapon: 'zangetsu', form: 2 })
    expect(weaponOf(form.json(), 'zangetsu')).toMatchObject({ form: 2, forms: 2 })
  })

  it('toggles a stat swap to its counterpart at the same value', async () => {
    await giveWeapon('zangetsu', 1)
    const swapped = await post('/stat-swap', { stat: 'strength' })
    expect(weaponOf(swapped.json(), 'zangetsu').stats).toContainEqual(
      expect.objectContaining({ stat: 'strength', label: 'Stamina', value: 40, swapped: true }),
    )
    const back = await post('/stat-swap', { stat: 'strength' })
    expect(weaponOf(back.json(), 'zangetsu').stats[0]).toMatchObject({ swapped: false })
  })
})

describe('crystals', () => {
  it('rings a crystal into an open slot and back to a cell', async () => {
    await giveWeapon('zangetsu', 1)
    const gem = await giveCrystal({ inventorySlot: 2 })
    const ringed = await post('/crystals/move', {
      from: { type: 'inventory', index: 2 },
      to: { type: 'ring', weapon: 'zangetsu', slot: 0 },
    })
    expect(ringed.statusCode).toBe(200)
    expect(weaponOf(ringed.json(), 'zangetsu').ring).toContainEqual(
      expect.objectContaining({ id: gem.id }),
    )
    expect(await crystal(gem.id)).toMatchObject({ inventorySlot: null, ringSlot: 0 })
    const locked = await post('/crystals/move', {
      from: { type: 'ring', weapon: 'zangetsu', slot: 0 },
      to: { type: 'ring', weapon: 'zangetsu', slot: 1 },
    })
    expect(locked.json().error.code).toBe('slot_locked')
    await post('/crystals/unequip', { weapon: 'zangetsu', slot: 0 })
    expect(await crystal(gem.id)).toMatchObject({ inventorySlot: 0, weapon: null })
  })

  it('swaps two cells and refuses a locked cell', async () => {
    const a = await giveCrystal({ inventorySlot: 0 })
    const b = await giveCrystal({ inventorySlot: 1, stat: 'agility' })
    await post('/crystals/move', {
      from: { type: 'inventory', index: 0 },
      to: { type: 'inventory', index: 1 },
    })
    expect((await crystal(a.id))!.inventorySlot).toBe(1)
    expect((await crystal(b.id))!.inventorySlot).toBe(0)
    const locked = await post('/crystals/move', {
      from: { type: 'inventory', index: 0 },
      to: { type: 'inventory', index: 9 },
    })
    expect(locked.json().error.code).toBe('slot_locked')
  })

  it('devours food crystals into the target', async () => {
    const target = await giveCrystal({ inventorySlot: 0 })
    const food1 = await giveCrystal({ inventorySlot: 1, level: 2 })
    const food2 = await giveCrystal({ inventorySlot: 2 })
    const response = await post('/crystals/devour', {
      targetId: target.id,
      foodIds: [food1.id, food2.id],
    })
    expect(response.statusCode).toBe(200)
    // 325 + 25 = 350: one level (300) and 50 over.
    expect(response.json()).toMatchObject({ xpGained: 350, targetLevel: 2 })
    expect(await crystal(target.id)).toMatchObject({ level: 2, exp: 50 })
    expect(await crystal(food1.id)).toBeUndefined()
    const self = await post('/crystals/devour', { targetId: target.id, foodIds: [target.id] })
    expect(self.json().error.code).toBe('bad_food')
  })

  it('absorbs a cell crystal into a ringed one', async () => {
    await giveWeapon('zangetsu', 1)
    const ringed = await giveCrystal({ inventorySlot: null, weapon: 'zangetsu', ringSlot: 0 })
    const food = await giveCrystal({ inventorySlot: 4, quality: 'blue' })
    const response = await post('/crystals/absorb', {
      weapon: 'zangetsu',
      slot: 0,
      foodId: food.id,
    })
    expect(response.json()).toMatchObject({ xpGained: 50, targetLevel: 1 })
    expect(await crystal(ringed.id)).toMatchObject({ exp: 50 })
    expect(await crystal(food.id)).toBeUndefined()
  })

  it('sells a cell crystal for Bankai Coins', async () => {
    const gem = await giveCrystal({ quality: 'gold', inventorySlot: 5 })
    const response = await post('/crystals/sell', { id: gem.id })
    expect(response.json().coins).toBe(6)
    expect(await crystal(gem.id)).toBeUndefined()
  })
})

describe('POST /api/game/bankai/slots/unlock', () => {
  it('buys a cell with coupons (50 x slot) and refuses a second buy', async () => {
    await setCharacter({ giftCoupon: 500 })
    const response = await post('/slots/unlock', { slot: 8, payWith: 'coupons' })
    expect(response.statusCode).toBe(200)
    expect(response.json().lockedSlots).not.toContain(8)
    expect((await characterRow()).giftCoupon).toBe(100)
    expect((await bankaiRow())!.unlockedSlots).toEqual([8])
    const again = await post('/slots/unlock', { slot: 8, payWith: 'gold' })
    expect(again.json().error.code).toBe('already_unlocked')
  })

  it('refuses when the currency is short and charges stones (5000 x slot)', async () => {
    await setCharacter({ gold: 9, stone: 50000 })
    expect((await post('/slots/unlock', { slot: 9, payWith: 'gold' })).json().error.code).toBe(
      'not_enough',
    )
    await post('/slots/unlock', { slot: 9, payWith: 'stones' })
    expect((await characterRow()).stone).toBe(5000)
  })
})
