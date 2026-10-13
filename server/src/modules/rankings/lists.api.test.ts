import type { RankingPage } from '@pockie/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { arenaPlayers, singleGate } from '../../db/schema.js'
import { errorCode, setUpRankings } from './test-setup.js'

const { db, close } = createTestDb()
let t: Awaited<ReturnType<typeof setUpRankings>>

beforeEach(async () => {
  await truncateAll(db)
  t = await setUpRankings(db)
})
afterEach(() => t.app.close())
afterAll(() => close())

const list = async (path: string) => {
  const response = await t.client.get(`/api/game/rankings/${path}`)
  expect(response.statusCode).toBe(200)
  return response.json<RankingPage>()
}
const names = (page: RankingPage) => page.rows.map((row) => row.name)
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000)

describe('ranking tree', () => {
  it('lists the four lists and the eight weekly toll gates', async () => {
    const tree = (await t.client.get('/api/game/rankings')).json()
    expect(tree.lists.map((l: { key: string }) => l.key)).toEqual([
      'level',
      'stone',
      'lasNoches',
      'arena',
    ])
    expect(tree.tollGates.gates).toHaveLength(8)
    expect(tree.tollGates.gates[0]).toEqual({ id: 100001, nameKey: expect.stringMatching(/^lg_/) })
  })
})

describe('level ranking', () => {
  it('orders by level, then EXP, then the older ninja', async () => {
    await t.set({ level: 1, exp: 0 })
    await t.addNinjas([
      { level: 30, exp: 10, createdAt: ago(10) },
      { level: 30, exp: 50, createdAt: ago(5) },
      { level: 30, exp: 10, createdAt: ago(20) },
      { level: 40, exp: 0, createdAt: ago(1) },
    ])
    const page = await list('level')
    expect(names(page)).toEqual(['Rank_3', 'Rank_1', 'Rank_2', 'Rank_0', 'Ninja_01'])
    expect(page.rows[1]).toMatchObject({ place: 2, level: 30, value: 50, nation: 1 })
    expect(page).toMatchObject({ total: 5, pages: 1, page: 1, myPlace: 5 })
  })

  it('keeps the top 100 in pages of 10 and finds my page', async () => {
    await t.set({ level: 1 })
    await t.addNinjas(Array.from({ length: 22 }, (_, i) => ({ level: 50, exp: 100 - i })))
    await t.addNinjas(Array.from({ length: 100 }, () => ({ level: 2 })))
    const second = await list('level?page=2')
    expect(second.rows.map((r) => r.place)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(second).toMatchObject({ total: 100, pages: 10, myPlace: null })
    expect((await list('level?page=10')).rows).toHaveLength(10)

    // Not ranked: find me stays on page 1.
    expect(await list('level?find=me')).toMatchObject({ page: 1, myPlace: null })
    await t.set({ level: 50, exp: 90 })
    const found = await list('level?find=me')
    // Ties Rank_10 (EXP 90) and wins as the older ninja.
    expect(found).toMatchObject({ page: 2, myPlace: 11 })
    expect(found.rows.find((r) => r.place === 11)?.name).toBe('Ninja_01')
  })

  it('refuses unknown lists and pages beyond the top 100', async () => {
    expect(errorCode(await t.client.get('/api/game/rankings/gold'))).toBe('validation')
    expect(errorCode(await t.client.get('/api/game/rankings/level?page=11'))).toBe('validation')
  })
})

describe('Stone ranking', () => {
  it('orders by Stone with ties to the older ninja', async () => {
    await t.set({ stone: 5 })
    await t.addNinjas([
      { stone: 100, createdAt: ago(1) },
      { stone: 100, createdAt: ago(9) },
      { stone: 300 },
    ])
    const page = await list('stone')
    expect(names(page)).toEqual(['Rank_2', 'Rank_1', 'Rank_0', 'Ninja_01'])
    expect(page.rows[0]!.value).toBe(300)
  })
})

describe('Las Noches ranking', () => {
  it('ranks ninjas with a cleared floor by best floor, ties by id', async () => {
    const ids = await t.addNinjas([{}, {}, {}, {}])
    await db.insert(singleGate).values([
      { characterId: ids[0]!, bestFloor: 12 },
      { characterId: ids[1]!, bestFloor: 40 },
      { characterId: ids[2]!, bestFloor: 12 },
      { characterId: ids[3]!, bestFloor: 0 },
    ])
    const page = await list('lasNoches')
    const tied = [ids[0]!, ids[2]!].sort()
    const byId = new Map([
      [ids[0]!, 'Rank_0'],
      [ids[2]!, 'Rank_2'],
    ])
    expect(names(page)).toEqual(['Rank_1', byId.get(tied[0]!), byId.get(tied[1]!)])
    expect(page.rows.map((r) => r.value)).toEqual([40, 12, 12])
    expect(page.myPlace).toBeNull()
  })
})

describe('arena ranking', () => {
  it('orders by tier, score, then the earlier score time; no arena row is not ranked', async () => {
    const ids = await t.addNinjas([{}, {}, {}, {}, {}])
    await db.insert(arenaPlayers).values([
      { characterId: ids[0]!, tier: 2, score: 99000, scoreAt: ago(5) },
      { characterId: ids[1]!, tier: 3, score: 93500, scoreAt: ago(5) },
      { characterId: ids[2]!, tier: 2, score: 99000, scoreAt: ago(50) },
      { characterId: ids[3]!, tier: 2, score: 120050, scoreAt: ago(1) },
    ])
    await db.insert(arenaPlayers).values({ characterId: t.me, tier: 0, score: 93500 })
    const page = await list('arena')
    expect(names(page)).toEqual(['Rank_1', 'Rank_3', 'Rank_2', 'Rank_0', 'Ninja_01'])
    expect(page.rows[1]).toMatchObject({ tier: 2, value: 1200 })
    expect(page.myPlace).toBe(5)
  })
})
