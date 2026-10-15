import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BAG_SLOTS } from '@pockie/shared'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { inventoryItems, tollGateRuns, type TollGateCard } from '../../db/schema.js'
import { errorCode, setUpNinja, today } from './test-setup.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>
const WEAPON = 'i260100'

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.give(WEAPON, { equippedSlot: 'Weapon' })
  await ninja.ready(20)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const enter = (gateId: number) => ninja.client.post('/api/game/gates/enter', { gateId })
const fight = () => ninja.client.post('/api/game/gates/run/fight')
const run = async () =>
  (await db.select().from(tollGateRuns).where(eq(tollGateRuns.characterId, ninja.characterId)))[0]

const cards = (itemId = 'i150168'): TollGateCard[] =>
  Array.from({ length: 5 }, () => ({ itemId, count: 1, bound: true, revealed: false }))
async function clearedRun(gateId = 100001) {
  await db.insert(tollGateRuns).values({
    characterId: ninja.characterId,
    gateId,
    subGate: 2,
    point: 0,
    passedPoint: 9,
    cardState: 1,
    cards: cards(),
  })
}

describe('GET /api/game/gates', () => {
  it('shows the guard menu: tries left, the 21 gates and the exchanges', async () => {
    const response = await ninja.client.get('/api/game/gates')
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({ triesLeft: 3, maxTries: 3, run: null })
    expect(body.gates).toHaveLength(21)
    expect(body.gates[1]).toMatchObject({
      id: 100001,
      nameKey: 'lg_TollGate_100001',
      tier: 'hard',
      minLevel: 16,
      subGates: 2,
      itemId: null,
    })
    expect(body.exchanges[0]).toMatchObject({
      srcItemId: 'i152010',
      commonItemId: 'i152015',
      tier: 56,
    })
    expect(body.exchanges.at(-1)).toMatchObject({ srcItemId: 'i152013', tier: 86 })
    expect(body.crystals).toMatchObject({ i152010: 0, i152015: 0 })
  })

  it('requires a login', async () => {
    await ninja.client.post('/api/auth/logout')
    expect((await ninja.client.get('/api/game/gates')).statusCode).toBe(401)
  })
})

describe('POST /api/game/gates/enter', () => {
  it('starts a run and spends a try', async () => {
    const response = await enter(100001)
    expect(response.statusCode).toBe(200)
    expect(response.json().run).toMatchObject({
      gateId: 100001,
      subGate: 0,
      point: 0,
      points: [5, 5],
      cleared: false,
      cards: null,
    })
    expect(response.json().run.nextNpcIds).toEqual(['n301111', 'n301112', 'n301113'])
    expect(await ninja.row()).toMatchObject({ tollGateEntries: 1, tollGateDay: today() })
    expect(errorCode(await enter(100001))).toBe('run_active')
  })

  it.each([
    ['not in Demon City', async () => ninja.set({ sceneId: 2601 }), 100001, 'not_here'],
    ['below the gate level', async () => ninja.set({ level: 15 }), 100001, 'too_low'],
    ['without a weapon', async () => db.delete(inventoryItems), 100001, 'no_weapon'],
    ['with 90% HP or less', async () => ninja.set({ hp: 1 }), 100001, 'low_hp'],
    ['without the Abyss Pass', async () => ninja.ready(60), 100035, 'missing_item'],
  ])('refuses entry %s', async (_case, arrange, gateId, code) => {
    await arrange()
    const response = await enter(gateId)
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe(code)
    expect(await run()).toBeUndefined()
    expect((await ninja.row()).tollGateEntries).toBe(0)
  })

  it('refuses an unknown gate', async () => {
    expect((await enter(123)).statusCode).toBe(404)
  })

  it('allows three tries per UTC day and resets on a new day', async () => {
    await ninja.set({ tollGateDay: today(), tollGateEntries: 3 })
    expect(errorCode(await enter(100001))).toBe('no_tries')
    expect((await ninja.client.get('/api/game/gates')).json().triesLeft).toBe(0)
    await ninja.set({ tollGateDay: '2020-01-01' })
    expect((await enter(100001)).statusCode).toBe(200)
    expect((await ninja.row()).tollGateEntries).toBe(1)
  })

  it('uses up the entry item', async () => {
    await ninja.ready(60)
    await ninja.give('i152000')
    expect((await enter(100035)).statusCode).toBe(200)
    expect(await ninja.bag('i152000')).toHaveLength(0)
  })
})

describe('POST /api/game/gates/run/fight', () => {
  it('a loss leaves 1 HP and ends the run; the try stays spent', async () => {
    await ninja.ready(11)
    await enter(100000)
    await ninja.set({ hp: 1 })
    const response = await fight()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ won: false, run: null })
    expect(await run()).toBeUndefined()
    expect(await ninja.row()).toMatchObject({ hp: 1, tollGateEntries: 1 })
    expect(errorCode(await fight())).toBe('no_run')
  })

  it('refuses without a run', async () => {
    expect(errorCode(await fight())).toBe('no_run')
  })
})

describe('card flip', () => {
  it('show all, shuffle and a peek after the shuffle cost 10 and 35 Gold (100001)', async () => {
    await clearedRun()
    await ninja.set({ gold: 100 })
    expect((await ninja.client.post('/api/game/gates/cards/show-all', {})).statusCode).toBe(200)
    const shuffled = await ninja.client.post('/api/game/gates/cards/shuffle')
    expect(shuffled.json().run.cards).toMatchObject({ state: 3, peekCost: 35 })
    const peeked = await ninja.client.post('/api/game/gates/cards/peek', { index: 2 })
    expect(peeked.statusCode).toBe(200)
    expect(peeked.json().run.cards.cards[2]).toEqual({ itemId: 'i150168', count: 1, bound: true })
    expect(peeked.json().character.gold).toBe(55)
  })

  it('pays with Gift Coupons and refuses without enough', async () => {
    await clearedRun()
    await ninja.set({ giftCoupon: 5 })
    const response = await ninja.client.post('/api/game/gates/cards/redeal', {
      currency: 'giftCoupon',
    })
    expect(response.statusCode).toBe(200)
    expect((await ninja.row()).giftCoupon).toBe(0)
    const peek = await ninja.client.post('/api/game/gates/cards/peek', { index: 0 })
    expect(errorCode(peek)).toBe('no_gold')
  })

  it('take grants the card and ends the run', async () => {
    await clearedRun()
    const response = await ninja.client.post('/api/game/gates/cards/take', { index: 1 })
    expect(response.statusCode).toBe(200)
    expect(response.json().card).toEqual({ itemId: 'i150168', count: 1, bound: true })
    expect(response.json().cards).toHaveLength(5)
    expect(await ninja.bag('i150168')).toHaveLength(1)
    expect(await run()).toBeUndefined()
  })

  it('a full bag refuses the take and keeps the cards', async () => {
    await clearedRun()
    await db.insert(inventoryItems).values(
      Array.from({ length: BAG_SLOTS }, () => ({
        characterId: ninja.characterId,
        itemId: WEAPON,
      })),
    )
    const response = await ninja.client.post('/api/game/gates/cards/take', { index: 0 })
    expect(errorCode(response)).toBe('bag_full')
    expect((await run())?.cardState).toBe(1)
    expect(await ninja.bag('i150168')).toHaveLength(0)
  })

  it('two takes at once grant one card', async () => {
    await clearedRun()
    const responses = await Promise.all([
      ninja.client.post('/api/game/gates/cards/take', { index: 0 }),
      ninja.client.post('/api/game/gates/cards/take', { index: 1 }),
    ])
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect(responses.map(errorCode)).toContain('no_run')
    const granted = await ninja.bag('i150168')
    expect(granted.reduce((sum, r) => sum + r.count, 0)).toBe(1)
  })

  it('leaving with cards on the table grants a random one', async () => {
    await clearedRun()
    const response = await ninja.client.post('/api/game/gates/run/exit')
    expect(response.json().card).toEqual({ itemId: 'i150168', count: 1, bound: true })
    expect(await run()).toBeUndefined()
  })
})

describe('POST /api/game/gates/exchange', () => {
  it('converts 50 crystals, filling up with common crystals', async () => {
    await ninja.set({ level: 56 })
    await db.insert(inventoryItems).values([
      ...Array.from({ length: 30 }, () => ({
        characterId: ninja.characterId,
        itemId: 'i152010',
      })),
      ...Array.from({ length: 25 }, () => ({
        characterId: ninja.characterId,
        itemId: 'i152015',
      })),
    ])
    const response = await ninja.client.post('/api/game/gates/exchange', { exchangeId: 1 })
    expect(response.statusCode).toBe(200)
    expect(await ninja.bag('i491001')).toHaveLength(1)
    expect(await ninja.bag('i152010')).toHaveLength(0)
    const common = await ninja.bag('i152015')
    expect(common.reduce((sum, r) => sum + r.count, 0)).toBe(5)
  })

  it('shows the crystals held', async () => {
    await ninja.give('i152015', { count: 7 })
    const body = (await ninja.client.get('/api/game/gates')).json()
    expect(body.crystals).toMatchObject({ i152015: 7, i152011: 0 })
  })

  it('refuses without enough crystals', async () => {
    await ninja.set({ level: 56 })
    const response = await ninja.client.post('/api/game/gates/exchange', { exchangeId: 1 })
    expect(errorCode(response)).toBe('missing_item')
  })

  it('refuses a row below its tier level, keeping the crystals', async () => {
    await ninja.give('i152015', { count: 50 })
    const response = await ninja.client.post('/api/game/gates/exchange', { exchangeId: 1 })
    expect(errorCode(response)).toBe('too_low')
    expect((await ninja.bag('i152015'))[0]!.count).toBe(50)
  })
})
