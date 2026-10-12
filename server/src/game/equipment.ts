// Equipped items as RefreshSystem bonuses (EquipSystem.RefreshEquipProperty + SuitEquipSystem),
// through game-core/equipment: base, item.ini extras, identify and inscription rows, set bonuses.
import {
  equipBonuses,
  equipmentTotals,
  type Bonuses,
  type EquipConfig,
  type EquippedItem,
} from '@pockie/game-core'
import { and, eq, isNotNull } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { characters, inventoryItems } from '../db/schema.js'
import { avatarStats, equipTables, item } from './data.js'
import type { Tx } from './progress.js'

type ItemRow = typeof inventoryItems.$inferSelect
/** What an equipped row contributes: its config id and the instance state the stats read. */
export type Gear = Pick<ItemRow, 'itemId'> &
  Partial<Pick<ItemRow, 'durability' | 'enhanceLevel' | 'inscribeLevel' | 'props'>>
type Wearer = Pick<typeof characters.$inferSelect, 'avatarId' | 'gender'>

export async function equippedGear(tx: Tx | Db, characterId: string): Promise<Gear[]> {
  return tx
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.characterId, characterId), isNotNull(inventoryItems.equippedSlot)))
}

/** A null durability column means full (or an item without durability), so the item is active. */
const durabilityOf = (gear: Gear, config: EquipConfig) =>
  gear.durability ?? Math.max(config.MaxHardiness ?? 0, 1)

/** deriveStats bonuses from the equipped rows; items without a config row are ignored. */
export function equipmentBonuses(equipped: readonly Gear[], wearer: Wearer): Partial<Bonuses> {
  const items = equipped.flatMap((gear): EquippedItem[] => {
    const config = item(gear.itemId) as EquipConfig | undefined
    if (!config) return []
    return [
      {
        config,
        item: {
          durability: durabilityOf(gear, config),
          enhanceLevel: gear.enhanceLevel ?? 0,
          inscribeLevel: gear.inscribeLevel ?? 0,
          props: gear.props ?? [],
        },
      },
    ]
  })
  const totals = equipmentTotals(
    items,
    { popsinger: avatarStats(wearer.avatarId).Popsinger, sex: wearer.gender },
    equipTables(),
  )
  return equipBonuses(totals)
}
