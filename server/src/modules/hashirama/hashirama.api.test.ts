// Hashirama vs Madara: admin start / end, access, sides, attacks with their cooldown, the count
// and payout, and the Fortune Wheel (selection, free / gold / bonus spins, token, bag room).
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FortuneWheelView, HashiramaView } from '../../../../shared/src/schemas/hashirama.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  characterBankai,
  characters,
  hashiramaEvents,
  hashiramaPlayers,
  inventoryItems,
  users,
} from '../../db/schema.js'
import { BAG_CELLS, itemCells } from '../../game/bag.js'
import { errorCode, setUpNinja } from '../gates/test-setup.js'
import { HASHIRAMA_PLACEHOLDERS as P } from './config.js'
import { spin } from './rules.js'

/** A geared ninja whose attacks land (an unarmed one barely scratches a leader). */
vi.mock('../../game/combat.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../game/combat.js')>()
  return {
    ...original,
    playerFighter: async (...args: Parameters<typeof original.playerFighter>) => ({
      ...(await original.playerFighter(...args)),
      minAttack: 5_000,
      maxAttack: 6_000,
      hit: 10_000,
    }),
  }
})
vi.mock('./rules.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./rules.js')>()
  return { ...original, spin: vi.fn(original.spin) }
})

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  vi.mocked(spin).mockReset()
  await truncateAll(db)
  await db.delete(hashiramaEvents)
  ninja = await setUpNinja(db)
  await ninja.ready(40)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const get = async <T>(path: string) => {
  const response = await ninja.client.get(`/api/game/hashirama${path}`)
  expect(response.statusCode).toBe(200)
  return response.json<T>()
}
const post = (path: string, body: object = {}) =>
  ninja.client.post(`/api/game/hashirama${path}`, body)
const makeAdmin = async () => {
  const [row] = await db.select().from(characters).where(eq(characters.id, ninja.characterId))
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, row!.userId))
}
const start = async () => {
  await makeAdmin()
  const response = await post('/admin/start')
  expect(response.statusCode).toBe(200)
}
const player = async () =>
  (
    await db
      .select()
      .from(hashiramaPlayers)
      .where(eq(hashiramaPlayers.characterId, ninja.characterId))
  )[0]!
const setPlayer = (values: Partial<typeof hashiramaPlayers.$inferInsert>) =>
  db.update(hashiramaPlayers).set(values).where(eq(hashiramaPlayers.characterId, ninja.characterId))
/** Ends the battle without settling it (as if 48 hours passed). */
const timeUp = () => db.update(hashiramaEvents).set({ endsAt: new Date(Date.now() - 1000) })

describe('access and admin', () => {
  it('stays closed and quiet until an admin starts a 48-hour battle', async () => {
    expect(await get('/access')).toEqual({ open: false, closesAt: null })
    expect((await get<HashiramaView>('/')).event).toBeNull()
    expect(errorCode(await post('/admin/start'))).toBe('forbidden')
    await start()
    const access = await get<{ open: boolean; closesAt: string }>('/access')
    expect(access.open).toBe(true)
    const hours = (Date.parse(access.closesAt) - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(71.9)
    expect(hours).toBeLessThanOrEqual(72)
    expect(errorCode(await post('/admin/start'))).toBe('already_open')
  })
  it('ends the battle early and counts it', async () => {
    await start()
    const response = await post('/admin/end')
    expect(response.json()).toMatchObject({ phase: 'finished', finished: true, winner: 'none' })
  })
})

describe('the battle', () => {
  it('chooses a side for good and attacks the other leader', async () => {
    await start()
    expect(errorCode(await post('/attack'))).toBe('no_side')
    const joined = await post('/join', { side: 'madara' })
    expect(joined.json().hashirama.me).toEqual({ side: 'madara', damage: 0, rank: null })
    expect(errorCode(await post('/join', { side: 'hashirama' }))).toBe('side_final')

    const response = await post('/attack')
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.damage).toBeGreaterThan(0)
    expect(body.look).toEqual({ clothing: P.leaders.hashirama.clothing })
    expect(body.hashirama.me).toEqual({ side: 'madara', damage: body.damage, rank: 1 })
    expect(body.hashirama.totals).toEqual({ madara: body.damage, hashirama: 0 })
    expect(body.hashirama.leaderboards.madara).toEqual([{ name: 'Ninja_01', damage: body.damage }])

    const cooldown = await post('/attack')
    expect(errorCode(cooldown)).toBe('cooldown')
    expect(Number(cooldown.json().error.fields.retryInMs)).toBeGreaterThan(0)
    await setPlayer({ lastAttackAt: new Date(Date.now() - P.attackCooldownSeconds * 1000) })
    expect((await post('/attack')).statusCode).toBe(200)
  })
  it('refuses attacks once the battle is over, then pays the winners in spins', async () => {
    await start()
    await post('/join', { side: 'hashirama' })
    await setPlayer({ damage: 500 })
    await timeUp()
    expect(errorCode(await post('/attack'))).toBe('not_running')
    const view = await get<HashiramaView>('/')
    const spins = P.rewards.winnerSpins + P.rewards.topSpins[0]
    expect(view.event).toMatchObject({ phase: 'finished', winner: 'hashirama' })
    expect(view.myPayout).toEqual({ spins })
    expect(view.freeSpins).toBe(spins)
    // Counted once.
    await get('/')
    expect((await player()).spins).toBe(spins)
  })
})

describe('the Fortune Wheel', () => {
  const pick = ['x-hp', 'x-mp', 'u-wing']
  const doSpin = (token: number, payWith?: 'gold') =>
    post('/wheel/spin', payWith ? { token, payWith } : { token })

  beforeEach(async () => {
    await start()
    await post('/join', { side: 'madara' })
  })

  it('saves three different rewards, one Unique at most', async () => {
    expect(
      errorCode(await post('/wheel/configure', { selection: ['u-wing', 'u-kyuubi', null] })),
    ).toBe('bad_selection')
    const response = await post('/wheel/configure', { selection: pick })
    expect(response.json().wheel.selection).toEqual(pick)
    expect((await get<FortuneWheelView>('/wheel')).selection).toEqual(pick)
    expect(response.json().wheel.segments[4].reward.itemId).toBe('i290049')
  })
  it('spends a free spin and delivers the unbound reward', async () => {
    await post('/wheel/configure', { selection: pick })
    expect(errorCode(await doSpin(0))).toBe('no_spins')
    await setPlayer({ spins: 2 })
    vi.mocked(spin).mockReturnValueOnce({
      winningIndex: 0,
      reward: P.wheel.pools[1]!.rewards[0]!,
    })
    const response = await doSpin(0)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      result: { token: 0, winningIndex: 0, bonus: false, reward: { id: 'x-hp' } },
      wheel: { freeSpins: 1, nextSpinToken: 1 },
    })
    const potions = await ninja.bag('i160010')
    expect(potions.reduce((sum, r) => sum + r.count, 0)).toBe(5)
    expect(potions.every((r) => !r.bound)).toBe(true)
    expect(errorCode(await doSpin(0))).toBe('STALE_TOKEN')
  })
  it('needs three rewards chosen', async () => {
    await setPlayer({ spins: 1 })
    expect(errorCode(await doSpin(0))).toBe('choose_three')
  })
  it('adds won spins and Bankai Coins', async () => {
    await post('/wheel/configure', { selection: pick })
    await setPlayer({ spins: 1 })
    vi.mocked(spin).mockReturnValueOnce({ winningIndex: 1, reward: P.wheel.mystery[1]! })
    expect((await doSpin(0)).json().wheel.freeSpins).toBe(1 - 1 + P.wheel.mystery[1]!.amount)
    vi.mocked(spin).mockReturnValueOnce({ winningIndex: 3, reward: P.wheel.mystery[2]! })
    await doSpin(1)
    const [bankai] = await db
      .select()
      .from(characterBankai)
      .where(eq(characterBankai.characterId, ninja.characterId))
    expect(bankai!.coins).toBe(P.wheel.mystery[2]!.amount)
  })
  it('spins for gold and earns a bonus spin every N paid spins', async () => {
    await post('/wheel/configure', { selection: pick })
    await ninja.set({ gold: P.wheel.goldSpinCost - 1 })
    expect(errorCode(await doSpin(0, 'gold'))).toBe('no_gold')
    await ninja.set({ gold: P.wheel.goldSpinCost * 2 })
    await setPlayer({ paidSpins: P.wheel.bonusEvery - 1 })
    vi.mocked(spin).mockReturnValue({ winningIndex: 3, reward: P.wheel.mystery[2]! })
    const paid = (await doSpin(0, 'gold')).json()
    expect(paid.wheel).toMatchObject({ bonusReady: true, paidSpins: 0 })
    expect(paid.character.gold).toBe(P.wheel.goldSpinCost)
    const bonus = (await doSpin(1)).json()
    expect(bonus.result.bonus).toBe(true)
    expect(bonus.wheel.bonusReady).toBe(false)
  })
  it('needs bag room for anything it could give', async () => {
    await post('/wheel/configure', { selection: pick })
    await setPlayer({ spins: 1 })
    const used = await db
      .select({ itemId: inventoryItems.itemId })
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.characterId, ninja.characterId), isNull(inventoryItems.equippedSlot)),
      )
    const free = BAG_CELLS - used.reduce((sum, r) => sum + itemCells(r.itemId), 0)
    await db.insert(inventoryItems).values(
      Array.from({ length: free }, () => ({
        characterId: ninja.characterId,
        itemId: 'i160001',
        count: 999,
      })),
    )
    expect(errorCode(await doSpin(0))).toBe('bag_full')
  })
})
