// Enhance (ConsolidateSystem.java; docs/original-data/blacksmith.md "Enhance").
import type { Random } from '../random.js'
import { isAppraised } from './identify.js'
import { float, type EquipConfig, type EquipInstance } from './types.js'

/** enhance-fail-rates.json (ConsolidateFailRate.ini), section = target level. */
export type EnhanceFailRates = Readonly<Record<string, { FailRate: number }>>

const WEAPON = 1
const ARMOUR = 2

/**
 * CanBaseConsolidateEquip (88-114): weapon or armour, appraised, below ConsolidateMaxLevel and a
 * fail-rate row for the next level. Currency and talisman checks are the caller's.
 */
export function canEnhance(
  config: EquipConfig,
  item: Pick<EquipInstance, 'enhanceLevel' | 'canIdentify' | 'identifyTimes'>,
  failRates: EnhanceFailRates,
): boolean {
  const baseType = config.EquipBaseType ?? 0
  return (
    (baseType === WEAPON || baseType === ARMOUR) &&
    isAppraised(item) &&
    item.enhanceLevel < (config.ConsolidateMaxLevel ?? 0) &&
    failRates[item.enhanceLevel + 1] !== undefined
  )
}

/**
 * One attempt (176, 215): `RandInt(0, 100) <= 100 - FailRate[level + 1]` succeeds, so the chance is
 * `(101 - F) / 101`. A failure spends the cost and keeps the level.
 */
export function rollEnhance(
  level: number,
  failRates: EnhanceFailRates,
  random: Random,
): { success: boolean; level: number } {
  const row = failRates[level + 1]
  if (!row) throw new Error(`No enhance fail rate for level ${level + 1}`)
  const success = 100 - row.FailRate >= random.between(0, 100)
  return { success, level: success ? level + 1 : level }
}

/**
 * Weapon attack at an enhance level (SetConsolidatedPropValue 116-133, float math as in Java):
 * `m = (AttackMin + AttackMax) / 2 * (1 + L * factor / 100)`, min `(int)(m * 0.9)`, max
 * `(int)(m * 1.1)`. +0 keeps the config values.
 */
export function enhancedAttack(
  config: EquipConfig,
  level: number,
  factor: number,
): { min: number; max: number } {
  const min = config.AttackMin ?? 0
  const max = config.AttackMax ?? 0
  if (level === 0) return { min, max }
  const mean = float(float(float(min + max) / 2) * float(1 + float((level * factor) / 100)))
  return { min: Math.trunc(mean * 0.9), max: Math.trunc(mean * 1.1) }
}

/** Armour `ConsolidatedMaxHP = L * ConsolidateRate` (flat, 130); weapons get none. */
export function enhancedMaxHp(config: EquipConfig, level: number): number {
  return config.EquipBaseType === ARMOUR ? level * (config.ConsolidateRate ?? 0) : 0
}
