// Festival Shop API: the catalogue with the token balance, buying an offer for Festival Tokens,
// the purchase limit, the level gate and the bag check before charging.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  FestivalShopBuyResult,
  FestivalShopView,
} from '../../../../shared/src/schemas/festival-shop.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterFestivalShop } from '../../db/schema.js'
import { BAG_CELLS } from '../../game/bag.js'
import { errorCode, setUpNinja } from '../gates/test-setup.js'
import { FESTIVAL_SHOP_PLACEHOLDERS as SHOP } from './config.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.set({ level: 20 })
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const PATH = '/api/game/festival-shop'
const VIP_3_DAY = SHOP.offers.findIndex((offer) => offer.itemId === 'i150270') // 100, limit 1
const SUSHI = SHOP.offers.findIndex((offer) => offer.itemId === 'i120001') // 10 for 5
const giveTokens = (tokens: number) =>
  db.insert(characterFestivalShop).values({ characterId: ninja.characterId, tokens })
const shop = async () =>
  (
    await db
      .select()
      .from(characterFestivalShop)
      .where(eq(characterFestivalShop.characterId, ninja.characterId))
  )[0]!
const buy = (index: number) => ninja.client.post(`${PATH}/buy`, { index })
const held = async (itemId: string) =>
  (await ninja.bag(itemId)).reduce((sum, row) => sum + row.count, 0)

describe('GET /api/game/festival-shop', () => {
  it('lists the offers with no tokens before any are earned', async () => {
    const response = await ninja.client.get(PATH)
    expect(response.statusCode).toBe(200)
    const view = response.json<FestivalShopView>()
    expect(view.tokens).toBe(0)
    expect(view.offers).toHaveLength(SHOP.offers.length)
    expect(view.offers[SUSHI]).toMatchObject({
      index: SUSHI,
      itemId: 'i120001',
      amount: 10,
      cost: 5,
      limit: 20,
      purchased: 0,
      info: { stack: 20 },
    })
  })

  it('opens at level 10', async () => {
    await ninja.set({ level: 9 })
    expect(errorCode(await ninja.client.get(PATH))).toBe('too_low')
  })
})

describe('POST /api/game/festival-shop/buy', () => {
  it('buys an offer: the amount in the bag, bound, and the tokens charged', async () => {
    await giveTokens(12)
    const response = await buy(SUSHI)
    expect(response.statusCode).toBe(200)
    const { shop: view } = response.json<FestivalShopBuyResult>()
    expect(view.tokens).toBe(7)
    expect(view.offers[SUSHI]!.purchased).toBe(1)
    expect(await held('i120001')).toBe(10)
    expect((await ninja.bag('i120001')).every((row) => row.bound)).toBe(true)
    expect(await shop()).toMatchObject({ tokens: 7, purchases: { i120001: 1 } })
  })

  it('refuses without enough tokens', async () => {
    await giveTokens(4)
    expect(errorCode(await buy(SUSHI))).toBe('no_tokens')
    expect(errorCode(await ninja.client.post(`${PATH}/buy`, { index: 0 }))).toBe('no_tokens')
    expect(await held('i120001')).toBe(0)
  })

  it('stops at the purchase limit', async () => {
    await giveTokens(300)
    expect((await buy(VIP_3_DAY)).statusCode).toBe(200)
    expect(errorCode(await buy(VIP_3_DAY))).toBe('sold_out')
    expect((await shop()).tokens).toBe(200)
  })

  it('checks the bag before charging', async () => {
    await giveTokens(50)
    for (let i = 0; i < BAG_CELLS; i++) await ninja.give('i100004', { count: 100 })
    expect(errorCode(await buy(SUSHI))).toBe('bag_full')
    expect((await shop()).tokens).toBe(50)
  })

  it('refuses unknown offers and low levels', async () => {
    await giveTokens(50)
    expect(errorCode(await buy(SHOP.offers.length))).toBe('unknown_item')
    expect((await ninja.client.post(`${PATH}/buy`, { index: -1 })).statusCode).toBe(400)
    await ninja.set({ level: 9 })
    expect(errorCode(await buy(SUSHI))).toBe('too_low')
  })
})
