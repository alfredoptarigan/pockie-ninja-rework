import { describe, expect, it } from 'vitest'
import type { Random } from '../random.js'
import {
  TALENT_IDS,
  canActivate,
  critRoll,
  defenseRoll,
  extraChance,
  hitPercent,
  narrowGap,
  parryChance,
  rollUpgrade,
  talentCap,
  upgradeCost,
  type TalentId,
  type TalentStats,
} from './talents.js'

describe('talent progression (decisions 6, 7)', () => {
  it('caps the level at character level - 50', () => {
    expect(talentCap(10)).toBe(0)
    expect(talentCap(50)).toBe(0)
    expect(talentCap(51)).toBe(1)
    expect(talentCap(90)).toBe(40)
  })

  it('prices the n-th attempt of the day, 40 attempts', () => {
    expect(upgradeCost(1)).toEqual({ gold: 2, stones: 10_000 })
    expect(upgradeCost(10)).toEqual({ gold: 11, stones: 5_120_000 })
    expect(upgradeCost(17)).toEqual({ gold: 18, stones: 5_120_000 })
    expect(upgradeCost(40)).toEqual({ gold: 18, stones: 5_120_000 })
    expect(upgradeCost(0)).toBeNull()
    expect(upgradeCost(41)).toBeNull()
  })

  it('gives 100 EXP, 300 on a 10% crit', () => {
    const roll = (n: number): Random => ({ next: () => 0, between: () => 0, int: () => n })
    expect(rollUpgrade(roll(9))).toEqual({ exp: 300, crit: true })
    expect(rollUpgrade(roll(10))).toEqual({ exp: 100, crit: false })
  })

  it('activates level 1+ talents, at most 3', () => {
    expect(canActivate(0, 0)).toBe(false)
    expect(canActivate(1, 2)).toBe(true)
    expect(canActivate(1, 3)).toBe(false)
  })
})

describe('narrowGap (decision 8)', () => {
  it('narrows an enemy lead by L%', () => {
    expect(narrowGap(100, 60, 25)).toBe(90)
    expect(narrowGap(100, 60, 0)).toBe(100)
  })

  it('stops at parity, never past', () => {
    expect(narrowGap(100, 60, 100)).toBe(60)
    expect(narrowGap(100, 60, 250)).toBe(60)
  })

  it('leaves the stat alone when the enemy does not lead', () => {
    expect(narrowGap(60, 100, 40)).toBe(60)
    expect(narrowGap(60, 60, 40)).toBe(60)
  })

  it('gives whole percent extra chances of L/4 for talents 1, 6, 7', () => {
    expect(extraChance(0)).toBe(0)
    expect(extraChance(3)).toBe(0)
    expect(extraChance(4)).toBe(1)
    expect(extraChance(40)).toBe(10)
  })
})

const base: TalentStats = {
  hit: 500,
  dodge: 500,
  crit: 500,
  tough: 500,
  parry: 500,
  pierce: 500,
  defense: 500,
  neglectDefense: 500,
}

/** All four rolls of one strike: attacker hits defender, defender may parry. */
const rolls = (attacker: TalentStats, defender: TalentStats) => ({
  hit: hitPercent(attacker, defender),
  crit: critRoll(attacker, defender),
  parry: parryChance(defender, attacker),
  defense: defenseRoll(attacker, defender),
})

/** Which side owns the talent and which stat of the enemy must lead for it to apply. */
const cases: Record<TalentId, { owner: 'attacker' | 'defender'; lead: Partial<TalentStats> }> = {
  1: { owner: 'defender', lead: { pierce: 900 } }, // attacker's pierce beats my parry
  2: { owner: 'attacker', lead: { parry: 900 } }, // defender's parry beats my pierce
  3: { owner: 'defender', lead: { neglectDefense: 900 } },
  4: { owner: 'attacker', lead: { defense: 900 } },
  5: { owner: 'defender', lead: { crit: 900 } },
  6: { owner: 'attacker', lead: { tough: 900 } },
  7: { owner: 'defender', lead: { hit: 900 } },
  8: { owner: 'attacker', lead: { dodge: 900 } },
}
const site: Record<TalentId, keyof ReturnType<typeof rolls>> = {
  1: 'parry',
  2: 'parry',
  3: 'defense',
  4: 'defense',
  5: 'crit',
  6: 'crit',
  7: 'hit',
  8: 'hit',
}

describe('talents at the roll sites', () => {
  for (const id of TALENT_IDS) {
    const { owner, lead } = cases[id]
    const enemy = owner === 'attacker' ? 'defender' : 'attacker'
    const setup = (level: number, leads: boolean) => {
      const sides = { attacker: { ...base }, defender: { ...base } }
      if (leads) Object.assign(sides[enemy], lead)
      sides[owner].talents = { [id]: level }
      return rolls(sides.attacker, sides.defender)
    }

    it(`talent ${id} changes only the ${site[id]} roll when the enemy leads`, () => {
      const without = setup(0, true)
      const with40 = setup(40, true)
      expect(with40[site[id]]).not.toEqual(without[site[id]])
      for (const key of Object.keys(without) as (keyof typeof without)[]) {
        if (key !== site[id]) expect(with40[key]).toEqual(without[key])
      }
    })

    it(`talent ${id} does nothing when the enemy does not lead`, () => {
      expect(setup(40, false)).toEqual(setup(0, false))
    })
  }

  it('reaches parity at L = 100 for the narrowing talents', () => {
    const me = { ...base, talents: { 8: 100, 4: 100, 2: 100 } }
    const enemy = { ...base, dodge: 900, defense: 900, parry: 900 }
    expect(hitPercent(me, enemy)).toBe(100)
    expect(defenseRoll(me, enemy)).toEqual({ defense: 500, neglectDefense: 500 })
    expect(parryChance(enemy, me)).toBe(0)
    const tough = { ...base, talents: { 5: 100 } }
    expect(critRoll({ ...base, crit: 900 }, tough)).toEqual({ c: 0, chance: 0 })
  })

  it('adds L/4 % for talents 1, 6 and 7', () => {
    expect(parryChance({ ...base, talents: { 1: 40 } }, { ...base, pierce: 900 })).toBe(10)
    expect(critRoll({ ...base, talents: { 6: 40 } }, { ...base, tough: 900 })).toEqual({
      c: 0,
      chance: 10,
    })
    expect(hitPercent({ ...base, hit: 900 }, { ...base, talents: { 7: 40 } })).toBe(90)
  })
})
