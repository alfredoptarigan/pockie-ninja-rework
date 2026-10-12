import { describe, expect, it } from 'vitest'
import {
  ENHANCE_FACTOR,
  IDENTIFY_PROPS,
  INSCRIBE_LEVELS,
  PROP_DEFINES,
  i250104,
  i281601,
  i281602,
  i281603,
  i281604,
  i281605,
  i281606,
  i281607,
} from './fixtures.js'
import { equipBonuses, sumEquipProps } from './props.js'
import {
  equipmentTotals,
  setBonusProps,
  setCounts,
  type EquipSuits,
  type EquippedItem,
} from './sets.js'
import type { EquipConfig } from './types.js'

/** SuitProp.ini rows of 8160 (Oracle), 8664 (Dragon Soul) and 8669 (Kage). */
const SUITS: EquipSuits = {
  '8160': [
    { Index: 2, PropName: 'StaminaEquip', PropValue: 2800 },
    { Index: 4, PropName: 'StrengthEquip', PropValue: 2800 },
    { Index: 7, PropName: 'AgilityEquip', PropValue: 2800 },
  ],
  '8664': [
    { Index: 3, PropName: 'CounterBombMulEquip', PropValue: 0 },
    { Index: 5, PropName: 'AbsorptionDamageEquip', PropValue: 0 },
    { Index: 8, PropName: 'SkillAddAllEquip', PropValue: 1500 },
  ],
  '8669': [
    { Index: 3, PropName: 'AddSkillComeOdds', PropValue: 200 },
    { Index: 5, PropName: 'UseSkillMPOdds', PropValue: 1500 },
    { Index: 8, PropName: 'SkillAddAllEquip', PropValue: 2000 },
  ],
}
const tables = {
  propDefines: PROP_DEFINES,
  identifyProps: IDENTIFY_PROPS,
  inscribeLevels: INSCRIBE_LEVELS,
  enhanceFactor: ENHANCE_FACTOR,
  suits: SUITS,
}
const ORACLE = [i281601, i281602, i281603, i281604, i281605, i281606, i281607]
const wearer = { popsinger: 1, sex: 0 }
const equip = (config: EquipConfig, durability = config.MaxHardiness ?? 1): EquippedItem => ({
  config,
  item: { durability, enhanceLevel: 0, inscribeLevel: 0, props: [] },
})
const oracleTotals = (pieces: number) =>
  equipmentTotals(
    ORACLE.slice(0, pieces).map((c) => equip(c)),
    wearer,
    tables,
  )

describe('setCounts (SuitEquipSystem.GetEquipBoxSuitIDType 60-82)', () => {
  it('counts pieces per SuitID and ignores items without a set', () => {
    expect(setCounts([i281601, i281602, i250104])).toEqual({ '8160': 2 })
  })
})

describe('setBonusProps (SuitEquipSystem.GetEquipBoxSuitProp 85-126)', () => {
  it('applies nothing for a single piece', () => {
    expect(setBonusProps({ '8160': 1 }, SUITS)).toEqual([])
  })

  it('stacks the 2-, 4- and 7-piece bonuses', () => {
    expect(setBonusProps({ '8160': 2 }, SUITS)).toEqual([{ name: 'StaminaEquip', value: 2800 }])
    expect(setBonusProps({ '8160': 6 }, SUITS)).toEqual([
      { name: 'StaminaEquip', value: 2800 },
      { name: 'StrengthEquip', value: 2800 },
    ])
    expect(setBonusProps({ '8160': 7 }, SUITS)).toEqual([
      { name: 'StaminaEquip', value: 2800 },
      { name: 'StrengthEquip', value: 2800 },
      { name: 'AgilityEquip', value: 2800 },
    ])
  })

  it('expands SkillAddAllEquip to SkillAdd0..4 (99-120)', () => {
    expect(setBonusProps({ '8664': 8 }, SUITS).slice(2)).toEqual(
      [0, 1, 2, 3, 4].map((i) => ({ name: `SkillAdd${i}Equip`, value: 1500 })),
    )
  })

  it('skips sets without bonus rows (10001, 10003)', () => {
    expect(setBonusProps({ '10001': 5 }, SUITS)).toEqual([])
  })
})

describe('equipmentTotals (EquipSystem.RefreshEquipProperty)', () => {
  it('adds item stats and the set bonus of a 2/4/7-piece Oracle Outfit', () => {
    expect(oracleTotals(2)).toMatchObject({ DefenseEquip: 119 + 34, StaminaEquip: 2800 })
    expect(oracleTotals(4)).toMatchObject({ StaminaEquip: 2800, StrengthEquip: 2800 })
    expect(oracleTotals(4).AgilityEquip).toBeUndefined()
    expect(oracleTotals(7)).toMatchObject({
      StaminaEquip: 2800,
      StrengthEquip: 2800,
      AgilityEquip: 2800,
      DefenseEquip: 119 + 34 + 28 + 30 + 25,
    })
  })

  it('a broken piece gives no stats and does not count toward its set', () => {
    const totals = equipmentTotals([equip(i281601), equip(i281602, 0)], wearer, tables)
    expect(totals.DefenseEquip).toBe(119)
    expect(totals.StaminaEquip).toBeUndefined()
  })

  it('a piece for another job does not count', () => {
    const weapon = equip(i250104)
    const totals = equipmentTotals([weapon], { popsinger: 4, sex: 0 }, tables)
    expect(totals).toEqual({})
  })

  it('quirk ported: Dragon Soul 3- and 5-piece bonuses are worth 0', () => {
    const totals = sumEquipProps(setBonusProps({ '8664': 5 }, SUITS), PROP_DEFINES)
    expect(equipBonuses(totals)).toEqual({
      counterBomb: 0,
      absorb: 0,
    })
  })

  it('quirk ported: Kage AddSkillComeOdds is dropped and UseSkillMPOdds feeds no stat', () => {
    const totals = sumEquipProps(setBonusProps({ '8669': 5 }, SUITS), PROP_DEFINES)
    expect(totals).toEqual({ UseSkillMPOdds: 1500 })
    expect(equipBonuses(totals)).toEqual({})
  })
})
