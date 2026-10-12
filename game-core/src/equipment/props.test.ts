import { describe, expect, it } from 'vitest'
import {
  ENHANCE_FACTOR,
  IDENTIFY_PROPS,
  INSCRIBE_LEVELS,
  PROP_DEFINES,
  i220102,
  i250104,
  i298001,
} from './fixtures.js'
import { equipBonuses, equipItemProps, isEquipActive, sumEquipProps } from './props.js'
import type { EquipTables } from './types.js'

const tables: EquipTables = {
  propDefines: PROP_DEFINES,
  identifyProps: IDENTIFY_PROPS,
  inscribeLevels: INSCRIBE_LEVELS,
  enhanceFactor: ENHANCE_FACTOR,
}
const plain = { enhanceLevel: 0, inscribeLevel: 0, props: [] }

describe('isEquipActive (EquipSystem.CheckEquipEffect 339-355)', () => {
  const blunt = { popsinger: 1, sex: 0 }
  it('needs durability above 0', () => {
    expect(isEquipActive(i250104, 1, blunt)).toBe(true)
    expect(isEquipActive(i250104, 0, blunt)).toBe(false)
  })

  it('needs the job bitmask to match', () => {
    expect(isEquipActive(i250104, 130, { popsinger: 4, sex: 0 })).toBe(false)
    expect(isEquipActive(i220102, 100, { popsinger: 4, sex: 0 })).toBe(true)
  })

  it('needs the sex to match unless the item is for both (2)', () => {
    expect(isEquipActive({ ...i250104, Sex: 1 }, 130, blunt)).toBe(false)
    expect(isEquipActive({ ...i250104, Sex: 0 }, 130, blunt)).toBe(true)
  })

  it('does not check the level', () => {
    expect(isEquipActive({ ...i250104, UseLevel: 90 }, 130, blunt)).toBe(true)
  })
})

describe('equipItemProps (EquipSystem.GetEquipTotalProp 294-300)', () => {
  it('lists base, identify and inscription rows in that order', () => {
    const rows = equipItemProps(
      i250104,
      { enhanceLevel: 1, inscribeLevel: 12, props: [{ propId: 1, value: 3000 }] },
      tables,
    )
    expect(rows).toEqual([
      { name: 'MinAtkEquip', value: 35 },
      { name: 'MaxAtkEquip', value: 43 },
      { name: 'DefenseEquip', value: 0 },
      { name: 'MaxHPEquip', value: 0 },
      { name: 'StrengthEquip', value: 3000 },
      { name: 'MaxAtkEquip', value: 25 },
      { name: 'MinAtkEquip', value: 21 },
    ])
  })

  it('gives enhanced armour flat HP and keeps its defence', () => {
    expect(equipItemProps(i220102, { ...plain, enhanceLevel: 3 }, tables)).toEqual([
      { name: 'MinAtkEquip', value: 0 },
      { name: 'MaxAtkEquip', value: 0 },
      { name: 'DefenseEquip', value: 34 },
      { name: 'MaxHPEquip', value: 12 },
    ])
  })

  it('adds the item.ini OtherProp pairs after the base (AddOtherProp 245-265)', () => {
    expect(equipItemProps(i298001, plain, tables).slice(4)).toEqual([
      { name: 'AbsAddAtkMulEquip', value: 50 },
    ])
  })

  it('ignores the OtherProp list when the counts differ, and unknown names', () => {
    const mismatched = { ...i298001, OtherPropName: 'HitMulEquip;CritMulEquip', OtherPropValue: 5 }
    expect(equipItemProps(mismatched, plain, tables)).toHaveLength(4)
    const unknown = {
      ...i298001,
      OtherPropName: 'AddSkillComeOdds;HitMulEquip',
      OtherPropValue: '200;8',
    }
    expect(equipItemProps(unknown, plain, tables).slice(4)).toEqual([
      { name: 'HitMulEquip', value: 8 },
    ])
  })
})

describe('sumEquipProps (EquipSystem.SetPlayerEquipProp 321-336)', () => {
  it('sums PropType 0 names and drops the rest', () => {
    const totals = sumEquipProps(
      [
        { name: 'MinAtkEquip', value: 35 },
        { name: 'MinAtkEquip', value: 21 },
        { name: 'IsDecHardEquip', value: 1 },
        { name: 'EffectSkillEquip', value: 1 },
        { name: 'AddSkillComeOdds', value: 200 },
      ],
      PROP_DEFINES,
    )
    expect(totals).toEqual({ MinAtkEquip: 56 })
  })

  it('accepts the untrimmed names of EquipPropDefine.ini', () => {
    const defines = { '0': { PropName: 'ToughEquip ', PropType: 0 } }
    expect(sumEquipProps([{ name: 'ToughEquip', value: 4 }], defines)).toEqual({ ToughEquip: 4 })
  })
})

describe('equipBonuses (RefreshSystem.java 283-393)', () => {
  it('maps every summed prop to its stat term', () => {
    expect(
      equipBonuses({
        StrengthEquip: 3000,
        MaxHPEquip: 12,
        DodgeMulEquip: 34,
        DodgeMulMulEquip: 20,
        CritMulMulEquip: 18,
        NeglectDefMulEquip: 19,
        PierceEquip: 51,
        DecDamageEquip: 7,
        AbsorptionDamageEquip: 3,
        ReboundAttachEquip: 4,
        SkillAdd0Equip: 3000,
        ExpMulEquip: 10,
      }),
    ).toEqual({
      strength: 3000,
      hp: 12,
      dodge: 34,
      dodgeMul: 20,
      critMul: 18,
      neglectDefenseMul: 19,
      pierce: 51,
      decDamage: 7,
      absorb: 3,
      rebound: 4,
      skillAdd0: 3000,
      expMul: 10,
    })
  })

  it('adds AbsAddAtk to both attacks and AbsAddAtkMul to both multipliers (293-296)', () => {
    expect(
      equipBonuses({ MinAtkEquip: 35, MaxAtkEquip: 43, AbsAddAtkEquip: 4, AbsAddAtkMulEquip: 50 }),
    ).toEqual({ minAttack: 39, maxAttack: 47, attackMul: 50 })
  })

  it('drops props no formula reads (AtkTimeEquip, UseSkillMPOdds)', () => {
    expect(equipBonuses({ AtkTimeEquip: 100, UseSkillMPOdds: 1500 })).toEqual({})
  })
})
