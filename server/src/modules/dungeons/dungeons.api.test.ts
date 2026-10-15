// Scroll Dungeons: the daily view, a boss fight with its attempt, drops, pity and bag room.
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DungeonsView } from '../../../../shared/src/schemas/dungeons.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { dungeonPlayers, inventoryItems } from '../../db/schema.js'
import { BAG_CELLS, itemCells } from '../../game/bag.js'
import { errorCode, setUpNinja, today } from '../gates/test-setup.js'
import { rollDrops, todaysBosses } from './rules.js'

/** Strong: a geared ninja that wins; weak: one hit point and no attack. */
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
vi.mock('./rules.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./rules.js')>()
  return { ...original, rollDrops: vi.fn(original.rollDrops) }
})

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>
const [bossA] = todaysBosses(today())

beforeEach(async () => {
  power.strong = true
  vi.mocked(rollDrops).mockClear()
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.ready(45)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const view = async () => {
  const response = await ninja.client.get('/api/game/dungeons')
  expect(response.statusCode).toBe(200)
  return response.json<DungeonsView>()
}
const fight = (index = bossA) => ninja.client.post('/api/game/dungeons/fight', { index })
const row = async () =>
  (
    await db.select().from(dungeonPlayers).where(eq(dungeonPlayers.characterId, ninja.characterId))
  )[0]
const setRow = (values: Partial<typeof dungeonPlayers.$inferInsert>) =>
  db
    .insert(dungeonPlayers)
    .values({ characterId: ninja.characterId, ...values })
    .onConflictDoUpdate({ target: dungeonPlayers.characterId, set: values })
const pityWith = (index: number, steps: number) =>
  Array.from({ length: 11 }, (_, i) => (i === index ? steps : 0))

describe('GET /api/game/dungeons', () => {
  it('shows today’s 3 bosses, 25 attempts and the boss table', async () => {
    const data = await view()
    expect(data.activeBosses).toEqual(todaysBosses(today()))
    expect(data).toMatchObject({ attemptsRemaining: 25, maxAttempts: 25 })
    const midnight = new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString()
    expect(data.resetAt).toBe(midnight)
    expect(data.nextRotation).toBe(midnight)
    expect(data.bosses).toHaveLength(11)
    expect(data.bosses[0]).toMatchObject({
      index: 0,
      name: 'Madara Uchiha',
      build: 'Bloodluster',
      pose: 170,
      pity: 0,
      drops: [
        { name: 'Izanagi', chance: 2, itemId: 'i540001', permanentItemId: 'i540101' },
        { name: 'Reverse Lotus', chance: 2, itemId: 'i540009', permanentItemId: 'i540109' },
      ],
    })
    // Reading never creates the ninja's row.
    expect(await row()).toBeUndefined()
  })
  it('shows the pity bonus per boss in percent', async () => {
    await setRow({ pity: pityWith(4, 3) })
    expect((await view()).bosses[4]!.pity).toBe(1.5)
  })
})

describe('POST /api/game/dungeons/fight', () => {
  it('refuses a ninja under level 45', async () => {
    await ninja.set({ level: 44 })
    const response = await fight()
    expect(response.statusCode).toBe(400)
    expect(errorCode(response)).toBe('too_low')
  })
  it('refuses a boss outside today’s rotation and a bad index', async () => {
    const other = Array.from({ length: 11 }, (_, i) => i).find(
      (i) => !todaysBosses(today()).includes(i),
    )!
    expect(errorCode(await fight(other))).toBe('not_today')
    expect((await fight(11)).statusCode).toBe(400)
    expect(await row()).toBeUndefined()
  })
  it('spends an attempt, plays the fight and returns the boss look', async () => {
    const before = await ninja.row()
    const response = await fight()
    expect(response.statusCode).toBe(200)
    const result = response.json()
    expect(result.won).toBe(true)
    expect(result.replay.fighters).toHaveLength(2)
    expect(result.replay.fighters[1].level).toBe(45)
    expect(result.look.clothing).toBeGreaterThan(0)
    expect(result.dungeons.attemptsRemaining).toBe(24)
    expect(result.character.level).toBe(45)
    expect(await row()).toMatchObject({ attemptDay: today(), attemptsUsed: 1 })
    // The fight costs no HP or MP.
    expect(await ninja.row()).toMatchObject({ hp: before.hp, mp: before.mp })
  })
  it('rolls with the stored pity and adds a step on a win without a scroll', async () => {
    await setRow({ pity: pityWith(bossA!, 5) })
    vi.mocked(rollDrops).mockReturnValueOnce({ items: [], pity: 6 })
    const result = (await fight()).json()
    expect(vi.mocked(rollDrops).mock.calls[0]![1]).toBe(5)
    expect(result.drops).toEqual([])
    expect((await row())!.pity[bossA!]).toBe(6)
    expect(result.dungeons.bosses[bossA!].pity).toBe(3)
  })
  it('puts a dropped scroll in the bag and resets the pity', async () => {
    await setRow({ pity: pityWith(bossA!, 9) })
    vi.mocked(rollDrops).mockReturnValueOnce({ items: ['i540003'], pity: 0 })
    const result = (await fight()).json()
    expect(result.drops).toEqual([{ itemId: 'i540003' }])
    expect((await ninja.bag('i540003'))[0]).toMatchObject({ count: 1, bound: true })
    expect((await row())!.pity[bossA!]).toBe(0)
  })
  it('spends the attempt on a loss without a roll', async () => {
    power.strong = false
    const result = (await fight()).json()
    expect(result.won).toBe(false)
    expect(result.drops).toEqual([])
    expect(rollDrops).not.toHaveBeenCalled()
    expect(await row()).toMatchObject({ attemptsUsed: 1, pity: pityWith(0, 0) })
    expect((await ninja.row()).hp).toBeGreaterThan(0)
  })
  it('refuses when today’s attempts are used up', async () => {
    await setRow({ attemptDay: today(), attemptsUsed: 25 })
    const response = await fight()
    expect(errorCode(response)).toBe('no_attempts')
    expect((await row())!.attemptsUsed).toBe(25)
  })
  it('gives fresh attempts on a new UTC day', async () => {
    await setRow({ attemptDay: '2020-01-01', attemptsUsed: 25 })
    expect((await view()).attemptsRemaining).toBe(25)
    expect((await fight()).statusCode).toBe(200)
    expect(await row()).toMatchObject({ attemptDay: today(), attemptsUsed: 1 })
  })
  it('refuses a full bag before spending the attempt', async () => {
    const used = await db
      .select()
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
    expect(errorCode(await fight())).toBe('bag_full')
    expect(await row()).toBeUndefined()
  })
  it('spends the last attempt once under concurrent fights', async () => {
    await setRow({ attemptDay: today(), attemptsUsed: 24 })
    const responses = await Promise.all([fight(), fight(), fight()])
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1)
    expect((await row())!.attemptsUsed).toBe(25)
  })
})
