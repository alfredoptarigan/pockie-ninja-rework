// Weekly Rewards activity hooks (M5 decision 24): each successful action counts once for its
// activity, inside the action's transaction.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { characterWeeklyRewards } from '../../db/schema.js'
import { setUpNinja } from '../gates/test-setup.js'

// Every fight is won.
vi.mock('@pockie/game-core', async (original) => ({
  ...(await original<typeof import('@pockie/game-core')>()),
  simulateFight: (input: { attackers: { hp: number; mp: number }[]; seed: number }) => ({
    seed: input.seed,
    fighters: input.attackers.map((a, index) => ({
      index,
      side: 'attackers',
      hp: a.hp,
      mp: a.mp,
    })),
    events: [],
    winner: 'attackers',
  }),
}))

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const counters = async () =>
  (
    await db
      .select()
      .from(characterWeeklyRewards)
      .where(eq(characterWeeklyRewards.characterId, ninja.characterId))
  )[0]?.counters ?? {}

describe('weekly activity hooks', () => {
  it('an arena fight counts as an arena duel', async () => {
    await ninja.ready(60)
    await ninja.client.get('/api/game/arena')
    expect((await ninja.client.post('/api/game/arena/fight', { slot: 0 })).statusCode).toBe(200)
    expect(await counters()).toEqual({ arenaDuel: 1 })
  })

  it('a cleared Las Noches floor', async () => {
    await ninja.ready(60)
    await ninja.set({ stone: 10_000, gold: 100 })
    await ninja.client.post('/api/game/gates/las-noches/start', { mode: 'first' })
    expect((await ninja.client.post('/api/game/gates/las-noches/fight')).json().won).toBe(true)
    expect(await counters()).toEqual({ lasNoches: 1 })
  })

  it('a pub fight', async () => {
    await ninja.ready(16, 2601)
    expect((await ninja.client.post('/api/game/gates/pub/fight')).statusCode).toBe(200)
    expect(await counters()).toEqual({ pubFight: 1 })
  })

  it('a toll gate counts only when cleared', async () => {
    await ninja.give('i270100', { equippedSlot: 'Weapon' })
    await ninja.ready(20)
    await ninja.client.post('/api/game/gates/enter', { gateId: 100001 })
    for (let point = 0; point < 9; point++)
      expect((await ninja.client.post('/api/game/gates/run/fight')).statusCode).toBe(200)
    expect(await counters()).toEqual({})
    const last = (await ninja.client.post('/api/game/gates/run/fight')).json()
    expect(last.run.cleared).toBe(true)
    expect(await counters()).toEqual({ tollGate: 1 })
  })
})
