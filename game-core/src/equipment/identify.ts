// Appraise and Refine (IdentifySystem.java; docs/original-data/blacksmith.md "Appraise and Refine").
import type { Random } from '../random.js'
import type { EquipInstance, IdentifyProp, IdentifyProps, RolledProp } from './types.js'

/** identify-lists.json (EquipIdentifyIDList.ini) row of one item. */
export interface IdentifyList {
  CommonIdentifyID: number
  /** Gold property group; 0 = none. */
  SpecialIdentifyID: number
}

/** identify-groups.json (EquipIdentifyProp.ini): group id → `IdentifyN` → IdentifyPropLib id. */
export type IdentifyGroups = Readonly<Record<string, Readonly<Record<string, number>>>>

export interface IdentifyTables {
  groups: IdentifyGroups
  props: IdentifyProps
}

/** GetEquipIdentifyMaxCount. */
const MAX_IDENTIFY_COUNT = 4
/** The gold property's row on a 4-property item. */
const GOLD_SLOT = 3
/** Base stats are ×100 and rolled in whole hundreds (GetIdentifyPropValue 187-193). */
const BASE_STATS = new Set(['StrengthEquip', 'StaminaEquip', 'AgilityEquip'])
const BASE_STAT_STEP = 100

const validCount = (count: number) => count >= 1 && count <= MAX_IDENTIFY_COUNT

/** IsEquipIdentifyed (178-185): `CanIdentify != 1 || IdentifyTimes >= 1`. */
export function isAppraised(item: Pick<EquipInstance, 'canIdentify' | 'identifyTimes'>): boolean {
  return !item.canIdentify || item.identifyTimes >= 1
}

/** CanIdentifyEquip (404-406): hidden properties, a 1-4 count and never rolled. */
export function canAppraise(
  item: Pick<EquipInstance, 'canIdentify' | 'identifyCount' | 'identifyTimes'>,
): boolean {
  return item.canIdentify && validCount(item.identifyCount) && item.identifyTimes <= 0
}

/** CanBaseFlushIdentify (495-508) plus FlushEquipIdentifyProp's 1-4 count check. */
export function canRefine(
  item: Pick<EquipInstance, 'canIdentify' | 'identifyCount' | 'identifyTimes'>,
): boolean {
  return isAppraised(item) && validCount(item.identifyCount)
}

/** GetIdentifyEquipCost (382-385), Stone: `(int)(-0.0009 * L^2 + 0.27 * L + 12)`, L = UseLevel. */
export function appraiseCost(useLevel: number): number {
  return Math.trunc(-0.0009 * useLevel ** 2 + 0.27 * useLevel + 12)
}

/** Prop ids of a group in `IdentifyN` order. */
function groupIds(groups: IdentifyGroups, groupId: number): number[] | undefined {
  const row = groups[groupId]
  if (!row) return undefined
  const index = (key: string) => Number(key.replace(/\D/g, ''))
  return Object.entries(row)
    .sort(([a], [b]) => index(a) - index(b))
    .map(([, id]) => id)
}

/** GetIdentifyPropValue (187-193): RandInt(min, max); base stats floored to hundreds, min 100. */
function rollValue(prop: IdentifyProp, random: Random): number {
  const value = random.between(prop.PropMinValue, prop.PropMaxValue)
  if (!BASE_STATS.has(prop.PropName)) return value
  return Math.max(BASE_STAT_STEP, Math.trunc(value / BASE_STAT_STEP) * BASE_STAT_STEP)
}

interface Kept {
  pos: number
  prop: RolledProp
}

/**
 * AddEquipCommonIdentifyProp (195-251). Draws without replacement from the common group, skipping
 * names already present. A prop id missing from the library spends a draw (fewer rows).
 */
function rollCommon(
  count: number,
  list: IdentifyList,
  kept: Kept | undefined,
  tables: IdentifyTables,
  random: Random,
): { props: RolledProp[]; names: string[] } {
  const ids = groupIds(tables.groups, list.CommonIdentifyID)
  // A group smaller than the count rolls nothing (and forgets the engraved name).
  if (!ids || ids.length < count) return { props: [], names: [] }
  const names = kept ? [tables.props[kept.prop.propId]?.PropName ?? ''] : []
  let draws = count
  if (count === MAX_IDENTIFY_COUNT && list.SpecialIdentifyID !== 0) {
    draws -= 1
    if (kept?.pos === GOLD_SLOT) draws += 1
  }
  if (kept) draws -= 1

  const remaining = [...ids]
  const props: RolledProp[] = []
  const isNew = (id: number) => {
    const prop = tables.props[id]
    return !prop || !names.includes(prop.PropName)
  }
  for (let i = 0; i < draws; i++) {
    // Ambiguity: the original redraws forever (`--i; continue`, 227-229) once every remaining id
    // has a name already rolled; we stop with the rows rolled so far.
    if (!remaining.some(isNew)) break
    const id = remaining[random.between(0, remaining.length - 1)]!
    const prop = tables.props[id]
    if (!prop) continue
    if (names.includes(prop.PropName)) {
      i--
      continue
    }
    props.push({ propId: id, value: rollValue(prop, random) })
    remaining.splice(remaining.indexOf(id), 1)
    names.push(prop.PropName)
  }
  return { props, names }
}

/** AddEquipSpecialIdentifyProp (253-283): up to `size` draws for one gold property with a new name. */
function rollSpecial(
  groupId: number,
  count: number,
  names: string[],
  tables: IdentifyTables,
  random: Random,
): RolledProp | undefined {
  if (names.length >= MAX_IDENTIFY_COUNT) return undefined
  const ids = groupIds(tables.groups, groupId)
  if (!ids || ids.length < count) return undefined
  for (let i = 0; i < ids.length; i++) {
    const id = ids[random.between(0, ids.length - 1)]!
    const prop = tables.props[id]
    if (!prop || names.includes(prop.PropName)) continue
    return { propId: id, value: rollValue(prop, random) }
  }
  return undefined
}

/**
 * Reborn's Impress: one more property whose name the item lacks. The fourth line of an item with
 * a gold group comes from that group, like rollIdentify's gold slot. Undefined when nothing fits.
 */
export function addIdentifyProp(
  item: Pick<EquipInstance, 'props'>,
  list: IdentifyList,
  tables: IdentifyTables,
  random: Random,
): RolledProp | undefined {
  if (item.props.length >= MAX_IDENTIFY_COUNT) return undefined
  const names = item.props.map((prop) => tables.props[prop.propId]?.PropName)
  const gold = item.props.length === GOLD_SLOT && list.SpecialIdentifyID > 0
  const ids = groupIds(tables.groups, gold ? list.SpecialIdentifyID : list.CommonIdentifyID) ?? []
  const fresh = ids.filter((id) => {
    const prop = tables.props[id]
    return prop && !names.includes(prop.PropName)
  })
  if (fresh.length === 0) return undefined
  const id = fresh[random.between(0, fresh.length - 1)]!
  return { propId: id, value: rollValue(tables.props[id]!, random) }
}

/**
 * FlushEquipIdentifyProp (350-380), shared by Appraise and Refine: keep the engraved row, roll the
 * common properties, add the gold one on a 4-property item with a special group (unless the
 * engraved row is the gold slot), put the engraved row back in place and count the roll.
 * Returns null when nothing is rolled (no identify list or a count outside 1-4); the original then
 * charges nothing.
 */
export function rollIdentify(
  item: Pick<EquipInstance, 'identifyCount' | 'identifyTimes' | 'props' | 'engravedSlot'>,
  list: IdentifyList | undefined,
  tables: IdentifyTables,
  random: Random,
): { props: RolledProp[]; identifyTimes: number } | null {
  if (!list || !validCount(item.identifyCount)) return null
  const engraved = item.engravedSlot === null ? undefined : item.props[item.engravedSlot]
  const kept = engraved && { pos: item.engravedSlot!, prop: engraved }

  const common = rollCommon(item.identifyCount, list, kept, tables, random)
  const props = [...common.props]
  if (
    item.identifyCount === MAX_IDENTIFY_COUNT &&
    list.SpecialIdentifyID > 0 &&
    kept?.pos !== GOLD_SLOT
  ) {
    const gold = rollSpecial(
      list.SpecialIdentifyID,
      item.identifyCount,
      common.names,
      tables,
      random,
    )
    if (gold) props.push(gold)
  }
  if (kept) props.splice(Math.min(kept.pos, props.length), 0, kept.prop)
  return { props, identifyTimes: item.identifyTimes + 1 }
}
