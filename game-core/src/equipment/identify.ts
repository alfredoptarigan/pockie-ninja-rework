// Appraise and Refine (IdentifySystem.java; docs/original-data/blacksmith.md "Appraise and Refine").
import type { EquipInstance } from './types.js'

/** IsEquipIdentifyed (178-185): `CanIdentify != 1 || IdentifyTimes >= 1`. */
export function isAppraised(item: Pick<EquipInstance, 'canIdentify' | 'identifyTimes'>): boolean {
  return !item.canIdentify || item.identifyTimes >= 1
}
