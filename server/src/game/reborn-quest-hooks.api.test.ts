// Reborn quest command hooks (M5 task 11): each action completes only its own command step.
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { characterBloodlines, characterQuests } from '../db/schema.js'
import { setUpNinja } from '../modules/gates/test-setup.js'
import { rebornBloodlines } from './data.js'

// Every fight is won, so Las Noches clears its floor.
vi.mock('@pockie/game-core', async (original) => ({
  ...(await original<typeof import('@pockie/game-core')>()),
  simulateFight: (input: { attackers: { hp: number; mp: number }[]; seed: number }) => ({
    seed: input.seed,
    fighters: [
      { index: 0, side: 'attackers', hp: input.attackers[0]!.hp, mp: input.attackers[0]!.mp },
    ],
    events: [],
    winner: 'attackers',
  }),
}))

/** The Reborn quests with a single command step, by the command they wait for. */
const QUESTS = {
  identify: 820004,
  enhance: 820005,
  inscribe: 820009,
  arena: 820016,
  lasNoches: 820017,
  bloodline: 820018,
}

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.ready(60)
  await ninja.set({ stone: 10_000, gold: 100 })
  await db.insert(characterQuests).values(
    Object.values(QUESTS).map((taskId) => ({
      characterId: ninja.characterId,
      taskId,
      progress: [0],
      state: 0,
    })),
  )
})
afterEach(() => ninja.app.close())
afterAll(() => close())

/** Quests that are ready to hand in. */
const ready = async () =>
  (
    await db
      .select()
      .from(characterQuests)
      .where(and(eq(characterQuests.characterId, ninja.characterId), eq(characterQuests.state, 1)))
  ).map((q) => q.taskId)

describe('Reborn quest command hooks', () => {
  it('appraising identifies', async () => {
    const ring = await ninja.give('i282607', {
      canIdentify: true,
      identifyCount: 2,
      identifyTimes: 0,
    })
    const response = await ninja.client.post('/api/game/forge/appraise', { itemId: ring.id })
    expect(response.statusCode).toBe(200)
    expect(await ready()).toEqual([QUESTS.identify])
  })

  it('appraise-all identifies', async () => {
    const ring = await ninja.give('i282607', {
      canIdentify: true,
      identifyCount: 2,
      identifyTimes: 0,
    })
    const response = await ninja.client.post('/api/game/forge/appraise-all', {
      itemIds: [ring.id],
    })
    expect(response.statusCode).toBe(200)
    expect(await ready()).toEqual([QUESTS.identify])
  })

  it('a successful enhance (level 0 never fails)', async () => {
    const bat = await ninja.give('i250104')
    const response = await ninja.client.post('/api/game/forge/enhance', {
      itemId: bat.id,
      payment: 'gold',
    })
    expect(response.json().success).toBe(true)
    expect(await ready()).toEqual([QUESTS.enhance])
  })

  it('a successful inscription (2 Low Seals reach 100%)', async () => {
    const bat = await ninja.give('i250104')
    await ninja.give('i161008', { count: 2 })
    const response = await ninja.client.post('/api/game/forge/inscribe', {
      itemId: bat.id,
      seal: 'low',
      seals: 2,
    })
    expect(response.json().success).toBe(true)
    expect(await ready()).toEqual([QUESTS.inscribe])
  })

  it('an arena fight', async () => {
    await ninja.client.get('/api/game/arena')
    const response = await ninja.client.post('/api/game/arena/fight', { slot: 0 })
    expect(response.statusCode).toBe(200)
    expect(await ready()).toEqual([QUESTS.arena])
  })

  it('a cleared Las Noches floor', async () => {
    await ninja.client.post('/api/game/gates/las-noches/start', { mode: 'first' })
    const response = await ninja.client.post('/api/game/gates/las-noches/fight')
    expect(response.json().won).toBe(true)
    expect(await ready()).toEqual([QUESTS.lasNoches])
  })

  it('the first bloodline unlock, not a turn-in short of it', async () => {
    const { itemsPerTurnIn, amityPerTurnIn, limits } = rebornBloodlines()
    const limit = limits.find((l) => l.requiredLevel <= 60 && l.amity >= 2 * amityPerTurnIn)!
    await ninja.give(limit.unlockItem, { count: itemsPerTurnIn * 2 })
    await db.insert(characterBloodlines).values({
      characterId: ninja.characterId,
      limitId: limit.id,
      amity: limit.amity - 2 * amityPerTurnIn,
    })
    const turnIn = () => ninja.client.post(`/api/game/bloodlines/${limit.id}/turn-in`, {})
    expect((await turnIn()).statusCode).toBe(200)
    expect(await ready()).toEqual([])
    expect((await turnIn()).statusCode).toBe(200)
    expect(await ready()).toEqual([QUESTS.bloodline])
  })
})
