import { describe, expect, it } from 'vitest'
import { createRandom } from '../random.js'
import { IDENTIFY_PROPS, fixedRandom } from './fixtures.js'
import {
  addIdentifyProp,
  appraiseCost,
  canAppraise,
  canRefine,
  isAppraised,
  rollIdentify,
  type IdentifyGroups,
} from './identify.js'
import type { EquipInstance } from './types.js'

/** Groups built from IdentifyPropLib rows in IDENTIFY_PROPS (1001 / 2001 trimmed). */
const GROUPS: IdentifyGroups = {
  '1001': { Identify0: 1, Identify1: 21, Identify2: 41, Identify3: 61, Identify4: 201 },
  '2001': { Identify0: 764, Identify1: 765, Identify2: 766, Identify3: 772 },
  /** Two StrengthEquip rows, like 1022-1028 hold a repeated name. */
  '9001': { Identify0: 1, Identify1: 381, Identify2: 21 },
  '9002': { Identify0: 1, Identify1: 381 },
  '9003': { Identify0: 999999, Identify1: 21 },
}
const tables = { groups: GROUPS, props: IDENTIFY_PROPS }
const commonOnly = { CommonIdentifyID: 1001, SpecialIdentifyID: 0 }
const withGold = { CommonIdentifyID: 1001, SpecialIdentifyID: 2001 }

const item = (overrides: Partial<EquipInstance> = {}) => ({
  canIdentify: true,
  identifyCount: 2,
  identifyTimes: 0,
  props: [],
  engravedSlot: null,
  ...overrides,
})
const names = (props: { propId: number }[]) => props.map((p) => IDENTIFY_PROPS[p.propId]!.PropName)

describe('appraiseCost (IdentifySystem 382-385)', () => {
  it('matches the spec: L 1 → 12, 30 → 19, 60 → 24, 90 → 29 Stone', () => {
    expect([1, 30, 60, 90].map(appraiseCost)).toEqual([12, 19, 24, 29])
  })
})

describe('isAppraised / canAppraise / canRefine', () => {
  it('treats items without hidden properties as appraised', () => {
    expect(isAppraised(item({ canIdentify: false }))).toBe(true)
    expect(isAppraised(item())).toBe(false)
    expect(isAppraised(item({ identifyTimes: 1 }))).toBe(true)
  })

  it('appraises only unrolled items with 1-4 properties (404-406)', () => {
    expect(canAppraise(item())).toBe(true)
    expect(canAppraise(item({ identifyTimes: 1 }))).toBe(false)
    expect(canAppraise(item({ canIdentify: false }))).toBe(false)
    expect(canAppraise(item({ identifyCount: 0 }))).toBe(false)
    expect(canAppraise(item({ identifyCount: 5 }))).toBe(false)
  })

  it('refines appraised items with 1-4 properties; white (0-property) gear is refused', () => {
    expect(canRefine(item({ identifyTimes: 1 }))).toBe(true)
    expect(canRefine(item())).toBe(false)
    expect(canRefine(item({ canIdentify: false, identifyCount: 0 }))).toBe(false)
  })
})

describe('rollIdentify (FlushEquipIdentifyProp 350-380)', () => {
  it('rolls nothing without a 1-4 count or an identify list', () => {
    const random = createRandom(1)
    expect(rollIdentify(item({ identifyCount: 0 }), commonOnly, tables, random)).toBeNull()
    expect(rollIdentify(item({ identifyCount: 5 }), commonOnly, tables, random)).toBeNull()
    expect(rollIdentify(item(), undefined, tables, random)).toBeNull()
  })

  it('rolls `count` distinct common properties within their ranges and counts the roll', () => {
    for (let seed = 0; seed < 50; seed++) {
      const result = rollIdentify(
        item({ identifyCount: 3 }),
        commonOnly,
        tables,
        createRandom(seed),
      )!
      expect(result.identifyTimes).toBe(1)
      expect(result.props).toHaveLength(3)
      expect(new Set(names(result.props)).size).toBe(3)
      for (const { propId, value } of result.props) {
        const prop = IDENTIFY_PROPS[propId]!
        expect(value).toBeGreaterThanOrEqual(prop.PropMinValue)
        expect(value).toBeLessThanOrEqual(prop.PropMaxValue)
      }
    }
  })

  it('floors Strength, Agility and Stamina to hundreds (187-193)', () => {
    // Pick row 0 (StrengthEquip 2800-3400), roll 3456.
    const result = rollIdentify(
      item({ identifyCount: 1 }),
      commonOnly,
      tables,
      fixedRandom(0, 3456),
    )
    expect(result!.props).toEqual([{ propId: 1, value: 3400 }])
  })

  it('never floors a base stat below 100', () => {
    const result = rollIdentify(item({ identifyCount: 1 }), commonOnly, tables, fixedRandom(0, 99))
    expect(result!.props).toEqual([{ propId: 1, value: 100 }])
  })

  it('adds the gold property last on a 4-property item with a special group (253-304)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const result = rollIdentify(item({ identifyCount: 4 }), withGold, tables, createRandom(seed))!
      expect(result.props).toHaveLength(4)
      expect(Object.values(GROUPS['1001']!)).toEqual(
        expect.arrayContaining(result.props.slice(0, 3).map((p) => p.propId)),
      )
      expect(Object.values(GROUPS['2001']!)).toContain(result.props[3]!.propId)
      expect(new Set(names(result.props)).size).toBe(4)
    }
  })

  it('rolls 4 common properties when the item has no special group', () => {
    const result = rollIdentify(item({ identifyCount: 4 }), commonOnly, tables, createRandom(3))!
    expect(result.props.every((p) => Object.values(GROUPS['1001']!).includes(p.propId))).toBe(true)
    expect(result.props).toHaveLength(4)
  })

  it('skips names already rolled and draws again (205-248)', () => {
    // Row 0 (id 1, Strength), value; row 0 of [381, 21] is Strength again → redraw row 1 (id 21).
    const result = rollIdentify(
      item(),
      { CommonIdentifyID: 9001, SpecialIdentifyID: 0 },
      tables,
      fixedRandom(0, 3000, 0, 1, 3000),
    )
    expect(result!.props).toEqual([
      { propId: 1, value: 3000 },
      { propId: 21, value: 3000 },
    ])
  })

  it('ambiguity: stops instead of looping forever when a group runs out of new names', () => {
    // The original `--i; continue` (227-229) never ends; we keep the rows rolled so far.
    const result = rollIdentify(
      item(),
      { CommonIdentifyID: 9002, SpecialIdentifyID: 0 },
      tables,
      createRandom(5),
    )
    expect(names(result!.props)).toEqual(['StrengthEquip'])
  })

  it('spends an attempt on a prop id missing from the library (fewer rows)', () => {
    const result = rollIdentify(
      item(),
      { CommonIdentifyID: 9003, SpecialIdentifyID: 0 },
      tables,
      fixedRandom(0, 1, 3000),
    )
    expect(result!.props).toEqual([{ propId: 21, value: 3000 }])
  })

  it('rolls no common properties when the group is smaller than the count, but still counts', () => {
    const result = rollIdentify(
      item({ identifyCount: 3 }),
      { CommonIdentifyID: 9002, SpecialIdentifyID: 0 },
      tables,
      createRandom(1),
    )
    expect(result).toEqual({ props: [], identifyTimes: 1 })
  })

  it('keeps the engraved property at its row and rolls the others', () => {
    const engraved = { propId: 61, value: 33 }
    const before = item({
      identifyTimes: 1,
      identifyCount: 3,
      props: [{ propId: 1, value: 3000 }, engraved, { propId: 21, value: 2900 }],
      engravedSlot: 1,
    })
    for (let seed = 0; seed < 20; seed++) {
      const result = rollIdentify(before, commonOnly, tables, createRandom(seed))!
      expect(result.identifyTimes).toBe(2)
      expect(result.props).toHaveLength(3)
      expect(result.props[1]).toEqual(engraved)
      expect(names(result.props).filter((n) => n === 'DefenseEquip')).toHaveLength(1)
    }
  })

  it('does not roll a new gold property when the engraved row is position 3', () => {
    const engravedGold = { propId: 764, value: 20 }
    const before = item({
      identifyTimes: 1,
      identifyCount: 4,
      props: [
        { propId: 1, value: 3000 },
        { propId: 21, value: 3000 },
        { propId: 41, value: 3000 },
        engravedGold,
      ],
      engravedSlot: 3,
    })
    const result = rollIdentify(before, withGold, tables, createRandom(8))!
    expect(result.props).toHaveLength(4)
    expect(result.props[3]).toEqual(engravedGold)
    const common = Object.values(GROUPS['1001']!)
    expect(result.props.slice(0, 3).every((p) => common.includes(p.propId))).toBe(true)
  })
})

describe('addIdentifyProp (Reborn Impress)', () => {
  it('adds a common property whose name the item lacks', () => {
    const props = [{ propId: 1, value: 3000 }]
    for (let seed = 0; seed < 20; seed++) {
      const added = addIdentifyProp({ props }, withGold, tables, createRandom(seed))!
      expect(Object.values(GROUPS['1001']!)).toContain(added.propId)
      expect(names([...props, added])).not.toContain(undefined)
      expect(new Set(names([...props, added])).size).toBe(2)
    }
  })

  it('adds the gold property as the fourth line, and nothing to a full item', () => {
    const three = [1, 21, 41].map((propId) => ({ propId, value: 3000 }))
    const gold = addIdentifyProp({ props: three }, withGold, tables, createRandom(3))!
    expect(Object.values(GROUPS['2001']!)).toContain(gold.propId)
    expect(addIdentifyProp({ props: [...three, gold] }, withGold, tables, createRandom(3))).toBe(
      undefined,
    )
  })

  it('finds nothing when every name is taken', () => {
    const props = [{ propId: 1, value: 3000 }]
    expect(
      addIdentifyProp(
        { props },
        { CommonIdentifyID: 9002, SpecialIdentifyID: 0 },
        tables,
        createRandom(1),
      ),
    ).toBe(undefined)
  })
})
