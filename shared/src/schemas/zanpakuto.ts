// Zanpakuto (Reborn village icon, level 61): GET /api/game/zanpakuto and its actions. Every action
// answers with the whole ZanpakutoView. Tables and rules live in game-core/src/zanpakuto.
import { z } from 'zod'

const crystalId = z.string().uuid()

export const zanpakutoCrystalBodySchema = z.object({ id: crystalId }).strict()
export const zanpakutoSlotUnlockBodySchema = z
  .object({
    slot: z.number().int().min(0).max(15),
    currency: z.enum(['stones', 'coupons']),
  })
  .strict()
/** position 1 activates stat 2, position 2 stat 3. */
export const zanpakutoAttributeBodySchema = z
  .object({ id: crystalId, position: z.union([z.literal(1), z.literal(2)]) })
  .strict()
export const zanpakutoBulkApplyBodySchema = z
  .object({
    id: crystalId,
    index: z.number().int().min(0).max(9),
    /** Stat indexes kept as they are. */
    locks: z.array(z.number().int().min(0).max(2)).max(2),
  })
  .strict()

export type ZanpakutoTabName = 'sharp' | 'blunt' | 'fist'
/** [stat id, raw value]. */
export type ZanpakutoStat = [stat: number, value: number]

export interface ZanpakutoCrystal {
  id: string
  iid: number
  name: string
  /** Icon path under icons/items. */
  icon: string
  /** 0 Blue, 1 Purple, 2 Orange. */
  category: 0 | 1 | 2
  tab: ZanpakutoTabName
  /** 1-6: the weapon slot it equips into. */
  position: number
  /** Spirit Coins when sold. */
  coins: number
  stats: ZanpakutoStat[]
  /** Pending Bulk Refine options (empty when none are open). */
  bulkOptions: ZanpakutoStat[][]
}

export interface ZanpakutoView {
  /** Spirit Coins (SC). */
  coins: number
  freeRefines: number
  /** 16 spirit slots: the crystal, or null when empty. */
  spirit: (ZanpakutoCrystal | null)[]
  lockedSlots: number[]
  /** 6 slots per weapon tab. */
  tabs: Record<ZanpakutoTabName, (ZanpakutoCrystal | null)[]>
  /** Weapon slot indexes still locked behind Impel Down floors. */
  lockedWeaponSlots: number[]
  /** The tab the worn outfit's weapon class activates. */
  activeTab: ZanpakutoTabName
}
