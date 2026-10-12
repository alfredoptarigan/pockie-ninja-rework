// Test data copied from the original tables (docs/original-data/blacksmith.md, equipment-sets.md).
import type { Random } from '../random.js'
import type {
  EquipConfig,
  EquipPropDefines,
  IdentifyProps,
  InscribeLevels,
  InscribeRow,
} from './types.js'

/** A Random whose draws return `values` in turn (the last one repeats). */
export function fixedRandom(...values: number[]): Random {
  let i = 0
  const draw = () => values[Math.min(i++, values.length - 1)]!
  return { next: draw, int: draw, between: draw }
}

/** equipPropConfig.ini line 7. */
export const ENHANCE_FACTOR = 5

/** ConsolidateFailRate.ini, section = target level. */
export const FAIL_RATES = Object.fromEntries(
  [0, 33, 56, 70, 80, 87, 91, 94, 96, 97, 98, 99].map((rate, i) => [
    String(i + 1),
    { FailRate: rate },
  ]),
)

/** item.ini i250104 Mythbeast Bat (weapon, Blunt). */
export const i250104: EquipConfig = {
  AttackMin: 34,
  AttackMax: 41,
  ConsolidateMaxLevel: 12,
  Defense: 0,
  EquipBaseType: 1,
  MaxHardiness: 130,
  Sex: 2,
  SuitID: 0,
  UnDecHardiness: 0,
  UseLevel: 16,
  UsePopsinger: 1,
}

/** item.ini i220102 (hat). */
export const i220102: EquipConfig = {
  AttackMin: 0,
  AttackMax: 0,
  ConsolidateMaxLevel: 12,
  ConsolidateRate: 4,
  Defense: 34,
  EquipBaseType: 2,
  MaxHardiness: 100,
  Sex: 2,
  SuitID: 0,
  UnDecHardiness: 0,
  UseLevel: 13,
  UsePopsinger: 7,
}

/** item.ini i298001 (Dragon Soul weapon, Sharp, with an OtherProp). */
export const i298001: EquipConfig = {
  AttackMin: 59,
  AttackMax: 71,
  ConsolidateMaxLevel: 12,
  Defense: 0,
  EquipBaseType: 1,
  MaxHardiness: 500,
  OtherPropName: 'AbsAddAtkMulEquip',
  OtherPropValue: 50,
  Sex: 2,
  SuitID: 8664,
  UseLevel: 21,
  UsePopsinger: 2,
}

/** item.ini i281601-07: Oracle Outfit (set 8160), Cloth Hat Shoes Amulet Glove Girdle Ring. */
const oracle = (EquipBaseType: number, Defense: number, UseLevel: number): EquipConfig => ({
  AttackMin: 0,
  AttackMax: 0,
  ConsolidateMaxLevel: EquipBaseType === 3 ? 0 : 12,
  ConsolidateRate: 5,
  Defense,
  EquipBaseType,
  MaxHardiness: EquipBaseType === 3 ? 1 : 200,
  Sex: 2,
  SuitID: 8160,
  UnDecHardiness: EquipBaseType === 3 ? 1 : 0,
  UseLevel,
  UsePopsinger: 7,
})
export const i281601 = oracle(2, 119, 17)
export const i281602 = oracle(2, 34, 13)
export const i281603 = oracle(2, 28, 15)
export const i281604 = oracle(3, 0, 14)
export const i281605 = oracle(2, 30, 18)
export const i281606 = oracle(2, 25, 19)
export const i281607 = oracle(3, 0, 20)

export const appraised = { canIdentify: false, identifyTimes: 0 }

const inscribeRow = (
  level: number,
  ratio: number,
  BaseOdds: number,
  FailLevel: number,
  StoneCost: number,
): InscribeRow => ({
  AddAtkRatio: ratio,
  AddDefenseRatio: ratio,
  AddLevel: level + 1,
  BaseOdds,
  FailLevel,
  HighSealMaxNum: 3,
  LowSealMaxNum: 3,
  StoneCost,
})

/** EquipInscribe.ini, section = current level. */
export const INSCRIBE_LEVELS: InscribeLevels = Object.fromEntries(
  [
    [3, 94, 0, 60],
    [6, 78, 1, 120],
    [10, 68, 2, 180],
    [14, 58, 3, 240],
    [18, 48, 4, 320],
    [23, 35, 4, 400],
    [28, 24, 4, 480],
    [33, 12, 4, 600],
    [39, 8, 8, 720],
    [45, 6, 8, 840],
    [52, 4, 8, 1000],
    [60, 3, 8, 1200],
  ].map(([ratio, odds, fail, stone], level) => [
    String(level),
    inscribeRow(level, ratio!, odds!, fail!, stone!),
  ]),
)

/** SealOdds.ini. */
export const SEAL_ODDS = { LowOdds: 3, HighOdds: 6 }

/** IdentifyPropLib.ini rows from groups 1001 (newbie weapons) and 2001 (gold). */
export const IDENTIFY_PROPS: IdentifyProps = {
  '1': { PropName: 'StrengthEquip', PropMinValue: 2800, PropMaxValue: 3400 },
  '21': { PropName: 'AgilityEquip', PropMinValue: 2800, PropMaxValue: 3400 },
  '41': { PropName: 'StaminaEquip', PropMinValue: 2800, PropMaxValue: 3400 },
  '61': { PropName: 'DefenseEquip', PropMinValue: 30, PropMaxValue: 37 },
  '201': { PropName: 'AbsAddAtkMulEquip', PropMinValue: 23, PropMaxValue: 29 },
  '261': { PropName: 'MaxMPMulEquip', PropMinValue: 23, PropMaxValue: 29 },
  '381': { PropName: 'StrengthEquip', PropMinValue: 3600, PropMaxValue: 4400 },
  '764': { PropName: 'ParryMulMulEquip', PropMinValue: 18, PropMaxValue: 22 },
  '765': { PropName: 'PierceMulEquip', PropMinValue: 18, PropMaxValue: 22 },
  '766': { PropName: 'ToughMulEquip', PropMinValue: 18, PropMaxValue: 22 },
  '772': { PropName: 'IsDecHardEquip', PropMinValue: 1, PropMaxValue: 1 },
}

/** EquipPropDefine.ini (58 rows; names trimmed). */
export const PROP_DEFINES: EquipPropDefines = Object.fromEntries(
  [
    'StrengthEquip AgilityEquip StaminaEquip MaxHPEquip MaxMPEquip AtkTimeEquip MaxHPMulEquip',
    'MaxMPMulEquip MinAtkEquip MaxAtkEquip DodgeMulEquip HitMulEquip CritMulEquip CritAttachEquip',
    'NeglectDefAttachEquip ParryMulEquip PierceEquip DefenseEquip AtkTimeMulEquip',
    'CounterBombMulEquip VampiricHPEquip DecDamageEquip AbsorptionDamageEquip ReboundAttachEquip',
    'PriorityMulEquip CounterMulEquip ToughEquip LuckEquip AbsAddAtkEquip AbsAddAtkMulEquip',
    'MinAtkMulEquip MaxAtkMulEquip DodgeMulMulEquip HitMulMulEquip CritMulMulEquip',
    'NeglectDefMulEquip ParryMulMulEquip PierceMulEquip DefenseMulEquip ToughMulEquip',
    'SkillAdd0Equip SkillAdd1Equip SkillAdd2Equip SkillAdd3Equip SkillAdd4Equip SkillAdd5Equip',
    'SkillAdd6Equip SkillAdd7Equip SkillAdd8Equip SkillAdd9Equip SkillAddAllEquip ExpMulEquip',
    'CapMulEquip DropMulEquip UseSkillMPOdds',
  ]
    .join(' ')
    .split(' ')
    .map((name) => ({ PropName: name, PropType: 0 }))
    .concat([
      { PropName: 'AddSkillEquip', PropType: 1 },
      { PropName: 'EffectSkillEquip', PropType: 2 },
      { PropName: 'IsDecHardEquip', PropType: 3 },
    ])
    .map((row, i) => [String(i), row]),
)
