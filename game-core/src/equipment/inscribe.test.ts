import { describe, expect, it } from 'vitest'
import { INSCRIBE_LEVELS, SEAL_ODDS, fixedRandom, i220102, i250104 } from './fixtures.js'
import { inscribeRow, inscribeSealsUsed, inscriptionProps, rollInscribe } from './inscribe.js'

const row = (level: number) => inscribeRow(INSCRIBE_LEVELS, level)!

describe('inscribeRow (OnTestAdd 56-74)', () => {
  it('returns the row for the current level below +12', () => {
    expect(row(0)).toMatchObject({ AddLevel: 1, BaseOdds: 94, StoneCost: 60 })
    expect(row(11)).toMatchObject({ AddLevel: 12, BaseOdds: 3, FailLevel: 8, StoneCost: 1200 })
  })

  it('has no row at the max level +12', () => {
    expect(inscribeRow(INSCRIBE_LEVELS, 12)).toBeUndefined()
  })
})

describe('inscribeSealsUsed (UseMaxNumSeal 158-176)', () => {
  it('uses no more seals than reach 100%: ceil((100 - BaseOdds) / SealOdds)', () => {
    // 0 → 1: BaseOdds 94; Low (3) needs 2, High (6) needs 1.
    expect(inscribeSealsUsed(row(0), SEAL_ODDS, 'low', 3, 10)).toBe(2)
    expect(inscribeSealsUsed(row(0), SEAL_ODDS, 'high', 3, 10)).toBe(1)
  })

  it('caps at the row max (3) and the seals owned', () => {
    expect(inscribeSealsUsed(row(11), SEAL_ODDS, 'low', 5, 10)).toBe(3)
    expect(inscribeSealsUsed(row(11), SEAL_ODDS, 'high', 3, 1)).toBe(1)
    expect(inscribeSealsUsed(row(11), SEAL_ODDS, 'high', 0, 5)).toBe(0)
  })

  it('treats a negative request as 0 (exploit fix: the original removed a negative count)', () => {
    expect(inscribeSealsUsed(row(11), SEAL_ODDS, 'high', -2, 5)).toBe(0)
  })
})

describe('rollInscribe (AddEquipInfo 178-186)', () => {
  it('succeeds when RandInt(0, 100) <= BaseOdds + SealOdds * used', () => {
    // 11 → 12 with 3 High seals: 3 + 18 = 21.
    expect(rollInscribe(row(11), SEAL_ODDS, 'high', 3, fixedRandom(21))).toEqual({
      success: true,
      level: 12,
    })
  })

  it('drops to FailLevel on failure: 8 from +8 and above, 4 from +4..+7', () => {
    expect(rollInscribe(row(11), SEAL_ODDS, 'high', 3, fixedRandom(22))).toEqual({
      success: false,
      level: 8,
    })
    expect(rollInscribe(row(6), SEAL_ODDS, 'low', 0, fixedRandom(25))).toEqual({
      success: false,
      level: 4,
    })
    expect(rollInscribe(row(1), SEAL_ODDS, 'low', 0, fixedRandom(79))).toEqual({
      success: false,
      level: 1,
    })
  })

  it('always succeeds once the odds reach 100', () => {
    expect(rollInscribe(row(0), SEAL_ODDS, 'low', 2, fixedRandom(100)).success).toBe(true)
  })
})

describe('inscriptionProps (InscribeSucc / InscribeFail 232-308)', () => {
  it('gives nothing at +0', () => {
    expect(inscriptionProps(i250104, 0, INSCRIBE_LEVELS)).toEqual([])
  })

  it('adds ceil(config attack * ratio / 100) to a weapon: i250104 +1 → +2/+2, +12 → +21/+25', () => {
    expect(inscriptionProps(i250104, 1, INSCRIBE_LEVELS)).toEqual([
      { name: 'MaxAtkEquip', value: 2 },
      { name: 'MinAtkEquip', value: 2 },
    ])
    expect(inscriptionProps(i250104, 12, INSCRIBE_LEVELS)).toEqual([
      { name: 'MaxAtkEquip', value: 25 },
      { name: 'MinAtkEquip', value: 21 },
    ])
  })

  it('adds ceil(Defense * ratio / 100) to armour', () => {
    // i220102 Defense 34, +12 ratio 60: 20.4 → 21.
    expect(inscriptionProps(i220102, 12, INSCRIBE_LEVELS)).toEqual([
      { name: 'DefenseEquip', value: 21 },
    ])
  })

  it('quirk ported: rings and amulets keep the level but gain no bonus', () => {
    expect(inscriptionProps({ ...i220102, EquipBaseType: 3 }, 12, INSCRIBE_LEVELS)).toEqual([])
  })
})
