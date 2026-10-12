// How gear becomes stats (EquipSystem.java; docs/original-data/blacksmith.md "Equipment property
// model", equipment-sets.md "Stats from one item" and "Property names").
import { SKILL_ADD_COUNT, type Bonuses, type SkillAddKey } from '../stats.js'
import { enhancedAttack, enhancedMaxHp } from './enhance.js'
import { inscriptionProps } from './inscribe.js'
import {
  WEAPON,
  type EquipConfig,
  type EquipInstance,
  type EquipPropDefines,
  type EquipTables,
  type PropRow,
} from './types.js'

/** The wearer's fields CheckEquipEffect reads. */
export interface EquipWearer {
  /** Job bitmask (avatar Popsinger). */
  popsinger: number
  sex: number
}

/** ItemSex value for both sexes. */
const ANY_SEX = 2
/** EquipPropDefine PropType that SetPlayerEquipProp sums. */
const SUMMED = 0

/**
 * CheckEquipEffect (339-355): an equipped item counts only with durability above 0, a matching job
 * bit and sex. There is no level check.
 */
export function isEquipActive(config: EquipConfig, durability: number, wearer: EquipWearer) {
  const sex = config.Sex ?? ANY_SEX
  return (
    durability > 0 &&
    ((config.UsePopsinger ?? 0) & wearer.popsinger) > 0 &&
    (sex === ANY_SEX || sex === wearer.sex)
  )
}

const definedNames = (defines: EquipPropDefines, type?: number) =>
  new Set(
    Object.values(defines)
      .filter((row) => type === undefined || row.PropType === type)
      .map((row) => row.PropName.trim()),
  )

/** AddOtherProp (245-265): `;` pairs, all skipped when the counts differ, unknown names dropped. */
function otherProps(config: EquipConfig, defines: EquipPropDefines): PropRow[] {
  const names = config.OtherPropName ? config.OtherPropName.split(';') : []
  const values = config.OtherPropValue !== undefined ? String(config.OtherPropValue).split(';') : []
  if (names.length !== values.length) return []
  const known = definedNames(defines)
  return names.flatMap((name, i) => (known.has(name) ? [{ name, value: Number(values[i]) }] : []))
}

/**
 * GetEquipTotalProp (294-300) for one item: base (GetEquipSelfProp 233-243, with the enhanced
 * weapon attack and armour HP), item.ini extras, identify rows, inscription rows. Gems and
 * enchants are not in M3.
 */
export function equipItemProps(
  config: EquipConfig,
  item: Pick<EquipInstance, 'enhanceLevel' | 'inscribeLevel' | 'props'>,
  tables: EquipTables,
): PropRow[] {
  const attack =
    config.EquipBaseType === WEAPON
      ? enhancedAttack(config, item.enhanceLevel, tables.enhanceFactor)
      : { min: config.AttackMin ?? 0, max: config.AttackMax ?? 0 }
  const identify = item.props.flatMap(({ propId, value }) => {
    const prop = tables.identifyProps[propId]
    return prop ? [{ name: prop.PropName, value }] : []
  })
  return [
    { name: 'MinAtkEquip', value: attack.min },
    { name: 'MaxAtkEquip', value: attack.max },
    { name: 'DefenseEquip', value: config.Defense ?? 0 },
    { name: 'MaxHPEquip', value: enhancedMaxHp(config, item.enhanceLevel) },
    ...otherProps(config, tables.propDefines),
    ...identify,
    ...inscriptionProps(config, item.inscribeLevel, tables.inscribeLevels),
  ]
}

/** SetPlayerEquipProp (321-336): sums the rows whose name has PropType 0; drops the rest. */
export function sumEquipProps(rows: PropRow[], defines: EquipPropDefines): Record<string, number> {
  const summed = definedNames(defines, SUMMED)
  const totals: Record<string, number> = {}
  for (const { name, value } of rows) {
    if (summed.has(name)) totals[name] = (totals[name] ?? 0) + value
  }
  return totals
}

/**
 * `<Name>Equip` → the RefreshSystem term it feeds (283-393; equipment-sets.md "Property names").
 * AbsAddAtk adds to both attacks (293-294). AtkTimeEquip and UseSkillMPOdds are read nowhere.
 */
const BONUS_TERMS: Readonly<Record<string, readonly (keyof Bonuses)[]>> = {
  StrengthEquip: ['strength'],
  AgilityEquip: ['agility'],
  StaminaEquip: ['stamina'],
  MaxHPEquip: ['hp'],
  MaxMPEquip: ['mp'],
  MaxHPMulEquip: ['hpMul'],
  MaxMPMulEquip: ['mpMul'],
  MinAtkEquip: ['minAttack'],
  MaxAtkEquip: ['maxAttack'],
  AbsAddAtkEquip: ['minAttack', 'maxAttack'],
  MinAtkMulEquip: ['minAttackMul'],
  MaxAtkMulEquip: ['maxAttackMul'],
  AbsAddAtkMulEquip: ['attackMul'],
  AtkTimeMulEquip: ['atkTimeMul'],
  DodgeMulEquip: ['dodge'],
  DodgeMulMulEquip: ['dodgeMul'],
  HitMulEquip: ['hit'],
  HitMulMulEquip: ['hitMul'],
  CritMulEquip: ['crit'],
  CritMulMulEquip: ['critMul'],
  CritAttachEquip: ['critAttach'],
  NeglectDefAttachEquip: ['neglectDefense'],
  NeglectDefMulEquip: ['neglectDefenseMul'],
  ParryMulEquip: ['parry'],
  ParryMulMulEquip: ['parryMul'],
  PierceEquip: ['pierce'],
  PierceMulEquip: ['pierceMul'],
  DefenseEquip: ['defense'],
  DefenseMulEquip: ['defenseMul'],
  CounterBombMulEquip: ['counterBomb'],
  VampiricHPEquip: ['vampiricHp'],
  DecDamageEquip: ['decDamage'],
  AbsorptionDamageEquip: ['absorb'],
  ReboundAttachEquip: ['rebound'],
  PriorityMulEquip: ['priority'],
  CounterMulEquip: ['counter'],
  ToughEquip: ['tough'],
  ToughMulEquip: ['toughMul'],
  LuckEquip: ['luck'],
  ExpMulEquip: ['expMul'],
  CapMulEquip: ['capMul'],
  DropMulEquip: ['dropMul'],
  ...Object.fromEntries(
    Array.from({ length: SKILL_ADD_COUNT }, (_, i) => [
      `SkillAdd${i}Equip`,
      [`skillAdd${i}` as SkillAddKey],
    ]),
  ),
}

/** Equipment totals as deriveStats bonuses. */
export function equipBonuses(totals: Readonly<Record<string, number>>): Partial<Bonuses> {
  const bonuses: Partial<Bonuses> = {}
  for (const [name, value] of Object.entries(totals)) {
    for (const key of BONUS_TERMS[name] ?? []) bonuses[key] = (bonuses[key] ?? 0) + value
  }
  return bonuses
}
