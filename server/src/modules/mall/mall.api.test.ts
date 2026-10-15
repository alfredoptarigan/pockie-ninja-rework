// Ninja Mall API: the catalogue by tab, buying with a quantity in Gold or Gift Certificates, the
// bag check before charging and the daily limits.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MallBuyResult, MallView } from '../../../../shared/src/schemas/mall.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterMallPurchases } from '../../db/schema.js'
import { BAG_CELLS } from '../../game/bag.js'
import { errorCode, setUpNinja, today } from '../gates/test-setup.js'
import { MALL_CATALOGUE } from './catalogue.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.set({ gold: 1000, giftCoupon: 1000 })
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const PATH = '/api/game/mall'
const indexOf = (itemId: string) => MALL_CATALOGUE.findIndex((entry) => entry.itemId === itemId)
const EXP_SEAL = 'i120002' // 18, Gold or Gift Certificates, Food
const VIP_3_DAY = 'i150270' // 28, Gold only, daily limit 1 (placeholder)
const view = async () => {
  const response = await ninja.client.get(PATH)
  expect(response.statusCode).toBe(200)
  return response.json<MallView>()
}
const buy = (itemId: string, quantity: number, currency: 'gold' | 'coupons' = 'gold') =>
  ninja.client.post(`${PATH}/buy`, { index: indexOf(itemId), quantity, currency })
const held = async (itemId: string, bound: boolean) =>
  (await ninja.bag(itemId)).filter((r) => r.bound === bound).reduce((n, r) => n + r.count, 0)

describe('GET /api/game/mall', () => {
  it('lists the 2011 catalogue in Reborn tabs, with prices, currencies and limits', async () => {
    const data = await view()
    expect(data.groups.map((g) => [g.key, g.label])).toEqual([
      ['hot', 'Hot'],
      ['food', 'Food'],
      ['gem', 'Gem'],
      ['pet', 'Pet'],
      ['vip', 'VIP'],
      ['other', 'Other'],
    ])
    const food = data.groups.find((g) => g.key === 'food')!
    expect(food.items.find((i) => i.itemId === EXP_SEAL)).toMatchObject({
      index: indexOf(EXP_SEAL),
      price: 18,
      currency: 'gold',
      altCurrency: 'coupons',
      altPrice: 18,
      info: { stack: 20 },
    })
    const vip = data.groups.find((g) => g.key === 'vip')!
    const card = vip.items.find((i) => i.itemId === VIP_3_DAY)!
    expect(card).toMatchObject({ price: 28, dailyLimit: 1, purchasedToday: 0 })
    expect(card.altCurrency).toBeUndefined()
    // Hot repeats rows of the other tabs; withheld secret technique scrolls are absent.
    expect(data.groups[0]!.items.some((i) => i.itemId === VIP_3_DAY)).toBe(true)
    const all = data.groups.flatMap((g) => g.items.map((i) => i.itemId))
    expect(all).not.toContain('i159000')
    expect(data.resetAt).toBe(
      new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString(),
    )
  })
})

describe('POST /api/game/mall/buy', () => {
  it('buys a quantity for Gold: unbound items in the bag and the total charged', async () => {
    const response = await buy(EXP_SEAL, 3)
    expect(response.statusCode).toBe(200)
    const result = response.json<MallBuyResult>()
    expect(result.character).toMatchObject({ gold: 1000 - 18 * 3, giftCoupon: 1000 })
    expect(await held(EXP_SEAL, false)).toBe(3)
    expect(result.mall.groups.length).toBe(6)
  })

  it('buys for Gift Certificates: the items are bound', async () => {
    const response = await buy(EXP_SEAL, 2, 'coupons')
    expect(response.statusCode).toBe(200)
    expect(response.json<MallBuyResult>().character).toMatchObject({ gold: 1000, giftCoupon: 964 })
    expect(await held(EXP_SEAL, true)).toBe(2)
  })

  it('refuses Gift Certificates on a Gold-only row', async () => {
    expect(errorCode(await buy(VIP_3_DAY, 1, 'coupons'))).toBe('invalid_currency')
  })

  it('refuses when the total is more than the ninja has, and charges nothing', async () => {
    await ninja.set({ gold: 18 * 3 - 1 })
    expect(errorCode(await buy(EXP_SEAL, 3))).toBe('no_gold')
    expect((await ninja.row()).gold).toBe(53)
    expect(await held(EXP_SEAL, false)).toBe(0)
  })

  it('checks the bag before charging', async () => {
    for (let i = 0; i < BAG_CELLS; i++) await ninja.give('i100004', { count: 100 })
    expect(errorCode(await buy(EXP_SEAL, 1))).toBe('bag_full')
    expect((await ninja.row()).gold).toBe(1000)
  })

  it('enforces the daily limit and starts again on a new day', async () => {
    const first = await buy(VIP_3_DAY, 1)
    expect(first.statusCode).toBe(200)
    const card = first
      .json<MallBuyResult>()
      .mall.groups.find((g) => g.key === 'vip')!
      .items.find((i) => i.itemId === VIP_3_DAY)
    expect(card).toMatchObject({ dailyLimit: 1, purchasedToday: 1 })
    expect(errorCode(await buy(VIP_3_DAY, 1))).toBe('limit_reached')
    expect((await ninja.row()).gold).toBe(1000 - 28)

    await db
      .update(characterMallPurchases)
      .set({ day: '2000-01-01' })
      .where(eq(characterMallPurchases.characterId, ninja.characterId))
    expect((await buy(VIP_3_DAY, 1)).statusCode).toBe(200)
    const [row] = await db
      .select()
      .from(characterMallPurchases)
      .where(eq(characterMallPurchases.characterId, ninja.characterId))
    expect(row).toMatchObject({ day: today(), count: 1 })
  })

  it('validates the request', async () => {
    const post = (body: object) => ninja.client.post(`${PATH}/buy`, body)
    expect(
      (await post({ index: indexOf(EXP_SEAL), quantity: 0, currency: 'gold' })).statusCode,
    ).toBe(400)
    expect(
      (await post({ index: indexOf(EXP_SEAL), quantity: 100, currency: 'gold' })).statusCode,
    ).toBe(400)
    expect((await post({ index: 0, quantity: 1, currency: 'stone' })).statusCode).toBe(400)
    expect(errorCode(await post({ index: 9999, quantity: 1, currency: 'gold' }))).toBe(
      'unknown_item',
    )
  })
})
