// Konoha Boutique: the view, spins (bet limits, coins, EXP), free coins, buying coins, Exchange
// Rewards into the bag (bag checked before charging), the Bonus Round and Double Chance.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  BoutiqueActionResult,
  BoutiqueChestResult,
  BoutiqueGuessResult,
  BoutiqueSpinResult,
  BoutiqueView,
} from '../../../../shared/src/schemas/konoha-boutique.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { inventoryItems, konohaBoutique } from '../../db/schema.js'
import { BAG_CELLS } from '../../game/bag.js'
import { errorCode, setUpNinja } from '../gates/test-setup.js'
import { BOUTIQUE_PLACEHOLDERS as P } from './config.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const PATH = '/api/game/konoha-boutique'
const post = (path: string, body: object = {}) => ninja.client.post(`${PATH}/${path}`, body)
const ok = async <T>(response: Awaited<ReturnType<typeof post>>) => {
  expect(response.statusCode, response.body).toBe(200)
  return response.json<T>()
}
const row = async () =>
  (
    await db.select().from(konohaBoutique).where(eq(konohaBoutique.characterId, ninja.characterId))
  )[0]
const setRow = (values: Partial<typeof konohaBoutique.$inferInsert>) =>
  db
    .insert(konohaBoutique)
    .values({ characterId: ninja.characterId, ...values })
    .onConflictDoUpdate({ target: konohaBoutique.characterId, set: values })

describe('GET /api/game/konoha-boutique', () => {
  it('starts at level 1 with no coins, the level table, rewards and buy tiers', async () => {
    const view = await ok<BoutiqueView>(await ninja.client.get(PATH))
    expect(view).toMatchObject({ coins: 0, level: 1, bonusChance: 0, doubleChance: 0 })
    expect(view.levels[1]).toEqual([0, 1, 5])
    expect(view.rewards).toHaveLength(P.rewards.length)
    expect(view.rewards[0]!.info).toBeTruthy()
    expect(view.buyTiers.gold[0]).toEqual([10, 1_000])
  })
})

describe('POST /spin', () => {
  it('charges multiplier x lines, adds the win and EXP', async () => {
    await setRow({ coins: 100 })
    const result = await ok<BoutiqueSpinResult>(await post('spin', { multiplier: 1, lines: 5 }))
    expect(result.pieces).toHaveLength(15)
    const after = (await row())!
    expect(after.exp).toBe(5)
    expect(after.lastWon).toBe(result.coinsGained)
    // The win lands in the balance unless it went to a Double Chance.
    expect(after.coins + after.doubleCoins).toBe(95 + result.coinsGained)
    expect(result.boutique.coins).toBe(after.coins)
  })

  it('refuses a bet over the level, without coins, or while a bonus waits', async () => {
    await setRow({ coins: 1_000 })
    expect(errorCode(await post('spin', { multiplier: 2, lines: 5 }))).toBe('bet_too_high')
    expect(errorCode(await post('spin', { multiplier: 1, lines: 6 }))).toBe('bet_too_high')
    await setRow({ coins: 4 })
    expect(errorCode(await post('spin', { multiplier: 1, lines: 5 }))).toBe('not_enough_coins')
    await setRow({ coins: 1_000, bonusBet: 5 })
    expect(errorCode(await post('spin', { multiplier: 1, lines: 5 }))).toBe('bonus_pending')
    await setRow({ bonusBet: 0, doubleCoins: 20, doubleNumber: 5 })
    expect(errorCode(await post('spin', { multiplier: 1, lines: 5 }))).toBe('double_pending')
    expect((await row())!.coins).toBe(1_000)
  })

  it('allows a higher bet at a higher level', async () => {
    await setRow({ coins: 1_000, exp: 1_000_000 })
    await ok(await post('spin', { multiplier: 10, lines: 25 }))
  })

  it('rejects a malformed bet', async () => {
    expect((await post('spin', { multiplier: 0, lines: 5 })).statusCode).toBe(400)
    expect((await post('spin', { multiplier: 1, lines: 26 })).statusCode).toBe(400)
  })
})

describe('POST /free-coins', () => {
  it('gives 500 coins, then waits 5 minutes, up to 5 a day', async () => {
    const result = await ok<{ boutique: BoutiqueView }>(await post('free-coins'))
    expect(result.boutique).toMatchObject({ coins: 500, freeCoinsClaimed: 1 })
    expect(errorCode(await post('free-coins'))).toBe('free_wait')
    await setRow({ nextFreeAt: new Date(Date.now() - 1000) })
    await ok(await post('free-coins'))
    await setRow({ nextFreeAt: null, freeClaimed: 5 })
    expect(errorCode(await post('free-coins'))).toBe('free_limit')
    expect((await row())!.coins).toBe(1_000)
  })

  it('starts a new day with no claims', async () => {
    await setRow({ freeDay: '2000-01-01', freeClaimed: 5 })
    const result = await ok<{ boutique: BoutiqueView }>(await post('free-coins'))
    expect(result.boutique.freeCoinsClaimed).toBe(1)
  })
})

describe('POST /buy-coins', () => {
  it('charges the currency at the server price and adds the coins', async () => {
    await ninja.set({ gold: 15, giftCoupon: 100 })
    const result = await ok<BoutiqueActionResult>(
      await post('buy-coins', { currency: 'gold', tier: 0 }),
    )
    expect(result.boutique.coins).toBe(1_000)
    expect(result.character.gold).toBe(5)
    expect(errorCode(await post('buy-coins', { currency: 'gold', tier: 0 }))).toBe('not_enough')
    expect(errorCode(await post('buy-coins', { currency: 'gold', tier: 9 }))).toBe('no_tier')
    await ok(await post('buy-coins', { currency: 'giftCoupon', tier: 0 }))
    expect((await ninja.row()).giftCoupon).toBe(0)
    expect((await row())!.coins).toBe(2_000)
  })
})

describe('POST /exchange', () => {
  const reward = P.rewards.find((entry) => entry.id === 'outfit-10')!

  it('puts the item in the bag and spends the coins', async () => {
    await setRow({ coins: reward.price + 1 })
    const result = await ok<BoutiqueActionResult>(await post('exchange', { rewardId: reward.id }))
    expect(result.boutique.coins).toBe(1)
    expect(await ninja.bag(reward.itemId)).toHaveLength(1)
  })

  it('refuses without coins, an unknown reward, or a full bag (charging nothing)', async () => {
    await setRow({ coins: reward.price - 1 })
    expect(errorCode(await post('exchange', { rewardId: reward.id }))).toBe('not_enough_coins')
    expect(errorCode(await post('exchange', { rewardId: 'nope' }))).toBe('no_reward')
    await setRow({ coins: reward.price })
    await db.insert(inventoryItems).values(
      Array.from({ length: BAG_CELLS }, () => ({
        characterId: ninja.characterId,
        itemId: 'i100004',
      })),
    )
    expect(errorCode(await post('exchange', { rewardId: reward.id }))).toBe('bag_full')
    expect((await row())!.coins).toBe(reward.price)
    expect(await ninja.bag(reward.itemId)).toHaveLength(0)
  })
})

describe('Bonus Round', () => {
  it('opens three different chests worth the bet times a multiplier, then ends', async () => {
    await setRow({ coins: 0, bonusBet: 10 })
    let total = 0
    for (const index of [0, 1]) {
      const result = await ok<BoutiqueChestResult>(await post('chest', { index }))
      expect(P.chestMultipliers.map((m) => m * 10)).toContain(result.coinsWon)
      expect(result.boutique.bonusChance).toBe(1)
      total += result.coinsWon
    }
    expect(errorCode(await post('chest', { index: 1 }))).toBe('chest_open')
    const last = await ok<BoutiqueChestResult>(await post('chest', { index: 5 }))
    total += last.coinsWon
    expect(last.boutique).toMatchObject({ bonusChance: 0, coins: total, bonusPicks: [] })
    expect(errorCode(await post('chest', { index: 2 }))).toBe('no_bonus')
  })

  it('ends at once with -1', async () => {
    await setRow({ bonusBet: 10 })
    const result = await ok<BoutiqueChestResult>(await post('chest', { index: -1 }))
    expect(result.boutique.bonusChance).toBe(0)
  })
})

describe('Double Chance', () => {
  it('doubles the coins at stake on a right guess and loses them on a wrong one', async () => {
    await setRow({ coins: 0, doubleCoins: 50, doubleNumber: 5, doubleOperator: 'higher' })
    const result = await ok<BoutiqueGuessResult>(await post('double', { index: 2 }))
    expect(result.boxes).toHaveLength(6)
    expect(result.picked).toBe(result.boxes[2])
    expect(result.won).toBe(result.picked > 5)
    expect(result.boutique).toMatchObject({ coins: result.won ? 100 : 0, doubleChance: 0 })
    expect(errorCode(await post('double', { index: 0 }))).toBe('no_double')
  })

  it('claims the coins at stake without guessing', async () => {
    await setRow({ coins: 10, doubleCoins: 50, doubleNumber: 5 })
    const result = await ok<{ boutique: BoutiqueView }>(await post('double/claim'))
    expect(result.boutique).toMatchObject({ coins: 60, doubleChance: 0 })
    expect(errorCode(await post('double/claim'))).toBe('no_double')
  })
})
