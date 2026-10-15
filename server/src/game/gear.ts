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
  setCounts,
  wearDurability,
  type DropEntry,
  type DropLib,
  type EquipConfig,
  type Random,
} from '@pockie/game-core'
import type { GearView } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import { inventoryItems } from '../db/schema.js'
import { isWornIn, wornItemsWhere } from './bag.js'
import {
  dropItems,
  dropLib,
  equipTables,
  identifyList,
  identifyTables,
  item,
  itemNameKey,
  setPieceCount,
} from './data.js'
import { gemOf, stoneOf } from './gems.js'
import type { Tx } from './progress.js'

type ItemRow = typeof inventoryItems.$inferSelect
type ItemInsert = typeof inventoryItems.$inferInsert

export const equipConfigOf = (itemId: string) => {
  const row = item(itemId)
  return row?.class === 'EquipItem' ? (row as EquipConfig) : undefined
}

/** UsePopsinger job mask (1 Blunt, 2 Sharp, 4 Fists, -1 any) as Reborn's Weapon Type. */
function weaponType(mask = -1) {
  const jobs = (['Blunt', 'Sharp', 'Fists'] as const).filter((_, bit) => mask & (1 << bit))
  return mask === -1 || jobs.length !== 1 ? 'Any' : jobs[0]!
}

/** OtherPropName / OtherPropValue: `;`-separated innate lines. */
function innateProps(config: EquipConfig) {
  const names = String(config.OtherPropName ?? '')
    .split(';')
    .filter(Boolean)
  const values = String(config.OtherPropValue ?? '').split(';')
  return names.map((name, index) => ({ name, value: Number(values[index] ?? 0) }))
}

let tiers: Map<number, number> | undefined
/**
 * A rolled line's tier: its level within the property family, ordered by range (Reborn shows the
 * Iron Wok Hat's 30-37 Dodge as T3, the third Dodge row). ponytail: rank by range, not the
 * original identify list level, which the data does not carry; capped at Reborn's T20.
 */
function propTier(propId: number) {
  if (!tiers) {
    const families = new Map<string, [number, { PropMinValue: number; PropMaxValue: number }][]>()
    for (const [id, prop] of Object.entries(equipTables().identifyProps))
      families.set(prop.PropName, [...(families.get(prop.PropName) ?? []), [Number(id), prop]])
    tiers = new Map()
    for (const rows of families.values()) {
      rows.sort(
        ([a, x], [b, y]) =>
          x.PropMinValue - y.PropMinValue || x.PropMaxValue - y.PropMaxValue || a - b,
      )
      rows.forEach(([id], rank) => tiers!.set(id, Math.min(rank + 1, 20)))
    }
  }
  return tiers.get(propId) ?? 1
}

/** A null durability column means full (or an item without durability). */
export const durabilityOf = (row: Pick<ItemRow, 'durability'>, config: EquipConfig) =>
  row.durability ?? Math.max(config.MaxHardiness ?? 0, 1)

/**
 * Active (unbroken) worn pieces per set id among a character's rows (GetEquipBoxSuitIDType), in
 * its active equipment set.
 */
export function wornSetCounts(rows: readonly ItemRow[], activeSet: number): Record<string, number> {
  return setCounts(
    rows.flatMap((row) => {
      const config = isWornIn(row, activeSet) ? equipConfigOf(row.itemId) : undefined
      return config && durabilityOf(row, config) > 0 ? [config] : []
    }),
  )
}

function setProgress(suitId: number, worn: Readonly<Record<string, number>>) {
  if (suitId <= 0) return undefined
  const bonuses = [...(equipTables().suits[suitId] ?? [])]
    .sort((a, b) => a.Index - b.Index)
    .map((row) => ({ pieces: row.Index, name: row.PropName, value: row.PropValue }))
  return { id: suitId, pieces: setPieceCount(suitId), worn: worn[suitId] ?? 0, bonuses }
}

/**
 * The forge state of an equipment row for the client; undefined for other items. `worn` is
 * wornSetCounts of the character's rows, for the set progress.
 */
export function gearView(
  row: ItemRow,
  worn: Readonly<Record<string, number>> = {},
): GearView | undefined {
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
      return prop
        ? [
            {
              propId,
              name: prop.PropName,
              value,
              min: prop.PropMinValue,
              max: prop.PropMaxValue,
              tier: propTier(propId),
            },
          ]
        : []
    }),
    level: config.UseLevel ?? 0,
    equipType: String(item(row.itemId)?.EquipType ?? ''),
    ...(config.EquipBaseType === 1 && { weaponType: weaponType(config.UsePopsinger) }),
    special: innateProps(config),
    attack: enhancedAttack(config, row.enhanceLevel, tables.enhanceFactor),
    defense: config.Defense ?? 0,
    maxHp: enhancedMaxHp(config, row.enhanceLevel),
    inscription: inscriptionProps(config, row.inscribeLevel, tables.inscribeLevels),
    set: setProgress(config.SuitID ?? 0, worn),
    sockets: row.gems.map((gemId) => {
      const gem = gemId ? gemOf(gemId) : undefined
      return gemId && gem
        ? { itemId: gemId, nameKey: itemNameKey(gemId), name: gem.name, value: gem.value }
        : null
    }),
    maxSockets: config.MaxHoleCount ?? 0,
    ...(row.enchantItemId && {
      enchant: {
        itemId: row.enchantItemId,
        nameKey: itemNameKey(row.enchantItemId),
        lines: stoneOf(row.enchantItemId)?.lines ?? [],
      },
    }),
    appraiseCost: appraiseCost(config.UseLevel ?? 0),
    repairCost: repairCost(config, durability),
  }
}

/**
 * Why CheckEquipProp refuses to wear an equipment row beyond level and job (EquipSystem.java:421,
 * 374-): unappraised gear and broken gear (Hardiness 0). Undefined when it may be worn.
 */
export function equipRefusal(row: ItemRow): { code: string; message: string } | undefined {
  const config = equipConfigOf(row.itemId)
  if (!config) return undefined
  if (!isAppraised(row)) return { code: 'unappraised', message: 'Appraise that item first.' }
  if (durabilityOf(row, config) <= 0) {
    return { code: 'broken', message: 'That item is broken. Repair it first.' }
  }
  return undefined
}

/** A drop with the identify count its DropItemLib row carries. */
export interface GrantedItem {
  itemId: string
  bound: boolean
  identifyCount?: number
}

/**
 * rollDrops with each drop's `IdentifyPropCount` (DropSystem.java:144-157); `chanceMul` is the
 * VIP drop factor (vipDropMul).
 */
export function rollLibDrops(libId: number, random: Random, chanceMul = 1): GrantedItem[] {
  const entries = dropItems(libId)
  return rollDrops(
    dropLib(libId) as unknown as DropLib,
    entries as unknown as DropEntry[],
    random,
    chanceMul,
  )
    .filter((drop) => !/^i15900[0-3]$/.test(drop.itemId))
    .map((drop) => ({
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

/**
 * RefreshShopSystem transfers instances rather than rerolling them. SetEquipIdentifyPropCount
 * refuses items without an identify list; plain gear is appraised without an identify roll.
 */
export function shopGearState(
  itemId: string,
  identifyCount: number,
  appraised: boolean,
  props: ItemRow['props'] = [],
): Pick<ItemRow, 'canIdentify' | 'identifyCount' | 'identifyTimes' | 'props'> {
  const canIdentify = Boolean(
    equipConfigOf(itemId) && identifyList(itemId) && identifyCount >= 1 && identifyCount <= 4,
  )
  return {
    canIdentify,
    identifyCount: canIdentify ? identifyCount : 0,
    identifyTimes: canIdentify && appraised ? 1 : 0,
    props: canIdentify && appraised ? props : [],
  }
}

/** Points an item loses on a revive at home (5% of its MaxHardiness). */
export const reviveLoss = (config: EquipConfig) => reviveDurabilityLoss(config)
/** Points an item loses per enemy killed in a won fight. */
export const KILL_LOSS = 1

/**
 * DecEquipHardiness for every item of the active set (HardinessSystem 170-182, ReliveSystem 77-95):
 * `loss(config)` points each, through game-core's wear rules (UnDecHardiness, broken items and
 * IsDecHardEquip properties are skipped).
 */
export async function wearEquipped(
  tx: Tx,
  characterId: string,
  loss: (config: EquipConfig) => number,
) {
  const rows = await tx.select().from(inventoryItems).where(wornItemsWhere(characterId))
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
