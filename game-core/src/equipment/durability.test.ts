import { describe, expect, it } from 'vitest'
import { repairCost, reviveDurabilityLoss, wearDurability } from './durability.js'
import { IDENTIFY_PROPS, i220102, i250104, i281607 } from './fixtures.js'

const worn = (durability: number, props: { propId: number; value: number }[] = []) => ({
  durability,
  props,
})

describe('wearDurability (HardinessSystem.CanDecHardiness / DecEquipHardiness)', () => {
  it('takes the loss off equipped gear: 1 per enemy killed in a won fight', () => {
    expect(wearDurability(i250104, worn(130), 3, IDENTIFY_PROPS)).toBe(127)
  })

  it('stops at zero', () => {
    expect(wearDurability(i250104, worn(2), 5, IDENTIFY_PROPS)).toBe(0)
    expect(wearDurability(i250104, worn(0), 1, IDENTIFY_PROPS)).toBe(0)
  })

  it('never wears UnDecHardiness items (rings and amulets)', () => {
    expect(wearDurability(i281607, worn(1), 1, IDENTIFY_PROPS)).toBe(1)
  })

  it('never wears items without durability (Reborn wings and auras have no MaxHardiness)', () => {
    expect(wearDurability({}, worn(1), 1, IDENTIFY_PROPS)).toBe(1)
  })

  it('never wears items with the IsDecHardEquip property', () => {
    const noWear = worn(50, [{ propId: 772, value: 1 }])
    expect(wearDurability(i250104, noWear, 10, IDENTIFY_PROPS)).toBe(50)
  })
})

describe('reviveDurabilityLoss (ReliveSystem 77-95, relive.ini dechardinessmul 5)', () => {
  it('is (int)(MaxHardiness * 5 / 100)', () => {
    expect(reviveDurabilityLoss(i250104)).toBe(6) // 130 → 6.5
    expect(reviveDurabilityLoss(i220102)).toBe(5)
  })
})

describe('repairCost (HardinessSystem.QueryRepairItemPrice 239-255)', () => {
  it('matches the spec: L 1 fully broken (Max 100) → 123, L 30 half broken → 97', () => {
    expect(repairCost({ UseLevel: 1, MaxHardiness: 100 }, 0)).toBe(123)
    expect(repairCost({ UseLevel: 30, MaxHardiness: 100 }, 50)).toBe(97)
  })

  it('charges nothing for undamaged, unbreakable or max-0 items', () => {
    expect(repairCost(i220102, 100)).toBe(0)
    expect(repairCost(i281607, 0)).toBe(0)
    expect(repairCost({ UseLevel: 10, MaxHardiness: 0 }, 0)).toBe(0)
  })

  it('charges the +1 even for one missing point', () => {
    // i220102 L13: (1/100) * (-1.521 + 35.1 + 120) = 1.53 → 1, + 1.
    expect(repairCost(i220102, 99)).toBe(2)
  })
})
