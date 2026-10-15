// Shichibukai: the view, starting an expedition, rolls and Buy Dice, card sets, the boss with its
// rewards and stars, the next floor, buying a roll, quitting and the exchange.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ShichibukaiActionResult,
  ShichibukaiBossResult,
  ShichibukaiRollResult,
  ShichibukaiView,
} from '../../../../shared/src/schemas/shichibukai.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { shichibukaiPlayers } from '../../db/schema.js'
import { errorCode, setUpNinja, today } from '../gates/test-setup.js'
import { boardOf, rollsFor } from './board.js'
import { SHICHIBUKAI_PLACEHOLDERS as P } from './config.js'
import { runSchema, type Run } from './rules.js'

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
  await ninja.ready(30)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const PATH = '/api/game/shichibukai'
const view = async () => {
  const response = await ninja.client.get(PATH)
  expect(response.statusCode).toBe(200)
  return response.json<ShichibukaiView>()
}
const post = (path: string, body: object = {}) => ninja.client.post(`${PATH}${path}`, body)
const ok = async <T>(path: string, body: object = {}) => {
  const response = await post(path, body)
  expect(response.statusCode, response.body).toBe(200)
  return response.json<T>()
}
const row = async () =>
  (
    await db
      .select()
      .from(shichibukaiPlayers)
      .where(eq(shichibukaiPlayers.characterId, ninja.characterId))
  )[0]!
const storedRun = async () => runSchema.parse((await row()).run)
const setRun = async (values: Partial<Run>) =>
  db
    .update(shichibukaiPlayers)
    .set({ run: { ...(await storedRun()), ...values } })
    .where(eq(shichibukaiPlayers.characterId, ninja.characterId))
const start = (floor = 1, difficulty = 1) =>
  ok<ShichibukaiActionResult>('/start', { floor, difficulty })

describe('GET /api/game/shichibukai', () => {
  it('opens at level 30 with today’s attempts and no run', async () => {
    await ninja.set({ level: 29 })
    expect((await ninja.client.get(PATH)).statusCode).toBe(403)
    await ninja.set({ level: 30 })
    const data = await view()
    expect(data).toMatchObject({ attempts: P.attemptsPerDay, points: 0, stars: {}, run: null })
    expect(data.floorBosses).toHaveLength(9)
    expect(data.exchange).toHaveLength(P.exchange.length)
  })
})

describe('expedition', () => {
  it('starts on an open floor for an attempt, one run at a time', async () => {
    expect(errorCode(await post('/start', { floor: 2, difficulty: 1 }))).toBe('locked')
    expect(errorCode(await post('/start', { floor: 1, difficulty: 2 }))).toBe('locked')
    const started = await start()
    expect(started.shichibukai.attempts).toBe(P.attemptsPerDay - 1)
    expect(started.shichibukai.run).toMatchObject({
      floor: 1,
      difficulty: 1,
      pos: 0,
      rollsLeft: rollsFor(1),
      hpPct: 100,
    })
    expect(started.shichibukai.run!.board.cells).toHaveLength(boardOf(1).tags.length)
    expect(errorCode(await post('/start', { floor: 1, difficulty: 1 }))).toBe('run_active')
  })

  it('runs out of attempts for the day', async () => {
    await db.insert(shichibukaiPlayers).values({
      characterId: ninja.characterId,
      attemptDay: today(),
      attemptsUsed: P.attemptsPerDay,
    })
    expect(errorCode(await post('/start', { floor: 1, difficulty: 1 }))).toBe('no_attempts')
  })

  it('a roll walks 1-6 tiles and spends a roll; Buy Dice picks the face for Gold', async () => {
    await start()
    await setRun({ events: (await storedRun()).events.map(() => 0) })
    const rolled = await ok<ShichibukaiRollResult>('/roll')
    expect(rolled.dice).toBeGreaterThanOrEqual(1)
    expect(rolled.dice).toBeLessThanOrEqual(6)
    expect(rolled.path).toHaveLength(rolled.dice + 1)
    expect(rolled.shichibukai.run).toMatchObject({
      pos: rolled.path.at(-1),
      rollsLeft: rollsFor(1) - 1,
      throws: 1,
    })
    await ninja.set({ gold: 15 })
    const chosen = await ok<ShichibukaiRollResult>('/roll', { face: 6 })
    expect(chosen.dice).toBe(6)
    expect(chosen.path).toHaveLength(7)
    expect((await ninja.row()).gold).toBe(5)
    expect(errorCode(await post('/roll', { face: 6 }))).toBe('not_enough')
  })

  it('out of rolls, one more roll is bought; give up ends the run', async () => {
    await start()
    await setRun({ rollsLeft: 0 })
    expect(errorCode(await post('/roll'))).toBe('no_rolls')
    await ninja.set({ stone: 300_000 })
    const bought = await ok<ShichibukaiActionResult>('/buy-roll', { currency: 'stones' })
    expect(bought.shichibukai.run!.rollsLeft).toBe(1)
    expect((await ninja.row()).stone).toBe(0)
    expect(errorCode(await post('/buy-roll', { currency: 'gold' }))).toBe('has_rolls')
    expect((await ok<ShichibukaiActionResult>('/quit')).shichibukai.run).toBeNull()
  })
})

describe('cards', () => {
  it('peeks for Stone, flips one and claims its item into the bag', async () => {
    await start()
    const items = ['i160010', 'i160020', 'i150110', 'i150172', 'i100004']
    await setRun({ card: { reason: 'chest', items, peeked: [], flipped: null } })
    expect(errorCode(await post('/roll'))).toBe('card')
    await ninja.set({ stone: 50_000 })
    const peeked = await ok<ShichibukaiActionResult>('/card/peek', { index: 2 })
    expect(peeked.shichibukai.run!.card).toMatchObject({
      peeked: { 2: 'i150110' },
      items: null,
      peekCost: 100_000,
    })
    expect(errorCode(await post('/card/peek', { index: 3 }))).toBe('not_enough')
    const flipped = await ok<ShichibukaiActionResult>('/card/flip', { index: 4 })
    expect(flipped.shichibukai.run!.card).toMatchObject({ flipped: 4, items })
    const claimed = await ok<ShichibukaiActionResult>('/card/claim')
    expect(claimed.item?.itemId).toBe('i100004')
    expect(claimed.shichibukai.run!.card).toBeNull()
    expect(await ninja.bag('i100004')).toHaveLength(1)
  })
})

describe('boss', () => {
  it('a victory pays EXP and points, records the stars and opens the next floor', async () => {
    await start()
    await setRun({ pos: boardOf(1).bossIndex, atBoss: true, throws: 9 })
    expect(errorCode(await post('/roll'))).toBe('at_boss')
    const before = await ninja.row()
    const won = await ok<ShichibukaiBossResult>('/boss', { power: 100 })
    expect(won.victory).toBe(true)
    expect(won.rewards).toMatchObject({ stars: 3, throws: 9 })
    expect(won.shichibukai.stars).toEqual({ '1-1': 3 })
    expect(won.shichibukai.points).toBe(won.rewards!.points)
    expect(won.shichibukai.run).toMatchObject({ cleared: true, bossesKilled: 1 })
    const after = await ninja.row()
    expect(after.level > before.level || after.exp > before.exp).toBe(true)
    const next = await ok<ShichibukaiActionResult>('/next-floor')
    expect(next.shichibukai.run).toMatchObject({
      floor: 2,
      pos: 0,
      cleared: false,
      bossesKilled: 1,
    })
  })

  it('a weaker fight never lowers the best stars; Collect ends the run', async () => {
    await start()
    await db
      .update(shichibukaiPlayers)
      .set({ stars: { '1-1': 5 } })
      .where(eq(shichibukaiPlayers.characterId, ninja.characterId))
    await setRun({ pos: boardOf(1).bossIndex, atBoss: true })
    const won = await ok<ShichibukaiBossResult>('/boss', { power: 50 })
    expect(won.rewards!.stars).toBe(1)
    expect(won.shichibukai.stars['1-1']).toBe(5)
    expect((await ok<ShichibukaiActionResult>('/quit')).shichibukai.run).toBeNull()
  })

  it('a defeat ends the expedition', async () => {
    power.strong = false
    await start()
    await setRun({ pos: boardOf(1).bossIndex, atBoss: true })
    const lost = await ok<ShichibukaiBossResult>('/boss', { power: 150 })
    expect(lost).toMatchObject({ victory: false, rewards: null })
    expect(lost.shichibukai.run).toBeNull()
    expect(lost.shichibukai.stars).toEqual({})
  })
})

describe('exchange', () => {
  it('trades points for an item', async () => {
    const entry = P.exchange[0]
    await db
      .insert(shichibukaiPlayers)
      .values({ characterId: ninja.characterId, points: entry.points })
    const traded = await ok<ShichibukaiActionResult>('/exchange', { id: 0 })
    expect(traded.shichibukai.points).toBe(0)
    expect(await ninja.bag(entry.itemId)).toHaveLength(1)
    expect(errorCode(await post('/exchange', { id: 0 }))).toBe('not_enough')
    expect(errorCode(await post('/exchange', { id: 999 }))).toBe('unknown')
  })
})
