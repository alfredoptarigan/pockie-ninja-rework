// Impel Down: the view, floor fights with lives, EXP and crystals, Auto Sell, the intersection's
// next gate and refresh, and the Zanpakuto weapon slots it opens.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ImpelDownFightResult,
  ImpelDownView,
} from '../../../../shared/src/schemas/impel-down.js'
import type { ZanpakutoView } from '../../../../shared/src/schemas/zanpakuto.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterZanpakuto, impelDownPlayers, zanpakutoCrystals } from '../../db/schema.js'
import { errorCode, setUpNinja, today } from '../gates/test-setup.js'
import { floorDrops, floorExp } from './floors.js'

/** Strong: a ninja that always wins; weak: one hit point and no attack. */
const power = vi.hoisted(() => ({ strong: true }))
vi.mock('../../game/combat.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../game/combat.js')>()
  return {
    ...original,
    playerFighter: async (...args: Parameters<typeof original.playerFighter>) => {
      const fighter = await original.playerFighter(...args)
      return power.strong
        ? { ...fighter, maxHp: 10_000_000, minAttack: 5_000_000, maxAttack: 6_000_000, hit: 10_000 }
        : { ...fighter, maxHp: 1, minAttack: 0, maxAttack: 0, hit: 0, skills: [] }
    },
  }
})

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  power.strong = true
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.ready(61)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const PATH = '/api/game/impel-down'
const view = async () => {
  const response = await ninja.client.get(PATH)
  expect(response.statusCode).toBe(200)
  return response.json<ImpelDownView>()
}
const fight = (autoSell = 0) => ninja.client.post(`${PATH}/fight`, { autoSell })
const won = async (autoSell = 0) => {
  const response = await fight(autoSell)
  expect(response.statusCode).toBe(200)
  return response.json<ImpelDownFightResult>()
}
const row = async () =>
  (
    await db
      .select()
      .from(impelDownPlayers)
      .where(eq(impelDownPlayers.characterId, ninja.characterId))
  )[0]
const setRow = (values: Partial<typeof impelDownPlayers.$inferInsert>) =>
  db
    .insert(impelDownPlayers)
    .values({ characterId: ninja.characterId, ...values })
    .onConflictDoUpdate({ target: impelDownPlayers.characterId, set: values })
const crystals = () =>
  db.select().from(zanpakutoCrystals).where(eq(zanpakutoCrystals.characterId, ninja.characterId))
const spiritCoins = async () =>
  (
    await db
      .select()
      .from(characterZanpakuto)
      .where(eq(characterZanpakuto.characterId, ninja.characterId))
  )[0]?.coins ?? 0

describe('GET /api/game/impel-down', () => {
  it('opens at level 61', async () => {
    await ninja.set({ level: 60 })
    const response = await ninja.client.get(PATH)
    expect(response.statusCode).toBe(403)
    expect(errorCode(response)).toBe('level_too_low')
  })
  it('starts at gate 1 floor 1 with 3 lives and the floor’s rewards', async () => {
    const data = await view()
    expect(data).toMatchObject({
      gate: 0,
      floor: 0,
      maxFloor: 0,
      intersection: false,
      lives: 3,
      maxLives: 3,
      refreshes: 0,
      refreshCost: 1000,
      nextGateLevel: 67,
      exp: floorExp(0, 0),
      drops: floorDrops(0, 0),
    })
    expect(data.resetAt).toBe(
      new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString(),
    )
    // Reading never creates the ninja's row.
    expect(await row()).toBeUndefined()
  })
})

describe('POST /api/game/impel-down/fight', () => {
  it('clears the floor: next floor, best floor, EXP, no life or HP spent', async () => {
    const before = await ninja.row()
    const result = await won()
    expect(result.won).toBe(true)
    expect(result.exp).toBe(floorExp(0, 0))
    expect(result.look.clothing).toBeGreaterThan(0)
    expect(result.impelDown).toMatchObject({ floor: 1, maxFloor: 1, lives: 3 })
    const after = await ninja.row()
    expect(after.exp).toBe(before.exp + floorExp(0, 0))
    expect(after).toMatchObject({ hp: before.hp, mp: before.mp })
  })
  it('drops a guaranteed crystal on floor 5 into the spirit inventory', async () => {
    await setRow({ floor: 4, maxFloor: 4 })
    const result = await won()
    const iids = floorDrops(0, 4).map(([iid]) => iid)
    expect(result.crystal).toMatchObject({ sold: false, coins: 0 })
    expect(iids).toContain(result.crystal!.iid)
    const [kept] = await crystals()
    expect(kept).toMatchObject({ itemId: result.crystal!.iid, spiritSlot: 0 })
    expect(result.impelDown).toMatchObject({ floor: 5, maxFloor: 5 })
  })
  it('Auto Sell turns the crystal into Spirit Coins', async () => {
    await setRow({ floor: 4 })
    const result = await won(3)
    expect(result.crystal).toMatchObject({ sold: true })
    expect(result.crystal!.coins).toBeGreaterThan(0)
    expect(await crystals()).toHaveLength(0)
    expect(await spiritCoins()).toBe(result.crystal!.coins)
  })
  it('sells the crystal when the spirit inventory is full', async () => {
    for (const spiritSlot of [0, 1, 2, 3])
      await db
        .insert(zanpakutoCrystals)
        .values({ characterId: ninja.characterId, itemId: 480001, stats: [[8, 100]], spiritSlot })
    await setRow({ floor: 9 })
    const result = await won()
    expect(result.crystal).toMatchObject({ sold: true })
    expect(await crystals()).toHaveLength(4)
    expect(await spiritCoins()).toBe(result.crystal!.coins)
  })
  it('a lost fight costs a life and keeps the floor; no lives, no fight', async () => {
    power.strong = false
    await setRow({ floor: 1, maxFloor: 1 })
    const result = await won()
    expect(result).toMatchObject({ won: false, exp: 0, crystal: null })
    expect(result.impelDown).toMatchObject({ floor: 1, lives: 2 })
    expect(await row()).toMatchObject({ livesDay: today(), livesUsed: 1 })
    await setRow({ livesUsed: 3 })
    const response = await fight()
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('no_lives')
  })
  it('gives the lives back on a new day', async () => {
    await setRow({ livesDay: '2020-01-01', livesUsed: 3 })
    expect((await view()).lives).toBe(3)
    expect((await fight()).statusCode).toBe(200)
  })
  it('reaches the intersection after floor 25 and stops fighting there', async () => {
    await setRow({ floor: 24, maxFloor: 24 })
    const result = await won()
    expect(result.impelDown).toMatchObject({
      floor: 25,
      maxFloor: 25,
      intersection: true,
      drops: [],
    })
    expect(errorCode(await fight())).toBe('intersection')
  })
  it('rejects a bad Auto Sell tier', async () => {
    expect((await ninja.client.post(`${PATH}/fight`, { autoSell: 4 })).statusCode).toBe(400)
  })
})

describe('the intersection', () => {
  beforeEach(() => setRow({ floor: 25, maxFloor: 25 }))

  it('needs the next gate’s level to go on, then starts it at floor 1', async () => {
    const low = await ninja.client.post(`${PATH}/next-gate`)
    expect(low.statusCode).toBe(403)
    expect(errorCode(low)).toBe('level_too_low')
    await ninja.set({ level: 67 })
    const response = await ninja.client.post(`${PATH}/next-gate`)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ gate: 1, floor: 0, maxFloor: 25 })
    expect(errorCode(await ninja.client.post(`${PATH}/next-gate`))).toBe('not_intersection')
  })
  it('has no gate after the 6th', async () => {
    await ninja.set({ level: 90 })
    await setRow({ gate: 5 })
    expect(errorCode(await ninja.client.post(`${PATH}/next-gate`))).toBe('last_gate')
  })
  it('refreshes for coupons back to floor 1, at most 5 times a day', async () => {
    await ninja.set({ giftCoupon: 2500 })
    await setRow({ gate: 0, maxFloor: 25 })
    const response = await ninja.client.post(`${PATH}/refresh`)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ floor: 0, refreshes: 1, refreshCost: 2000 })
    expect((await ninja.row()).giftCoupon).toBe(1500)
    await setRow({ floor: 25 })
    expect(errorCode(await ninja.client.post(`${PATH}/refresh`))).toBe('not_enough')
    await setRow({ refreshDay: today(), refreshes: 5 })
    expect(errorCode(await ninja.client.post(`${PATH}/refresh`))).toBe('no_refreshes')
  })
  it('refuses a refresh away from the intersection', async () => {
    await setRow({ floor: 3 })
    expect(errorCode(await ninja.client.post(`${PATH}/refresh`))).toBe('not_intersection')
  })
  it('opens Zanpakuto weapon slot 1 once gate 1 is cleared', async () => {
    const zanpakuto: ZanpakutoView = (await ninja.client.get('/api/game/zanpakuto')).json()
    expect(zanpakuto.lockedWeaponSlots).toEqual([2, 3, 4, 5])
  })
})
