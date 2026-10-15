// Zanpakuto (Reborn village icon, level 61): spirit slots, weapon tabs, refine and bulk refine.
import { createRandom } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ZANPAKUTO_REFINE_RANGES } from '../../../../game-core/src/zanpakuto/zanpakuto.js'
import type { ZanpakutoView } from '../../../../shared/src/schemas/zanpakuto.js'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { characters, characterZanpakuto, zanpakutoCrystals } from '../../db/schema.js'
import { grantZanpakutoCrystal } from './view.js'

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
  await setCharacter({ level: 61 })
})
afterEach(() => app.close())
afterAll(() => close())

type Stat = [number, number]

const setCharacter = (values: Partial<typeof characters.$inferInsert>) =>
  db.update(characters).set(values).where(eq(characters.id, characterId))
const setZanpakuto = (values: Partial<typeof characterZanpakuto.$inferInsert>) =>
  db
    .insert(characterZanpakuto)
    .values({ characterId, ...values })
    .onConflictDoUpdate({ target: characterZanpakuto.characterId, set: values })
const giveCrystal = async (values: Partial<typeof zanpakutoCrystals.$inferInsert> = {}) =>
  (
    await db
      .insert(zanpakutoCrystals)
      .values({ characterId, itemId: 480001, stats: [[8, 100]], spiritSlot: 0, ...values })
      .returning()
  )[0]!
const crystal = async (id: string) =>
  (await db.select().from(zanpakutoCrystals).where(eq(zanpakutoCrystals.id, id)))[0]
const zanpakutoRow = async () =>
  (
    await db
      .select()
      .from(characterZanpakuto)
      .where(eq(characterZanpakuto.characterId, characterId))
  )[0]
const characterRow = async () =>
  (await db.select().from(characters).where(eq(characters.id, characterId)))[0]!
const post = (path: string, body: object) => client.post(`/api/game/zanpakuto${path}`, body)
const inRange = (category: 0 | 1 | 2, [stat, value]: Stat) => {
  const range = ZANPAKUTO_REFINE_RANGES[category][stat]
  return range !== undefined && value >= range[0] && value <= range[1]
}

describe('GET /api/game/zanpakuto', () => {
  it('opens at level 61', async () => {
    await setCharacter({ level: 60 })
    const response = await client.get('/api/game/zanpakuto')
    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('level_too_low')
  })

  it('starts empty with spirit slots 0-3 open and only weapon slot 0 open', async () => {
    const response = await client.get('/api/game/zanpakuto')
    expect(response.statusCode).toBe(200)
    const view: ZanpakutoView = response.json()
    expect(view).toMatchObject({ coins: 0, freeRefines: 3 })
    expect(view.spirit).toHaveLength(16)
    expect(view.lockedSlots).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(view.tabs.sharp).toHaveLength(6)
    expect(view.lockedWeaponSlots).toEqual([1, 2, 3, 4, 5])
    expect(['sharp', 'blunt', 'fist']).toContain(view.activeTab)
  })
})

describe('grantZanpakutoCrystal', () => {
  it('puts a crystal with one rolled stat in the first free spirit slot', async () => {
    await giveCrystal({ spiritSlot: 0 })
    const row = await db.transaction((tx) =>
      grantZanpakutoCrystal(tx, characterId, 480021, createRandom(3)),
    )
    expect(row).toMatchObject({ itemId: 480021, spiritSlot: 1 })
    expect(row!.stats).toHaveLength(1)
    expect(inRange(2, row!.stats[0]!)).toBe(true)
  })

  it('returns undefined when every open spirit slot is taken', async () => {
    for (const spiritSlot of [0, 1, 2, 3]) await giveCrystal({ spiritSlot })
    const row = await db.transaction((tx) =>
      grantZanpakutoCrystal(tx, characterId, 480001, createRandom(1)),
    )
    expect(row).toBeUndefined()
  })
})

describe('equip and unequip', () => {
  it('equips a crystal into its weapon tab slot (position - 1)', async () => {
    const gem = await giveCrystal({ itemId: 480031 })
    const response = await post('/equip', { id: gem.id })
    expect(response.statusCode).toBe(200)
    const view: ZanpakutoView = response.json()
    expect(view.tabs.blunt[0]?.id).toBe(gem.id)
    expect(view.spirit[0]).toBeNull()
  })

  it('swaps with the crystal already in that slot', async () => {
    const worn = await giveCrystal({ itemId: 480001, spiritSlot: null, tab: 'sharp', tabSlot: 0 })
    const gem = await giveCrystal({ itemId: 480011, spiritSlot: 2 })
    expect((await post('/equip', { id: gem.id })).statusCode).toBe(200)
    expect(await crystal(gem.id)).toMatchObject({ tab: 'sharp', tabSlot: 0, spiritSlot: null })
    expect(await crystal(worn.id)).toMatchObject({ tab: null, spiritSlot: 2 })
  })

  it('refuses a slot still locked behind Impel Down floors', async () => {
    const gem = await giveCrystal({ itemId: 480002 })
    const response = await post('/equip', { id: gem.id })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('slot_locked')
  })

  it('unequips into the first free spirit slot, and refuses when they are full', async () => {
    const worn = await giveCrystal({ spiritSlot: null, tab: 'sharp', tabSlot: 0 })
    await giveCrystal({ spiritSlot: 0, itemId: 480011 })
    expect((await post('/unequip', { id: worn.id })).statusCode).toBe(200)
    expect(await crystal(worn.id)).toMatchObject({ spiritSlot: 1, tab: null })

    await post('/equip', { id: worn.id })
    for (const spiritSlot of [1, 2, 3]) await giveCrystal({ spiritSlot, itemId: 480021 })
    const full = await post('/unequip', { id: worn.id })
    expect(full.statusCode).toBe(400)
    expect(full.json().error.code).toBe('inventory_full')
  })
})

describe('POST /sell', () => {
  it('sells a spirit crystal for its Spirit Coins', async () => {
    const gem = await giveCrystal({ itemId: 480026 })
    const response = await post('/sell', { id: gem.id })
    expect(response.statusCode).toBe(200)
    expect(response.json().coins).toBe(300)
    expect(await crystal(gem.id)).toBeUndefined()
  })

  it('refuses an equipped crystal', async () => {
    const gem = await giveCrystal({ spiritSlot: null, tab: 'sharp', tabSlot: 0 })
    expect((await post('/sell', { id: gem.id })).statusCode).toBe(400)
  })
})

describe('POST /slots/unlock', () => {
  it('buys spirit slot i for 200i coupons', async () => {
    await setCharacter({ giftCoupon: 1000 })
    const response = await post('/slots/unlock', { slot: 4, currency: 'coupons' })
    expect(response.statusCode).toBe(200)
    expect(response.json().lockedSlots).not.toContain(4)
    expect((await characterRow()).giftCoupon).toBe(200)
  })

  it('buys with stones, and refuses an open slot or too little currency', async () => {
    await setCharacter({ stone: 150_000, giftCoupon: 0 })
    expect((await post('/slots/unlock', { slot: 5, currency: 'stones' })).statusCode).toBe(200)
    expect((await characterRow()).stone).toBe(50_000)
    expect((await post('/slots/unlock', { slot: 5, currency: 'stones' })).statusCode).toBe(409)
    expect((await post('/slots/unlock', { slot: 2, currency: 'stones' })).statusCode).toBe(409)
    const poor = await post('/slots/unlock', { slot: 8, currency: 'coupons' })
    expect(poor.statusCode).toBe(400)
    expect(poor.json().error.code).toBe('not_enough')
  })
})

describe('POST /attributes/unlock', () => {
  it('activates stat 2 for 1000 coupons and clears open bulk options', async () => {
    await setCharacter({ giftCoupon: 1500 })
    const gem = await giveCrystal({ bulkOptions: [[[8, 50]]] })
    const response = await post('/attributes/unlock', { id: gem.id, position: 1 })
    expect(response.statusCode).toBe(200)
    const row = await crystal(gem.id)
    expect(row!.stats).toHaveLength(2)
    expect(inRange(0, row!.stats[1]!)).toBe(true)
    expect(row!.bulkOptions).toEqual([])
    expect((await characterRow()).giftCoupon).toBe(500)
  })

  it('needs stat 2 before stat 3 and enough coupons', async () => {
    await setCharacter({ giftCoupon: 5000 })
    const gem = await giveCrystal()
    const early = await post('/attributes/unlock', { id: gem.id, position: 2 })
    expect(early.statusCode).toBe(400)
    await setCharacter({ giftCoupon: 999 })
    const poor = await post('/attributes/unlock', { id: gem.id, position: 1 })
    expect(poor.json().error.code).toBe('not_enough')
  })
})

describe('POST /refine', () => {
  it('re-rolls every stat: 3 free a day, then 10 SC', async () => {
    await setZanpakuto({ coins: 15 })
    const gem = await giveCrystal({
      stats: [
        [8, 100],
        [15, 10],
      ],
      bulkOptions: [[[8, 1]]],
    })
    for (const left of [2, 1, 0]) {
      const response = await post('/refine', { id: gem.id })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ freeRefines: left, coins: 15 })
    }
    const paid = await post('/refine', { id: gem.id })
    expect(paid.json().coins).toBe(5)
    expect((await zanpakutoRow())!.refinesUsed).toBe(4)
    const row = await crystal(gem.id)
    expect(row!.stats).toHaveLength(2)
    expect(row!.stats.every((stat) => inRange(0, stat))).toBe(true)
    expect(row!.bulkOptions).toEqual([])
    const broke = await post('/refine', { id: gem.id })
    expect(broke.statusCode).toBe(400)
    expect(broke.json().error.code).toBe('not_enough')
  })

  it('gives the free refines back on a new day', async () => {
    await setZanpakuto({ refineDay: '2020-01-01', refinesUsed: 3 })
    expect((await client.get('/api/game/zanpakuto')).json().freeRefines).toBe(3)
  })
})

describe('bulk refine', () => {
  const stats: Stat[] = [
    [8, 100],
    [15, 10],
    [21, 5],
  ]

  it('opens 10 options once, keeps them on reopen and refreshes for 30 SC and 50,000 stones', async () => {
    await setZanpakuto({ coins: 40 })
    await setCharacter({ stone: 60_000 })
    const gem = await giveCrystal({ itemId: 480011, stats })
    const opened = (await post('/bulk', { id: gem.id })).json() as ZanpakutoView
    const options = opened.spirit[0]!.bulkOptions
    expect(options).toHaveLength(10)
    expect(options.every((option) => option.length === 3)).toBe(true)
    expect(options.flat().every((stat) => inRange(1, stat))).toBe(true)
    const reopened = (await post('/bulk', { id: gem.id })).json() as ZanpakutoView
    expect(reopened.spirit[0]!.bulkOptions).toEqual(options)

    const refreshed = await post('/bulk/refresh', { id: gem.id })
    expect(refreshed.statusCode).toBe(200)
    expect(refreshed.json().coins).toBe(10)
    expect((await characterRow()).stone).toBe(10_000)
    expect((await post('/bulk/refresh', { id: gem.id })).json().error.code).toBe('not_enough')
  })

  it('saves an option keeping locked stats, charging 3 + 3L SC and 5000 + 5000L stones', async () => {
    await setZanpakuto({ coins: 10 })
    await setCharacter({ stone: 20_000 })
    const option: Stat[] = [
      [9, 20],
      [16, 12],
      [23, 6],
    ]
    const gem = await giveCrystal({ stats, bulkOptions: [option] })
    const response = await post('/bulk/apply', { id: gem.id, index: 0, locks: [1] })
    expect(response.statusCode).toBe(200)
    expect(response.json().coins).toBe(4)
    expect((await characterRow()).stone).toBe(10_000)
    expect(await crystal(gem.id)).toMatchObject({
      stats: [
        [9, 20],
        [15, 10],
        [23, 6],
      ],
      bulkOptions: [],
    })
  })

  it('saves for free without locks', async () => {
    const gem = await giveCrystal({ stats: [[8, 1]], bulkOptions: [[[13, 7]]] })
    expect((await post('/bulk/apply', { id: gem.id, index: 0, locks: [] })).statusCode).toBe(200)
    expect((await crystal(gem.id))!.stats).toEqual([[13, 7]])
  })

  it('refuses a locked stat repeated, locking every stat, or no open options', async () => {
    await setZanpakuto({ coins: 100 })
    await setCharacter({ stone: 100_000 })
    const clash: Stat[] = [
      [15, 20],
      [16, 12],
      [23, 6],
    ]
    const gem = await giveCrystal({ stats, bulkOptions: [clash] })
    const repeated = await post('/bulk/apply', { id: gem.id, index: 0, locks: [1] })
    expect(repeated.json().error.code).toBe('duplicate_stat')
    const single = await giveCrystal({ spiritSlot: 1, stats: [[8, 1]], bulkOptions: [[[9, 2]]] })
    const all = await post('/bulk/apply', { id: single.id, index: 0, locks: [0] })
    expect(all.json().error.code).toBe('bad_locks')
    const none = await giveCrystal({ spiritSlot: 2 })
    const missing = await post('/bulk/apply', { id: none.id, index: 0, locks: [] })
    expect(missing.json().error.code).toBe('no_option')
  })
})

it('answers no_crystal for a crystal the ninja does not own', async () => {
  const response = await post('/sell', { id: '00000000-0000-4000-8000-000000000000' })
  expect(response.statusCode).toBe(400)
  expect(response.json().error.code).toBe('no_crystal')
})
