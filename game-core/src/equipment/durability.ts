// Durability and repair (HardinessSystem.java; docs/original-data/blacksmith.md "Durability").
import { float, type EquipConfig, type EquipInstance, type IdentifyProps } from './types.js'

/** relive.ini `dechardinessmul`: percent of MaxHardiness lost on a revive at home. */
export const REVIVE_DURABILITY_PERCENT = 5

/** Identify property that stops durability loss (EquipPropDefine PropType 3). */
const NO_WEAR_PROP = 'IsDecHardEquip'

/**
 * CanDecHardiness (184-196) and DecEquipHardiness (281-287): equipped items lose `loss` points
 * (1 per enemy killed in a won fight, or reviveDurabilityLoss), floored at 0. Items with
 * UnDecHardiness, already broken, or with an IsDecHardEquip property keep their durability.
 */
export function wearDurability(
  config: EquipConfig,
  item: Pick<EquipInstance, 'durability' | 'props'>,
  loss: number,
  identifyProps: IdentifyProps,
): number {
  const noWear =
    config.UnDecHardiness === 1 ||
    item.durability <= 0 ||
    item.props.some((p) => identifyProps[p.propId]?.PropName === NO_WEAR_PROP)
  return noWear ? item.durability : Math.max(0, item.durability - loss)
}

/** DeathDecEquipHardiness (155-167): `(int)((float)MaxHardiness * 5 / 100f)`. */
export function reviveDurabilityLoss(config: EquipConfig): number {
  return Math.trunc(float(float((config.MaxHardiness ?? 0) * REVIVE_DURABILITY_PERCENT) / 100))
}

/**
 * Repair cost in Stone (QueryRepairItemPrice 239-255), L = UseLevel:
 * `(int)((Max - Cur) / Max * (-0.009 * L^2 + 2.7 * L + 120)) + 1`; 0 when nothing to repair.
 */
export function repairCost(config: EquipConfig, durability: number): number {
  const max = config.MaxHardiness ?? 0
  if (config.UnDecHardiness === 1 || max <= 0 || durability >= max) return 0
  const level = config.UseLevel ?? 0
  const damaged = float(float(max - durability) / float(max))
  const scale = -0.009 * level ** 2 + float(float(2.7) * level) + 120
  return Math.trunc(damaged * scale) + 1
}
