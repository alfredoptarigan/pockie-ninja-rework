// Akatsuki Invasion: the hunt view, the ambush rolled on a won field fight, facing it, rematches,
// Zetsu's bait and the red outfits.
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AkatsukiView } from '../../../../shared/src/schemas/akatsuki.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { akatsukiHunters, inventoryItems } from '../../db/schema.js'
import { BAG_CELLS, itemCells } from '../../game/bag.js'
import { nationScenes } from '../../game/data.js'
import { errorCode, setUpNinja } from '../gates/test-setup.js'
import { AKATSUKI_PLACEHOLDERS } from './config.js'
import { springs } from './rules.js'

/** Strong: a ninja that wins every pair fight; weak: one hit point and no attack. */
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
    // Field fights always count as won here; the ambush roll is what is under test.
    fightMonster: async (...args: Parameters<typeof original.fightMonster>) => ({
      ...(await original.fightMonster(...args)),
      won: true,
    }),
  }
})
vi.mock('./rules.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./rules.js')>()
  return { ...original, springs: vi.fn(original.springs) }
})

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>
const PAIN_RED = 'i2944260'
const DEIDARA_RED = 'i2944250'

beforeEach(async () => {
  power.strong = true
  vi.mocked(springs).mockReset()
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.ready(AKATSUKI_PLACEHOLDERS.minLevel)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const view = async () => {
  const response = await ninja.client.get('/api/game/akatsuki')
  expect(response.statusCode).toBe(200)
  return response.json<AkatsukiView>()
}
const row = async () =>
  (
    await db
      .select()
      .from(akatsukiHunters)
      .where(eq(akatsukiHunters.characterId, ninja.characterId))
  )[0]
const setRow = (values: Partial<typeof akatsukiHunters.$inferInsert>) =>
  db
    .insert(akatsukiHunters)
    .values({ characterId: ninja.characterId, ...values })
    .onConflictDoUpdate({ target: akatsukiHunters.characterId, set: values })
const post = (path: string, body: object = {}) =>
  ninja.client.post(`/api/game/akatsuki${path}`, body)

/** Fills every free bag cell with full 1x1 stacks. */
async function fillBag() {
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
}

/** A won field fight in the ninja's first field. */
async function fieldWin() {
  await ninja.set({ sceneId: nationScenes()[0]!.field, hp: 100_000, mp: 100_000 })
  const { monsters } = (await ninja.client.get('/api/game/scene')).json()
  const response = await ninja.client.post('/api/game/fight', { monsterId: monsters[0].id })
  expect(response.statusCode).toBe(200)
  return response.json()
}

describe('GET /api/game/akatsuki', () => {
  it('shows the first pair hunting, the rest locked, without creating a row', async () => {
    const data = await view()
    expect(data).toMatchObject({
      enabled: true,
      pairsDefeated: 0,
      hunting: 'clay',
      pendingAmbush: null,
      ambushChancePercent: AKATSUKI_PLACEHOLDERS.ambushChancePercent,
      bait: { activeUntil: null, usedToday: false },
      claimed: [],
    })
    expect(data.pairs.map((p) => p.key)).toEqual(['clay', 'ritual', 'paper', 'crows'])
    expect(data.members).toMatchObject({ deidara: 'revealed', sasori: 'revealed', pain: 'locked' })
    expect(data.redOutfits.pain).toBe(PAIN_RED)
    expect(await row()).toBeUndefined()
  })
  it('has nobody hunting a ninja under the level', async () => {
    await ninja.set({ level: AKATSUKI_PLACEHOLDERS.minLevel - 1 })
    expect((await view()).hunting).toBeNull()
  })
})

describe('the ambush on a won field fight', () => {
  it('springs the hunting pair once, until it is faced', async () => {
    vi.mocked(springs).mockReturnValue(true)
    const first = await fieldWin()
    expect(first.akatsukiAmbush).toEqual({ pair: 'clay', members: ['deidara', 'sasori'] })
    expect((await row())!.pendingAmbush).toBe(true)
    expect((await view()).pendingAmbush).toBe('clay')
    const second = await fieldWin()
    expect(second.akatsukiAmbush).toBeUndefined()
  })
  it('does not spring when the roll misses or under the level', async () => {
    vi.mocked(springs).mockReturnValue(false)
    expect((await fieldWin()).akatsukiAmbush).toBeUndefined()
    vi.mocked(springs).mockReturnValue(true)
    await ninja.set({ level: AKATSUKI_PLACEHOLDERS.minLevel - 1 })
    expect((await fieldWin()).akatsukiAmbush).toBeUndefined()
  })
})

describe('POST /api/game/akatsuki/ambush', () => {
  it('refuses without a sprung ambush', async () => {
    expect(errorCode(await post('/ambush'))).toBe('no_ambush')
  })
  it('beats the pair: the next one hunts', async () => {
    await setRow({ pendingAmbush: true })
    const response = await post('/ambush')
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({
      won: true,
      pair: 'clay',
      looks: [{ clothing: 105 }, { clothing: 23 }],
    })
    expect(body.akatsuki).toMatchObject({
      pairsDefeated: 1,
      hunting: 'ritual',
      pendingAmbush: null,
    })
    expect(body.akatsuki.members).toMatchObject({ deidara: 'defeated', hidan: 'revealed' })
  })
  it('loses: they leave, the hunt goes on', async () => {
    power.strong = false
    await setRow({ pendingAmbush: true })
    const body = (await post('/ambush')).json()
    expect(body).toMatchObject({ won: false })
    expect(await row()).toMatchObject({ pairsDefeated: 0, pendingAmbush: false })
  })
})

describe('POST /api/game/akatsuki/rematch', () => {
  it('only fights a pair already beaten, without progress', async () => {
    expect(errorCode(await post('/rematch', { pair: 'clay' }))).toBe('not_defeated')
    await setRow({ pairsDefeated: 1 })
    const body = (await post('/rematch', { pair: 'clay' })).json()
    expect(body).toMatchObject({ won: true, pair: 'clay' })
    expect((await row())!.pairsDefeated).toBe(1)
    expect((await post('/rematch', { pair: 'nope' })).statusCode).toBe(400)
  })
})

describe('POST /api/game/akatsuki/bait', () => {
  it('doubles the ambush chance for an hour, once a day', async () => {
    const response = await post('/bait')
    expect(response.statusCode).toBe(200)
    const { akatsuki } = response.json()
    expect(akatsuki.ambushChancePercent).toBe(AKATSUKI_PLACEHOLDERS.ambushChancePercent * 2)
    expect(akatsuki.bait.usedToday).toBe(true)
    const left = Date.parse(akatsuki.bait.activeUntil) - Date.now()
    expect(left).toBeGreaterThan(3_500_000)
    expect(left).toBeLessThanOrEqual(3_600_000)
    expect(errorCode(await post('/bait'))).toBe('bait_used')
  })
  it('needs someone hunting', async () => {
    await setRow({ pairsDefeated: 4 })
    expect(errorCode(await post('/bait'))).toBe('no_hunt')
  })
})

describe('POST /api/game/akatsuki/claim', () => {
  it('gives a beaten member’s red outfit once', async () => {
    expect(errorCode(await post('/claim', { member: 'deidara' }))).toBe('not_defeated')
    await setRow({ pairsDefeated: 1 })
    const response = await post('/claim', { member: 'deidara' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      itemId: DEIDARA_RED,
      akatsuki: { claimed: ['deidara'] },
    })
    expect(await ninja.bag(DEIDARA_RED)).toMatchObject([{ bound: true, count: 1 }])
    expect(errorCode(await post('/claim', { member: 'deidara' }))).toBe('claimed')
  })
  it('has no outfit for Zetsu and needs bag room', async () => {
    await setRow({ pairsDefeated: 4 })
    expect(errorCode(await post('/claim', { member: 'zetsu' }))).toBe('no_outfit')
    await fillBag()
    expect(errorCode(await post('/claim', { member: 'pain' }))).toBe('bag_full')
  })
})
