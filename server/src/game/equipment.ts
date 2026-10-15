// Equipped items as RefreshSystem bonuses (EquipSystem.RefreshEquipProperty + SuitEquipSystem),
// through game-core/equipment: base, item.ini extras, identify, inscription, gem and enchant rows,
// set bonuses.
import {
  equipBonuses,
  equipmentTotals,
  type Bonuses,
  type EquipConfig,
  type EquippedItem,
} from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { characters, inventoryItems, outfitRecasts } from '../db/schema.js'
import { wornItemsWhere } from './bag.js'
import { avatarStats, equipTables, item } from './data.js'
import { addedProps } from './gems.js'
import { OUTFIT_SLOT, outfitBonuses } from './outfit.js'
import type { Tx } from './progress.js'

type ItemRow = typeof inventoryItems.$inferSelect
/** What an equipped row contributes: its config id and the instance state the stats read. */
export type Gear = Pick<ItemRow, 'itemId'> &
  Partial<
    Pick<
      ItemRow,
      'durability' | 'enhanceLevel' | 'inscribeLevel' | 'props' | 'gems' | 'enchantItemId' | 'stars'
    >
  > & {
    /** A recast outfit's ISV (Strength, Agility, Stamina Up), from outfit_recasts. */
    isv?: readonly number[]
  }
type Wearer = Pick<typeof characters.$inferSelect, 'avatarId' | 'gender'> & { level?: number }

/** The rows of the active equipment set, the worn outfit with its recast ISV. */
export async function equippedGear(tx: Tx | Db, characterId: string): Promise<Gear[]> {
  const rows = await tx.select().from(inventoryItems).where(wornItemsWhere(characterId))
  const outfit = rows.find((row) => row.equippedSlot === OUTFIT_SLOT)
  const [recast] = outfit
    ? await tx.select().from(outfitRecasts).where(eq(outfitRecasts.itemId, outfit.id))
    : []
  if (!recast) return rows
  const isv = [recast.strength, recast.agility, recast.stamina]
  return rows.map((row) => (row === outfit ? { ...row, isv } : row))
}

/** A null durability column means full (or an item without durability), so the item is active. */
const durabilityOf = (gear: Gear, config: EquipConfig) =>
  gear.durability ?? Math.max(config.MaxHardiness ?? 0, 1)

/**
 * deriveStats bonuses from the equipped rows; the worn outfit adds its recast ISV and star bonuses
 * over its avatar row (outfitBonuses), unknown items nothing.
 */
export function equipmentBonuses(equipped: readonly Gear[], wearer: Wearer): Partial<Bonuses> {
  const items = equipped.flatMap((gear): EquippedItem[] => {
    // Outfits (AvatarItem) count through the avatar, not as gear.
    const def = item(gear.itemId)
    if (!def || def.class === 'AvatarItem') return []
    const config = def as EquipConfig
    return [
      {
        config,
        item: {
          durability: durabilityOf(gear, config),
          enhanceLevel: gear.enhanceLevel ?? 0,
          inscribeLevel: gear.inscribeLevel ?? 0,
          props: gear.props ?? [],
          added: addedProps(gear),
        },
      },
    ]
  })
  const totals = equipmentTotals(
    items,
    { popsinger: avatarStats(wearer.avatarId).Popsinger, sex: wearer.gender },
    equipTables(),
  )
  const bonuses = equipBonuses(totals)
  const outfit = equipped.find((gear) => item(gear.itemId)?.class === 'AvatarItem')
  if (!outfit) return bonuses
  const own = outfitBonuses({ ...outfit, stars: outfit.stars ?? 0 }, wearer.level ?? 0)
  return Object.entries(own).reduce<Partial<Bonuses>>(
    (sum, [key, value]) => ({ ...sum, [key]: (sum[key as keyof Bonuses] ?? 0) + value }),
    bonuses,
  )
}
