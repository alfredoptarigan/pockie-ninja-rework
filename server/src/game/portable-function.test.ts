// Portable Function rules over the imported 2011 tables (ComposeSystem, AvatarSystem recast,
// IdentifySystem impress).
import { createRandom, type Random } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { item } from './data.js'
import {
  canRecast,
  composeValue,
  impressBaseRate,
  impressOdds,
  linesFor,
  recastRange,
  rollRecast,
  rollSynthesis,
  synthesisPartProblem,
  synthesisPlan,
} from './portable-function.js'

/** A Random whose rolls are always `value` (clamped to the range asked). */
const fixed = (value: number): Random => ({
  next: () => 0,
  int: () => 0,
  between: (min, max) => Math.min(max, Math.max(min, value)),
})

const part = (itemId: string, lines = 0) => ({ itemId, lines })
// i290001 Outfit +1 (AvatarID 1, clothing 1); i290101 its +2. i281008 a level 1 pet.
const OUTFIT = 'i290001'
// i250101 a level 1 blunt weapon (JudgeValueScore 1); i150302 Lucky Gem (43); i150337 Iron Ore
// scroll (1).
const WEAPON = 'i250101'
const LUCKY_GEM = 'i150302'

describe('synthesis values (CalculateIValue, FindFinalIValue)', () => {
  it('turns values into line counts: below 22 none, 46 and up four', () => {
    expect([0, 21, 22, 30, 31, 39, 45, 46, 90].map(linesFor)).toEqual([0, 0, 1, 1, 2, 3, 3, 4, 4])
  })

  it('weighs the main item first: 2 lines and two plain catalysts stay near 1 line', () => {
    expect(composeValue(31, 0.2)).toBe(29)
    expect(composeValue(31, 2 * 0.12 * 43)).toBe(43)
  })
})

describe('synthesisPlan', () => {
  it('finds recipes in any catalyst order', () => {
    expect(synthesisPlan(part(OUTFIT), [part(OUTFIT), part(OUTFIT)])).toEqual({
      kind: 'recipe',
      resultItemId: 'i290101',
      rate: 100,
    })
    expect(synthesisPlan(part('i28100801'), [part('i281008'), part('i281008')])).toMatchObject({
      resultItemId: 'i28100802',
      rate: 86,
    })
    expect(synthesisPlan(part(WEAPON), [part('i150301'), part('i150340')])).toMatchObject({
      resultItemId: 'i141013',
    })
  })

  it('refuses recipes that make nothing (Target 0)', () => {
    expect(synthesisPlan(part('i110109'), [part('i110101'), part('i110101')])).toEqual({
      error: 'Those items cannot be synthesized together.',
    })
  })

  it('shows random gear its value range: Lucky Gems lift a 2-line weapon to 3 lines', () => {
    const plan = synthesisPlan(part(WEAPON, 2), [part(LUCKY_GEM), part(LUCKY_GEM)])
    expect(plan).toEqual({ kind: 'random', rate: 100, value: { min: 39, max: 43, lines: [3, 3] } })
  })
})

describe('synthesisPartProblem', () => {
  it('refuses quest items, unmeltable items and level 2+ catalysts', () => {
    expect(synthesisPartProblem('i141012', false)).toMatch(/cannot be synthesized/)
    expect(synthesisPartProblem('i290101', false)).toBeNull()
    expect(synthesisPartProblem('i290101', true)).toMatch(/level 1/)
    expect(synthesisPartProblem(LUCKY_GEM, true)).toBeNull()
  })
})

describe('rollSynthesis', () => {
  it('fails a recipe roll above its rate', () => {
    const main = part('i28100801')
    const catalysts: [ReturnType<typeof part>, ReturnType<typeof part>] = [
      part('i281008'),
      part('i281008'),
    ]
    const plan = synthesisPlan(main, catalysts)
    if ('error' in plan) throw new Error(plan.error)
    expect(rollSynthesis(main, catalysts, plan, fixed(87))).toEqual({ success: false, lines: 0 })
    expect(rollSynthesis(main, catalysts, plan, fixed(86))).toEqual({
      success: true,
      resultItemId: 'i28100802',
      lines: 0,
    })
  })

  it('makes random gear of the main item level band with the rolled line count', () => {
    const main = part(WEAPON, 2)
    const catalysts: [ReturnType<typeof part>, ReturnType<typeof part>] = [
      part(LUCKY_GEM),
      part(LUCKY_GEM),
    ]
    const plan = synthesisPlan(main, catalysts)
    if ('error' in plan) throw new Error(plan.error)
    for (let seed = 0; seed < 10; seed++) {
      const roll = rollSynthesis(main, catalysts, plan, createRandom(seed))
      expect(roll.success).toBe(true)
      expect(item(roll.resultItemId!)).toMatchObject({ class: 'EquipItem', JudgeValueScore: 1 })
      expect(roll.lines).toBe(3)
    }
  })
})

describe('recast', () => {
  const range = recastRange(OUTFIT)!

  it("reads Reborn's ISV bounds: the outfit's ISV up to 1.1 times it, on the 2011 unit grid", () => {
    expect(range).toEqual({ base: [120, 120, 120], max: [132, 132, 132], unit: [2, 2, 1] })
    // Witch has no 2011 stats; Reborn gives it ISV 3.1 / 2.9 / 1.5 (max 3.41 / 3.19 / 1.65).
    expect(recastRange('i290002')).toMatchObject({ base: [310, 290, 150], max: [341, 319, 165] })
    expect(recastRange(WEAPON)).toBeUndefined()
  })

  it('rerolls free stats on their unit grid up to the cap and keeps locked ones', () => {
    const isv = [130, 124, 121]
    for (let seed = 0; seed < 20; seed++) {
      const [strength, agility, stamina] = rollRecast(range, isv, [0], createRandom(seed))
      expect(strength).toBe(130)
      expect(agility === 132 || (agility - 120) % 2 === 0).toBe(true)
      expect(agility).toBeLessThanOrEqual(132)
      expect(stamina).toBeGreaterThanOrEqual(120)
    }
    // RandInt 0 keeps the stat as it is; the top roll lands on the cap even off the grid.
    expect(rollRecast(range, isv, [], fixed(0))).toEqual(isv)
    const odd = recastRange('i290003')!
    expect(odd.max).toEqual([72, 121, 72])
    expect(rollRecast(odd, odd.base, [], fixed(99))).toEqual([72, 121, 72])
  })

  it('stops once every stat is at its cap or nothing free can move', () => {
    expect(canRecast(range, [120, 120, 120], [])).toBe(true)
    expect(canRecast(range, [132, 132, 132], [])).toBe(false)
    expect(canRecast(range, [132, 120, 132], [1])).toBe(false)
  })
})

describe('impress', () => {
  it('reads ImpressRate.ini by level band, gold for the fourth line', () => {
    expect(impressBaseRate(1, false)).toBe(75)
    expect(impressBaseRate(0, false)).toBe(75)
    expect(impressBaseRate(85, true)).toBe(15)
    expect(impressBaseRate(91, false)).toBeUndefined()
  })

  it('spends every crystal below 100 and only the needed ones at 100', () => {
    expect(impressOdds(75, 3, 5)).toEqual({ rate: 90, crystalsUsed: 3 })
    expect(impressOdds(75, 10, 5)).toEqual({ rate: 100, crystalsUsed: 5 })
    expect(impressOdds(37, 20, 5)).toEqual({ rate: 100, crystalsUsed: 13 })
    expect(impressOdds(40, 0, 5)).toEqual({ rate: 40, crystalsUsed: 0 })
  })
})
