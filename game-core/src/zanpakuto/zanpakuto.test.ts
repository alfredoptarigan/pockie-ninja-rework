import { describe, expect, it } from 'vitest'
import { createRandom } from '../random.js'
import {
  applyBulkOption,
  bulkApplyCost,
  bulkOptions,
  CRYSTALS,
  crystalInfo,
  formatStatValue,
  qualityColor,
  rollStats,
  spiritSlotCost,
  statName,
  weaponSlotOpen,
  ZANPAKUTO_REFINE_RANGES,
} from './zanpakuto.js'

describe('crystal table (main.js module 17737)', () => {
  it('has the 54 crystals: 3 weapons x 3 tiers x positions 1-6', () => {
    expect(Object.keys(CRYSTALS)).toHaveLength(54)
    expect(crystalInfo(480001)).toMatchObject({
      tab: 'sharp',
      category: 0,
      position: 1,
      coins: 1,
      name: 'Sharp Blue Crystal I',
      icon: 'zanpakuto/rui_s1',
    })
    expect(crystalInfo(480046)).toMatchObject({
      tab: 'blunt',
      category: 1,
      position: 6,
      coins: 30,
      name: 'Blunt Purple Crystal VI',
      icon: 'zanpakuto/dun_p6',
    })
    expect(crystalInfo(480083)).toMatchObject({
      tab: 'fist',
      category: 2,
      position: 3,
      coins: 150,
      name: 'Fist Orange Crystal III',
      icon: 'zanpakuto/quan_b3',
    })
  })

  it('knows no crystal outside the table', () => {
    expect(crystalInfo(480000)).toBeUndefined()
    expect(crystalInfo(480007)).toBeUndefined()
  })
})

describe('slot costs and locks', () => {
  it('prices spirit slot i at 200i coupons or 100000 * (floor((i - 4) / 4) + 1) stones', () => {
    expect(spiritSlotCost(1)).toEqual({ coupons: 200, stones: 0 })
    expect(spiritSlotCost(4)).toEqual({ coupons: 800, stones: 100_000 })
    expect(spiritSlotCost(8)).toEqual({ coupons: 1600, stones: 200_000 })
    expect(spiritSlotCost(15)).toEqual({ coupons: 3000, stones: 300_000 })
  })

  it('opens weapon slot idx after 25 * idx Impel Down floors', () => {
    expect(weaponSlotOpen(0, 0)).toBe(true)
    expect(weaponSlotOpen(1, 24)).toBe(false)
    expect(weaponSlotOpen(1, 25)).toBe(true)
    expect(weaponSlotOpen(5, 125)).toBe(true)
  })

  it('charges bulk saves 3 + 3L SC and 5000 + 5000L stones only when locking', () => {
    expect(bulkApplyCost(0)).toEqual({ coins: 0, stones: 0 })
    expect(bulkApplyCost(1)).toEqual({ coins: 6, stones: 10_000 })
    expect(bulkApplyCost(2)).toEqual({ coins: 9, stones: 15_000 })
  })
})

describe('rolls', () => {
  it('rolls each stat from the tier pool inside its range', () => {
    const random = createRandom(7)
    for (const category of [0, 1, 2] as const) {
      for (const [stat, value] of rollStats(category, 3, random)) {
        const range = ZANPAKUTO_REFINE_RANGES[category][stat]!
        expect(value).toBeGreaterThanOrEqual(range[0])
        expect(value).toBeLessThanOrEqual(range[1])
      }
    }
  })

  it('is reproducible from its seed', () => {
    expect(rollStats(1, 2, createRandom(42))).toEqual(rollStats(1, 2, createRandom(42)))
  })

  it('generates 10 bulk options with as many stats as the crystal', () => {
    const options = bulkOptions(2, 2, createRandom(1))
    expect(options).toHaveLength(10)
    for (const option of options) expect(option).toHaveLength(2)
  })
})

describe('applyBulkOption', () => {
  const current: [number, number][] = [
    [8, 100],
    [15, 10],
    [21, 5],
  ]

  it('keeps locked columns and takes the option elsewhere', () => {
    const option: [number, number][] = [
      [9, 20],
      [16, 12],
      [23, 6],
    ]
    expect(applyBulkOption(current, option, [1])).toEqual([
      [9, 20],
      [15, 10],
      [23, 6],
    ])
  })

  it('refuses an option that repeats a locked stat in an unlocked column', () => {
    const option: [number, number][] = [
      [15, 20],
      [16, 12],
      [23, 6],
    ]
    expect(applyBulkOption(current, option, [1])).toBeUndefined()
  })
})

describe('stat formatting (main.js module 82710)', () => {
  it('names overridden ids and the stat table', () => {
    expect(statName(9)).toBe('Max Health Increase')
    expect(statName(18)).toBe('Block Increase')
    expect(statName(16)).toBe('Critical Damage')
  })

  it('halves the raw value and shows the % ids with two decimals', () => {
    expect(formatStatValue(8, 101)).toBe('50.5')
    expect(formatStatValue(11, 30)).toBe('1.50%')
    expect(formatStatValue(18, 300)).toBe('1.50%')
  })

  it('colours by refine quality against the range max', () => {
    const [, max] = ZANPAKUTO_REFINE_RANGES[2][8]!
    expect(qualityColor(0, 8, ZANPAKUTO_REFINE_RANGES[0][8]![1])).toBe('#00b034')
    expect(qualityColor(0, 8, 0)).toBe('#a8a8a8')
    expect(qualityColor(1, 8, ZANPAKUTO_REFINE_RANGES[1][8]![1])).toBe('#00aeff')
    expect(qualityColor(1, 8, 0)).toBe('#00b034')
    expect(qualityColor(2, 8, max)).toBe('#f2b41e')
    expect(qualityColor(2, 8, Math.ceil(max * 0.8))).toBe('#CA47AE')
    expect(qualityColor(2, 8, 0)).toBe('#00aeff')
  })
})
