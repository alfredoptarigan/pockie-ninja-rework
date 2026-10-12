import { describe, expect, it } from 'vitest'
import { gainExp, rollDrops } from './progression.js'
import { createRandom } from './random.js'

// LevelExp.ini: the key is the level you reach, the value what it costs from the level below.
const levelExp = { '1': 0, '2': 15, '3': 48, '4': 99 }

describe('gainExp (LevelSystem.java)', () => {
  it('keeps EXP below the next threshold', () => {
    expect(gainExp(1, 0, 10, levelExp, 90)).toEqual({ level: 1, exp: 10, levelsGained: 0 })
  })

  it('levels up and carries the remainder, EXP resets per level', () => {
    expect(gainExp(1, 10, 25, levelExp, 90)).toEqual({ level: 2, exp: 20, levelsGained: 1 })
  })

  it('can gain several levels at once', () => {
    expect(gainExp(1, 0, 15 + 48 + 5, levelExp, 90)).toEqual({ level: 3, exp: 5, levelsGained: 2 })
  })

  it('stops at the level cap and at the end of the table', () => {
    expect(gainExp(3, 0, 1000, levelExp, 3).level).toBe(3)
    expect(gainExp(1, 0, 10_000, levelExp, 90).level).toBe(4)
  })
})

describe('rollDrops (DropSystem.java)', () => {
  const entry = (item: string, probability: number, bound = 1) => ({
    ItemConfig: item,
    Probability: probability,
    BindingStatus: bound,
  })

  it('gives every entry of a quantity drop that has no more entries than DropCount', () => {
    // DropLib 9999999: the Lv.1 Newbie Pack.
    const entries = ['i159105', 'i250100', 'i260100', 'i270100'].map((item) => entry(item, 1))
    expect(rollDrops({ ItemDropType: 1, DropCount: 4 }, entries, createRandom(1))).toEqual(
      ['i159105', 'i250100', 'i260100', 'i270100'].map((itemId) => ({ itemId, bound: true })),
    )
  })

  it('picks DropCount different entries by weight otherwise', () => {
    const entries = ['a', 'b', 'c', 'd'].map((item) => entry(item, 10, 0))
    const drops = rollDrops({ ItemDropType: 1, DropCount: 2 }, entries, createRandom(2))
    expect(drops).toHaveLength(2)
    expect(new Set(drops.map((d) => d.itemId)).size).toBe(2)
    expect(drops[0]!.bound).toBe(false)
  })

  it('rolls each entry of an independent drop out of 1,000,000', () => {
    const entries = [entry('always', 1_000_000), entry('never', 0), entry('rare', 1)]
    const drops = rollDrops({ ItemDropType: 2, DropCount: 0 }, entries, createRandom(3))
    expect(drops.map((d) => d.itemId)).toEqual(['always'])
  })
})
