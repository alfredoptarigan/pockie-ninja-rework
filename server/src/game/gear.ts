// Item instance state of equipment (migration 0004 columns): the API view of one row, the state
// a freshly granted item starts with (drops roll their identify properties at once) and
// durability wear (HardinessSystem). Rules come from game-core/equipment.
import {
  appraiseCost,
  enhancedAttack,
  enhancedMaxHp,
  inscriptionProps,
  isAppraised,
  repairCost,
  reviveDurabilityLoss,
  rollDrops,
  rollIdentify,
  wearDurability,
  type DropEntry,
  type DropLib,
  type EquipConfig,
  type Random,
} from '@pockie/game-core'
import type { GearView } from '@pockie/shared'
import { and, eq, isNotNull } from 'drizzle-orm'
import { inventoryItems } from '../db/schema.js'
import { dropItems, dropLib, equipTables, identifyList, identifyTables, item } from './data.js'
import type { Tx } from './progress.js'

type ItemRow = typeof inventoryItems.$inferSelect
type ItemInsert = typeof inventoryItems.$inferInsert

export const equipConfigOf = (itemId: string) => {
  const row = item(itemId)
  return row?.class === 'EquipItem' ? (row as EquipConfig) : undefined
}

/** A null durability column means full (or an item without durability). */
export const durabilityOf = (row: Pick<ItemRow, 'durability'>, config: EquipConfig) =>
  row.durability ?? Math.max(config.MaxHardiness ?? 0, 1)

/** The forge state of an equipment row for the client; undefined for other items. */
export function gearView(row: ItemRow): GearView | undefined {
  const config = equipConfigOf(row.itemId)
  if (!config) return undefined
  const tables = equipTables()
  const durability = durabilityOf(row, config)
  return {
    baseType: config.EquipBaseType ?? 0,
    enhanceLevel: row.enhanceLevel,
    enhanceMax: config.ConsolidateMaxLevel ?? 0,
    inscribeLevel: row.inscribeLevel,
    durability,
    maxDurability: Math.max(config.MaxHardiness ?? 0, 1),
    appraised: isAppraised(row),
    identifyCount: row.identifyCount,
    props: row.props.flatMap(({ propId, value }) => {
      const prop = tables.identifyProps[propId]
      return prop ? [{ propId, name: prop.PropName, value }] : []
    }),
    attack: enhancedAttack(config, row.enhanceLevel, tables.enhanceFactor),
    defense: config.Defense ?? 0,
    maxHp: enhancedMaxHp(config, row.enhanceLevel),
    inscription: inscriptionProps(config, row.inscribeLevel, tables.inscribeLevels),
    setId: config.SuitID ?? 0,
    appraiseCost: appraiseCost(config.UseLevel ?? 0),
    repairCost: repairCost(config, durability),
  }
}

/** A drop with the identify count its DropItemLib row carries. */
export interface GrantedItem {
  itemId: string
  bound: boolean
  identifyCount?: number
}

/** rollDrops with each drop's `IdentifyPropCount` (DropSystem.java:144-157). */
export function rollLibDrops(libId: number, random: Random): GrantedItem[] {
  const entries = dropItems(libId)
  return rollDrops(
    dropLib(libId) as unknown as DropLib,
    entries as unknown as DropEntry[],
    random,
  ).map((drop) => ({
    ...drop,
    identifyCount: Number(
      entries.find((entry) => String(entry.ItemConfig) === drop.itemId)?.IdentifyPropCount ?? 0,
    ),
  }))
}

/**
 * Instance columns of a new equipment row. Items granted with a 1-4 identify count are rolled at
 * once (MonsterDropSystem 234-255, NormalBox.js 135-139); items without an identify list get no
 * properties, like the original. Non-equipment and count 0 keep the plain defaults.
 */
export function newGearState(
  itemId: string,
  identifyCount: number,
  random: Random,
): Partial<ItemInsert> {
  if (!equipConfigOf(itemId) || identifyCount <= 0) return {}
  const rolled = rollIdentify(
    { identifyCount, identifyTimes: 0, props: [], engravedSlot: null },
    identifyList(itemId),
    identifyTables(),
    random,
  )
  if (!rolled) return {}
  return { canIdentify: true, identifyCount, identifyTimes: 1, props: rolled.props }
}

/** Points an item loses on a revive at home (5% of its MaxHardiness). */
export const reviveLoss = (config: EquipConfig) => reviveDurabilityLoss(config)
/** Points an item loses per enemy killed in a won fight. */
export const KILL_LOSS = 1

/**
 * DecEquipHardiness for every equipped item (HardinessSystem 170-182, ReliveSystem 77-95):
 * `loss(config)` points each, through game-core's wear rules (UnDecHardiness, broken items and
 * IsDecHardEquip properties are skipped).
 */
export async function wearEquipped(
  tx: Tx,
  characterId: string,
  loss: (config: EquipConfig) => number,
) {
  const rows = await tx
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.characterId, characterId), isNotNull(inventoryItems.equippedSlot)))
  const { identifyProps } = equipTables()
  for (const row of rows) {
    const config = equipConfigOf(row.itemId)
    if (!config) continue
    const before = durabilityOf(row, config)
    const after = wearDurability(
      config,
      { durability: before, props: row.props },
      loss(config),
      identifyProps,
    )
    if (after !== before) {
      await tx
        .update(inventoryItems)
        .set({ durability: after })
        .where(eq(inventoryItems.id, row.id))
    }
  }
}
