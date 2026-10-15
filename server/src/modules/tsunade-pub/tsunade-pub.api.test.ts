// Tsunade Pub API: the first look, free / bought spins, the bonus counters, collecting and selling.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  PubActionResult,
  PubPrize,
  PubSpinResult,
  TsunadePubView,
} from '../../../../shared/src/schemas/tsunade-pub.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { tsunadePub } from '../../db/schema.js'
import { BAG_CELLS } from '../../game/bag.js'
import { errorCode, setUpNinja, today } from '../gates/test-setup.js'
import { valhallaPool } from './rules.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.ready(30)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const PATH = '/api/game/tsunade-pub'
const view = async () => {
  const response = await ninja.client.get(PATH)
  expect(response.statusCode).toBe(200)
  return response.json<TsunadePubView>()
}
const spin = () => ninja.client.post(`${PATH}/spin`)
const row = async () =>
  (await db.select().from(tsunadePub).where(eq(tsunadePub.characterId, ninja.characterId)))[0]!
const setRow = (values: Partial<typeof tsunadePub.$inferInsert>) =>
  db.update(tsunadePub).set(values).where(eq(tsunadePub.characterId, ninja.characterId))
const potion: PubPrize = { itemId: 'i160010', amount: 5, rarity: 'common', bound: false }
const stoneBag: PubPrize = { itemId: 'i150110', amount: 1, rarity: 'common', bound: true }

describe('GET /api/game/tsunade-pub', () => {
  it('rolls a 16-slot wheel and shows 5 free spins and the counters', async () => {
    const data = await view()
    expect(data.board).toHaveLength(16)
    expect(data.board[0]!.info).toMatchObject({ w: 1 })
    expect(data).toMatchObject({
      won: [],
      freeAttempts: 5,
      rewardAttempts: 0,
      paidAttempts: 0,
      rollsUntilBonus: 5,
      rollsUntilGuaranteed: 100,
    })
    expect(data.resetAt).toBe(
      new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString(),
    )
    // The same wheel on the next look.
    expect((await view()).board).toEqual(data.board)
  })
})

describe('POST /api/game/tsunade-pub/spin', () => {
  it('uses a free spin, lands the prize on the wheel and adds it to the unclaimed list', async () => {
    const before = await view()
    const response = await spin()
    expect(response.statusCode).toBe(200)
    const result = response.json<PubSpinResult>()
    expect(result.currentBoard[result.winningIndex]).toMatchObject({
      itemId: result.prize.itemId,
      rarity: result.prize.rarity,
    })
    result.currentBoard.forEach(
      (slot, i) => i !== result.winningIndex && expect(slot).toEqual(before.board[i]),
    )
    expect(result.pub.won[0]).toEqual(result.prize)
    expect(result.pub.won).toHaveLength(result.extra ? 2 : 1)
    expect(result.pub).toMatchObject({
      freeAttempts: 4,
      rollsUntilBonus: 4,
      rollsUntilGuaranteed: 99,
    })
    expect(result.pub.board).not.toEqual(before.board)
    expect(await row()).toMatchObject({ freeDay: today(), freeUsed: 1, spins: 1 })
  })

  it('gives the 100th spin a legendary', async () => {
    await view()
    await setRow({ spins: 99 })
    const result = (await spin()).json<PubSpinResult>()
    expect(result.prize.rarity).toBe('legendary')
    expect(result.pub.rollsUntilGuaranteed).toBe(100)
  })

  it('spends reward spins, then bought spins, after the free ones', async () => {
    await view()
    await setRow({ freeDay: today(), freeUsed: 5, rewardAttempts: 1, paidAttempts: 1 })
    expect((await spin()).json<PubSpinResult>().pub).toMatchObject({
      rewardAttempts: 0,
      paidAttempts: 1,
    })
    expect((await spin()).json<PubSpinResult>().pub.paidAttempts).toBe(0)
    const none = await spin()
    expect(none.statusCode).toBe(400)
    expect(errorCode(none)).toBe('no_spins')
  })

  it('gives the free spins back on a new UTC day', async () => {
    await view()
    await setRow({ freeDay: '2020-01-01', freeUsed: 5 })
    expect((await view()).freeAttempts).toBe(5)
  })

  it('refuses a spin when the unclaimed list is full', async () => {
    await view()
    await setRow({ won: Array.from({ length: 399 }, () => stoneBag) })
    const response = await spin()
    expect(errorCode(response)).toBe('prizes_full')
    expect((await row()).freeUsed).toBe(0)
  })
})

describe('POST /api/game/tsunade-pub/buy', () => {
  it('buys one spin for 10 Gold', async () => {
    await ninja.set({ gold: 25 })
    const result = (await ninja.client.post(`${PATH}/buy`)).json<PubActionResult>()
    expect(result.pub.paidAttempts).toBe(1)
    expect(result.character.gold).toBe(15)
    expect((await ninja.row()).gold).toBe(15)
  })

  it('refuses without 10 Gold', async () => {
    await ninja.set({ gold: 9 })
    const response = await ninja.client.post(`${PATH}/buy`)
    expect(errorCode(response)).toBe('no_gold')
    expect((await ninja.row()).gold).toBe(9)
  })
})

describe('POST /api/game/tsunade-pub/collect', () => {
  it('moves one prize into the bag with its bound state', async () => {
    await view()
    await setRow({ won: [stoneBag, potion] })
    const response = await ninja.client.post(`${PATH}/collect`, { index: 1 })
    expect(response.statusCode).toBe(200)
    const result = response.json<PubActionResult>()
    expect(result.collected).toBe(1)
    expect(result.pub.won.map((p) => p.itemId)).toEqual(['i150110'])
    const potions = await ninja.bag('i160010')
    expect(potions.reduce((sum, r) => sum + r.count, 0)).toBe(5)
    expect(potions.every((r) => !r.bound)).toBe(true)
  })

  it('collects everything with no index and rolls Valhalla gear lines', async () => {
    await view()
    const gearId = valhallaPool(30)[0]!
    await setRow({
      won: [stoneBag, { itemId: gearId, amount: 1, rarity: 'epic', bound: true, valhalla: true }],
    })
    const result = (await ninja.client.post(`${PATH}/collect`, {})).json<PubActionResult>()
    expect(result).toMatchObject({ collected: 2, pub: { won: [] } })
    expect(await ninja.bag('i150110')).toHaveLength(1)
    const [gear] = await ninja.bag(gearId)
    expect(gear).toMatchObject({ identifyCount: 4, canIdentify: true })
    expect(gear!.props.length).toBeGreaterThan(0)
  })

  it('keeps the prizes when the bag is full', async () => {
    await view()
    await setRow({ won: [stoneBag] })
    for (let i = 0; i < BAG_CELLS; i++) await ninja.give('i100004', { count: 100 })
    const response = await ninja.client.post(`${PATH}/collect`, {})
    expect(errorCode(response)).toBe('bag_full')
    expect((await row()).won).toHaveLength(1)
  })

  it('refuses an index past the list', async () => {
    await view()
    const response = await ninja.client.post(`${PATH}/collect`, { index: 0 })
    expect(errorCode(response)).toBe('no_prize')
  })
})

describe('POST /api/game/tsunade-pub/sell', () => {
  it('sells the chosen prizes for Stone', async () => {
    await view()
    await ninja.set({ stone: 1000 })
    await setRow({ won: [stoneBag, potion, stoneBag] })
    const result = (
      await ninja.client.post(`${PATH}/sell`, { indexes: [0, 1] })
    ).json<PubActionResult>()
    // A Level 3 Stone Bag has no shop price (100, the common value); potions 29 Stone each.
    expect(result.earned).toBe(100 + 29 * 5)
    expect(result.character.stone).toBe(1000 + 245)
    expect(result.pub.won).toHaveLength(1)
  })

  it('refuses an index past the list and sells nothing', async () => {
    await view()
    await ninja.set({ stone: 0 })
    await setRow({ won: [stoneBag] })
    const response = await ninja.client.post(`${PATH}/sell`, { indexes: [0, 3] })
    expect(errorCode(response)).toBe('no_prize')
    expect((await ninja.row()).stone).toBe(0)
  })
})
