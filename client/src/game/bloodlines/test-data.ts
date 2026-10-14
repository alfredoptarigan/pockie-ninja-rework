// Bloodline API fixtures shared by the Ninja House, Bloodline Limits and souls tests.
import type { BloodlineLimit, BloodlinesView } from '../../../../shared/src/schemas/bloodlines'

/** Limit `id` as GET /api/game/bloodlines lists it (four limits per required level band). */
export const limit = (id: number, extra: Partial<BloodlineLimit> = {}): BloodlineLimit => ({
  limitId: id,
  nameKey: `reborn_limit_${id}`,
  npcId: 81000 + id,
  npcNameKey: `reborn_npc_${81000 + id}`,
  requiredLevel: 16 + 5 * Math.floor((id - 1) / 4),
  unlockItem: 'i148023',
  dropLevel: 16,
  itemsHeld: 0,
  amity: 0,
  amityNeeded: 30,
  unlocked: false,
  active: false,
  stats: [
    { field: 'strength', label: 'Strength', value: 2300 },
    { field: 'skillAdd5', label: 'Body Skill Cast Chance %', value: 2 },
    { field: 'hpMul', label: 'Max Health %', value: 125 },
  ],
  ...extra,
})

/** All 44 limits; `changes` overrides fields of some of them by id. */
export const bloodlinesView = (
  changes: Record<number, Partial<BloodlineLimit>> = {},
  extra: Partial<BloodlinesView> = {},
): BloodlinesView => ({
  turnInsUsed: 3,
  turnInsPerDay: 10,
  itemsPerTurnIn: 4,
  amityPerTurnIn: 30,
  maxActive: 3,
  resetAt: new Date(Date.now() + 60000).toISOString(),
  bonuses: [],
  limits: Array.from({ length: 44 }, (_, i) => limit(i + 1, changes[i + 1])),
  ...extra,
})
