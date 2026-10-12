/**
 * Data shapes of the equipment rules. Config rows keep the original field names of the imported
 * JSON in server/data/game (docs/original-data/blacksmith.md, equipment-sets.md).
 */

/** EquipItem fields of items.json (item.ini). Missing numbers count as 0. */
export interface EquipConfig {
  /** 1 weapon, 2 armour, 3 ring or amulet. */
  EquipBaseType?: number
  AttackMin?: number
  AttackMax?: number
  Defense?: number
  ConsolidateMaxLevel?: number
  /** Flat max HP per enhance level on armour. */
  ConsolidateRate?: number
  MaxHardiness?: number
  /** 1 = durability never drops and cannot be repaired. */
  UnDecHardiness?: number
  UseLevel?: number
  /** Job bitmask: 1 Blunt, 2 Sharp, 4 Fists. */
  UsePopsinger?: number
  /** 2 = any. */
  Sex?: number
  SuitID?: number
  /** `;`-separated names and values (AddOtherProp). */
  OtherPropName?: string
  OtherPropValue?: string | number
}

/** A rolled identify property as stored (`IdentifyPropRec` without the derived name). */
export interface RolledProp {
  propId: number
  value: number
}

/** Per-item state stored in inventory_items (migration 0004). */
export interface EquipInstance {
  /** ConsolidateLevel 0-12. */
  enhanceLevel: number
  /** EquipInscribeLevel 0-12. */
  inscribeLevel: number
  /** Hardiness. */
  durability: number
  /** EquipCanIdentify. */
  canIdentify: boolean
  /** EquipIdentifyPropCount 0-4. */
  identifyCount: number
  /** EquipIdentifyTimes; 1 or more = appraised. */
  identifyTimes: number
  /** IdentifyPropRec rows in order. */
  props: RolledProp[]
  /** Row of the engraved (ImpressIdentRec) property, if any. */
  engravedSlot: number | null
}

/** A `<Name>Equip` property and its value, one entry of GetEquipTotalProp's list. */
export interface PropRow {
  name: string
  value: number
}

/** identify-props.json (IdentifyPropLib.ini), keyed by prop id. */
export interface IdentifyProp {
  PropName: string
  PropMinValue: number
  PropMaxValue: number
}
export type IdentifyProps = Readonly<Record<string, IdentifyProp>>

/** equip-props.json (EquipPropDefine.ini): 0 summed stat, 1 AddSkill, 2 EffectSkill, 3 flag. */
export interface EquipPropDefine {
  PropName: string
  PropType: number
}
export type EquipPropDefines = Readonly<Record<string, EquipPropDefine>>

/** inscribe-levels.json (EquipInscribe.ini), keyed by the current level. */
export interface InscribeRow {
  AddAtkRatio: number
  AddDefenseRatio: number
  AddLevel: number
  BaseOdds: number
  FailLevel: number
  HighSealMaxNum: number
  LowSealMaxNum: number
  StoneCost: number
}
export type InscribeLevels = Readonly<Record<string, InscribeRow>>

/** Tables every item's stat list needs. */
export interface EquipTables {
  propDefines: EquipPropDefines
  identifyProps: IdentifyProps
  inscribeLevels: InscribeLevels
  /** equipPropConfig.ini `ConsolidateEquipFatcor` (5). */
  enhanceFactor: number
}

/** Java `(float)` casts. */
export const float = Math.fround
