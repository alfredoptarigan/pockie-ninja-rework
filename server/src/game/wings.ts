// Fight bonuses of the worn wing or aura (M6 decisions 22-23). Lives in game/ so combat.ts and
// snapshot.ts do not import the wings routes.
import { and, eq } from 'drizzle-orm'
import type { Bonuses } from '@pockie/game-core'
import { wingStats } from '../../../game-core/src/wings/stats.js'
import type { Db } from '../db/client.js'
import { inventoryItems } from '../db/schema.js'
import { wornItemsWhere } from './bag.js'
import type { Tx } from './progress.js'

export const WING_SLOT = 'Wing'

/** `Partial<Bonuses>` of the wing or aura in the Wing slot; `{}` when the slot is empty. */
export async function wingBonuses(tx: Tx | Db, characterId: string): Promise<Partial<Bonuses>> {
  const [worn] = await tx
    .select({ itemId: inventoryItems.itemId, level: inventoryItems.enhanceLevel })
    .from(inventoryItems)
    .where(and(wornItemsWhere(characterId), eq(inventoryItems.equippedSlot, WING_SLOT)))
    .limit(1)
  return worn ? wingStats(worn.itemId, worn.level) : {}
}
