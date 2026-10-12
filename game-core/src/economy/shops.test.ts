import { describe, expect, it } from 'vitest'
import { createRandom } from '../random.js'
import { readFileSync } from 'node:fs'
import {
  drawRefreshStock,
  findLevelBand,
  freeRestocksUsed,
  merchantCanBuy,
  merchantPrice,
  merchantSpawn,
  parsePrices,
  pouchRefill,
  restockDue,
  splitStacks,
} from './shops.js'

describe('original shop economy', () => {
  it('selects inclusive Wholesale bands and parses each currency separately', () => {
    const boxes = { '1001': { MinLevel: 0, MaxLevel: 10 }, '1002': { MinLevel: 11, MaxLevel: 20 } }
    expect(findLevelBand(boxes, 10)?.[0]).toBe('1001')
    expect(findLevelBand(boxes, 11)?.[0]).toBe('1002')
    expect(parsePrices('38,0,8,2,9,3')).toEqual({ stone: 38, gold: 8, coupons: 9 })
    expect(splitStacks(201, 100)).toEqual([100, 100, 1])
    const data = JSON.parse(
      readFileSync(new URL('../../../server/data/game/npc-shops.json', import.meta.url), 'utf8'),
    ) as { items: Record<string, { item: string; costs: { amount: number; type: number }[] }[]> }
    expect(data.items.NpcShopBox_1001?.find((row) => row.item === 'i160006')).toEqual({
      item: 'i160006',
      costs: [{ amount: 38, type: 0 }],
    })
  })
  it('uses exact original appraisal weight boundaries and skips absent items', () => {
    const rows = [{ item: 'gear', costs: [] }]
    const draw = (type: 1 | 2 | 3, roll: number) =>
      drawRefreshStock(rows, 1, type, false, { ...createRandom(1), int: () => roll }, () => ({
        equipment: true,
        maxIdentifyCount: 4,
      }))[0]!
    expect(draw(1, 59).appraised).toBe(false)
    expect(draw(1, 60)).toMatchObject({ identifyCount: 1, appraised: true, bound: true })
    expect([59, 60, 80, 95].map((roll) => draw(2, roll).identifyCount)).toEqual([1, 2, 3, 4])
    expect([699, 700, 949, 999].map((roll) => draw(3, roll).identifyCount)).toEqual([1, 2, 3, 4])
    expect(drawRefreshStock(rows, 1, 1, false, createRandom(1), () => undefined)).toEqual([])
  })
  it('draws tutorial rows in order and completed tutorial rows with replacement', () => {
    const rows = [
      { item: 'a', costs: [{ amount: 1, type: 0 }] },
      { item: 'b', costs: [] },
    ]
    const info = () => ({ equipment: true, maxIdentifyCount: 4 })
    expect(drawRefreshStock(rows, 2, 1, false, createRandom(4), info).map((r) => r.item)).toEqual([
      'a',
      'b',
    ])
    const first = drawRefreshStock(rows, 10, 2, true, createRandom(8), info)
    expect(first).toEqual(drawRefreshStock(rows, 10, 2, true, createRandom(8), info))
    expect(first).toHaveLength(10)
    expect(first.every((r) => !r.bound && !r.appraised && r.identifyCount >= 1)).toBe(true)
    expect(
      drawRefreshStock(rows, 2, 3, false, createRandom(1), () => ({
        equipment: true,
        maxIdentifyCount: 1,
      })).every((r) => r.bound && !r.appraised && r.identifyCount === 1),
    ).toBe(true)
  })
  it('keeps the original strict open and inclusive countdown boundary', () => {
    const last = new Date('2026-10-12T23:30:00Z')
    const now = new Date('2026-10-13T00:00:00Z')
    expect(restockDue(last, now, 1800, 'open')).toBe(false)
    expect(restockDue(last, now, 1800, 'countdown')).toBe(true)
    expect(restockDue(last, new Date(now.getTime() + 1), 1800, 'open')).toBe(true)
    expect(freeRestocksUsed(1, '2026-10-12', now)).toBe(0)
    expect(freeRestocksUsed(1, '2026-10-13', now)).toBe(1)
  })
  it('charges one Gold or Coupon per 1000 requested points or rounded-up fill', () => {
    expect(pouchRefill(8999, 0, 10000, -1, 2)).toEqual({ hp: 10000, mp: 2000, cost: 4 })
    expect(pouchRefill(9999, 10000, 10000, 3, -1)).toEqual({ hp: 10000, mp: 10000, cost: 3 })
    expect(pouchRefill(10000, 10000, 10000, -1, -1).cost).toBe(0)
  })
  it('grows merchant prices from previous spawns and enforces shared item limits', () => {
    expect(merchantPrice(40, 10, 10)).toBe(44)
    expect(merchantPrice(35, 100, 10, true)).toBe(35)
    expect(merchantCanBuy(1, 1, 1, 100)).toBe(false)
    expect(merchantCanBuy(2, 0, 2, 1)).toBe(false)
    expect(merchantCanBuy(2, 0, 2, null)).toBe(true)
  })
  it('spawns during configured hourly ten-minute windows, ignoring expired dates', () => {
    const times = { '1': { hour: '9:00', livetime: 10, location: 1 } }
    const locations = { '1': [{ scene: 2601 }, { scene: 2605 }] }
    expect(
      merchantSpawn(
        new Date('2026-10-12T09:09:59Z'),
        times,
        locations,
        createRandom(1),
      )?.until.toISOString(),
    ).toBe('2026-10-12T09:10:00.000Z')
    expect(
      merchantSpawn(new Date('2026-10-12T09:10:00Z'), times, locations, createRandom(1)),
    ).toBeNull()
  })
})
