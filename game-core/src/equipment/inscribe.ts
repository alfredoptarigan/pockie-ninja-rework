// Inscription (InscribeSystem.java; docs/original-data/blacksmith.md "Inscription").
import type { Random } from '../random.js'
import {
  ARMOUR,
  WEAPON,
  float,
  type EquipConfig,
  type InscribeLevels,
  type InscribeRow,
  type PropRow,
} from './types.js'

/** InscribeSystem.m_InscribeMaxLevel. */
export const INSCRIBE_MAX_LEVEL = 12

/** Client seal type 0 Low (i161008) or 1 High (i161009). */
export type SealType = 'low' | 'high'

/** SealOdds.ini `[SealOdds]` (LowOdds 3, HighOdds 6). */
export interface SealOdds {
  LowOdds: number
  HighOdds: number
}

const SURE_ODDS = 100

const sealOdds = (seals: SealOdds, type: SealType) =>
  type === 'low' ? seals.LowOdds : seals.HighOdds
const sealMax = (row: InscribeRow, type: SealType) =>
  type === 'low' ? row.LowSealMaxNum : row.HighSealMaxNum

/** The EquipInscribe.ini row for the current level; none at +12 (OnTestAdd 56-74). */
export function inscribeRow(levels: InscribeLevels, level: number): InscribeRow | undefined {
  return level < INSCRIBE_MAX_LEVEL ? levels[level] : undefined
}

/**
 * Seals spent (UseMaxNumSeal 158-176): `min(requested, row max, owned,
 * ceil((100 - BaseOdds) / SealOdds))`. The caller refuses when the player owns 0 of that seal.
 */
export function inscribeSealsUsed(
  row: InscribeRow,
  seals: SealOdds,
  type: SealType,
  requested: number,
  owned: number,
): number {
  const odds = sealOdds(seals, type)
  if (odds === SURE_ODDS) return 0
  const useful = Math.ceil((SURE_ODDS - row.BaseOdds) / odds)
  // Exploit fix: the original passed a negative request on to RemoveItemCount.
  return Math.max(0, Math.min(requested, sealMax(row, type), owned, useful))
}

/**
 * One attempt (AddEquipInfo 178-186): `RandInt(0, 100) <= BaseOdds + SealOdds * used` reaches
 * AddLevel, otherwise the level drops to FailLevel. Stone and seals are spent either way.
 */
export function rollInscribe(
  row: InscribeRow,
  seals: SealOdds,
  type: SealType,
  sealsUsed: number,
  random: Random,
): { success: boolean; level: number } {
  const success = random.between(0, 100) <= row.BaseOdds + sealOdds(seals, type) * sealsUsed
  return { success, level: success ? row.AddLevel : row.FailLevel }
}

/** `(int)Math.ceil((float)(value * ratio) / 100.0f)`. */
const bonus = (value: number, ratio: number) => Math.ceil(float(float(value * ratio) / 100))

/**
 * InscribeRec rows for a level (InscribeSucc / InscribeFail 232-308): level k uses row k-1's
 * ratio on the config values, so Enhance does not compound. Weapons get MaxAtk then MinAtk,
 * armour Defense. Rings and amulets keep the level but gain nothing (no case in the switch).
 */
export function inscriptionProps(
  config: EquipConfig,
  level: number,
  levels: InscribeLevels,
): PropRow[] {
  const row = level > 0 ? levels[level - 1] : undefined
  if (!row) return []
  if (config.EquipBaseType === WEAPON) {
    return [
      { name: 'MaxAtkEquip', value: bonus(config.AttackMax ?? 0, row.AddAtkRatio) },
      { name: 'MinAtkEquip', value: bonus(config.AttackMin ?? 0, row.AddAtkRatio) },
    ]
  }
  if (config.EquipBaseType === ARMOUR) {
    return [{ name: 'DefenseEquip', value: bonus(config.Defense ?? 0, row.AddDefenseRatio) }]
  }
  return []
}
