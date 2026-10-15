// Sannin Test: the view, rolls and the daily dice, Change Luck, Perfect, claiming and the promotion
// battle with its permanent Max HP.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SanninClaimResult,
  SanninPromotionResult,
  SanninTestView,
} from '../../../../shared/src/schemas/sannin-test.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { sanninPlayers } from '../../db/schema.js'
import { errorCode, setUpNinja, today } from '../gates/test-setup.js'
import { SANNIN_PLACEHOLDERS as P } from './config.js'

/** Strong: a ninja that always wins; weak: one hit point and no attack; real: unchanged. */
const power = vi.hoisted(() => ({ strong: true, real: false }))
vi.mock('../../game/combat.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../game/combat.js')>()
  return {
    ...original,
    playerFighter: async (...args: Parameters<typeof original.playerFighter>) => {
      const fighter = await original.playerFighter(...args)
      if (power.real) return fighter
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
  power.real = false
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.ready(60)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const PATH = '/api/game/sannin-test'
const view = async () => {
  const response = await ninja.client.get(PATH)
  expect(response.statusCode).toBe(200)
  return response.json<SanninTestView>()
}
const post = (path: string) => ninja.client.post(`${PATH}${path}`, {})
const ok = async <T>(path: string) => {
  const response = await post(path)
  expect(response.statusCode, response.body).toBe(200)
  return response.json<T>()
}
const setRow = (values: Partial<typeof sanninPlayers.$inferInsert>) =>
  db
    .insert(sanninPlayers)
    .values({ characterId: ninja.characterId, ...values })
    .onConflictDoUpdate({ target: sanninPlayers.characterId, set: values })

describe('GET /api/game/sannin-test', () => {
  it('opens at level 60 with today’s dice and the title path', async () => {
    await ninja.set({ level: 59 })
    expect((await ninja.client.get(PATH)).statusCode).toBe(403)
    await ninja.set({ level: 60 })
    const data = await view()
    expect(data.state).toMatchObject({
      rank: 0,
      growthPoints: 0,
      remainingDice: P.dicePerDay,
      remainingFreeChanges: P.freeChangesPerDay,
      pending: null,
    })
    expect(data.rankBonuses).toHaveLength(P.rankBonuses.length)
    expect(data.makeSixCost).toBe(P.makeSixCost)
  })
})

describe('dice', () => {
  it('rolls six dice, blocks another roll until the result is claimed, then pays it', async () => {
    const rolled = await ok<SanninTestView>('/roll')
    expect(rolled.state.pending?.dice).toHaveLength(6)
    expect(rolled.state.remainingDice).toBe(P.dicePerDay - 1)
    expect(errorCode(await post('/roll'))).toBe('pending')
    const before = await ninja.row()
    const claimed = await ok<SanninClaimResult>('/claim')
    expect(claimed.experience).toBe(rolled.pendingReward!.experience)
    expect(claimed.sanninTest.state).toMatchObject({
      pending: null,
      growthPoints: rolled.pendingReward!.growthPoints,
    })
    const after = await ninja.row()
    expect(after.level > before.level || after.exp > before.exp).toBe(true)
    expect(errorCode(await post('/claim'))).toBe('no_pending')
  })

  it('stops after today’s dice and starts again on a new day', async () => {
    await setRow({ diceDay: today(), diceUsed: P.dicePerDay })
    expect(errorCode(await post('/roll'))).toBe('no_dice')
    await setRow({ diceDay: '2000-01-01', diceUsed: P.dicePerDay, changesUsed: 3 })
    expect((await view()).state).toMatchObject({
      remainingDice: P.dicePerDay,
      remainingFreeChanges: P.freeChangesPerDay,
    })
    expect((await ok<SanninTestView>('/roll')).state.remainingDice).toBe(P.dicePerDay - 1)
  })

  it('Change Luck keeps the Ninja dice and uses a free change', async () => {
    await setRow({ pending: [1, 2, 3, 4, 5, 6] })
    const changed = await ok<SanninTestView>('/change-luck')
    expect(changed.state.pending!.dice[0]).toBe(1)
    expect(changed.state.remainingFreeChanges).toBe(P.freeChangesPerDay - 1)
    await setRow({ diceDay: today(), changesUsed: P.freeChangesPerDay })
    expect(errorCode(await post('/change-luck'))).toBe('no_changes')
    await setRow({ pending: [1, 1, 1, 1, 1, 1], changesUsed: 0 })
    expect(errorCode(await post('/change-luck'))).toBe('perfect')
  })

  it('Perfect turns five Ninja dice into six for Gold', async () => {
    await setRow({ pending: [1, 1, 1, 2, 1, 1] })
    await ninja.set({ gold: P.makeSixCost - 1 })
    expect(errorCode(await post('/perfect'))).toBe('not_enough')
    await ninja.set({ gold: P.makeSixCost + 5 })
    const result = await ok<{ sanninTest: SanninTestView }>('/perfect')
    expect(result.sanninTest.state.pending).toEqual({ dice: [1, 1, 1, 1, 1, 1], ninjaCount: 6 })
    expect((await ninja.row()).gold).toBe(5)
    await setRow({ pending: [1, 1, 2, 2, 1, 1] })
    expect(errorCode(await post('/perfect'))).toBe('not_five')
  })
})

describe('promotion battle', () => {
  const required = P.rankBonuses[1]!.requiredPoints

  it('needs the Growing Points and no pending result', async () => {
    await setRow({ growthPoints: required - 1 })
    expect(errorCode(await post('/promote'))).toBe('not_enough')
    await setRow({ growthPoints: required, pending: [2, 2, 2, 2, 2, 2] })
    expect(errorCode(await post('/promote'))).toBe('pending')
  })

  it('a victory unlocks the rank, spends the points and adds permanent Max HP', async () => {
    await setRow({ growthPoints: required + 7 })
    const maxHp = async () => {
      power.real = true
      const hp: number = (await ninja.client.get('/api/game/character')).json().character.maxHp
      power.real = false
      return hp
    }
    const before = await maxHp()
    const won = await ok<SanninPromotionResult>('/promote')
    expect(won).toMatchObject({ victory: true, targetRank: 1 })
    expect(won.sanninTest.state).toMatchObject({ rank: 1, growthPoints: 7 })
    const after = await maxHp()
    // A flat HP bonus, then scaled by the stamina percent like gear HP.
    expect(after - before).toBeGreaterThanOrEqual(P.rankBonuses[1]!.hp)
    expect(after - before).toBeLessThan(P.rankBonuses[1]!.hp * 1.5)
  })

  it('a defeat keeps the rank and the points', async () => {
    power.strong = false
    await setRow({ growthPoints: required })
    const lost = await ok<SanninPromotionResult>('/promote')
    expect(lost.victory).toBe(false)
    expect(lost.sanninTest.state).toMatchObject({ rank: 0, growthPoints: required })
  })

  it('stops at the last rank', async () => {
    await setRow({ rank: P.rankBonuses.length - 1, growthPoints: 99_999 })
    expect(errorCode(await post('/promote'))).toBe('max_rank')
  })
})

it('keeps the row per ninja', async () => {
  await ok('/roll')
  const [row] = await db
    .select()
    .from(sanninPlayers)
    .where(eq(sanninPlayers.characterId, ninja.characterId))
  expect(row).toMatchObject({ diceDay: today(), diceUsed: 1, totalRolls: 1 })
})
