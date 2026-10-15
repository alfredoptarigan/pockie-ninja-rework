// Equipment sets (SuitEquipSystem.java; docs/original-data/equipment-sets.md "Sets").
import { equipItemProps, isEquipActive, sumEquipProps, type EquipWearer } from './props.js'
import type { EquipConfig, EquipInstance, EquipTables, PropRow } from './types.js'

/** equip-suits.json (SuitProp.ini grouped by ID): the bonus for `Index` or more pieces. */
export interface SuitRow {
  Index: number
  PropName: string
  PropValue: number
}
export type EquipSuits = Readonly<Record<string, readonly SuitRow[]>>

/** An item in the EquipBox. */
export interface EquippedItem {
  config: EquipConfig
  item: Pick<EquipInstance, 'durability' | 'enhanceLevel' | 'inscribeLevel' | 'props'> & {
    /** Gem and enchant rows (resolved from the item tables by the caller). */
    added?: readonly PropRow[]
  }
}

/** Bonuses start at 2 pieces (the loop starts at 2; no row uses Index 1). */
const FIRST_INDEX = 2
/** Skill props a set never adds (97). */
const SKIPPED = new Set(['AddSkillEquip', 'EffectSkillEquip'])
/** SkillAddAllEquip stands for SkillAdd0..4 (99-120). */
const SKILL_ADD_ALL = 'SkillAddAllEquip'
const SKILL_ADD_ALL_TREES = 5

/** GetEquipBoxSuitIDType (60-82): pieces per SuitID among the active items given. */
export function setCounts(activeConfigs: readonly EquipConfig[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const { SuitID = 0 } of activeConfigs) {
    if (SuitID > 0) counts[SuitID] = (counts[SuitID] ?? 0) + 1
  }
  return counts
}

/**
 * GetEquipBoxSuitProp (85-126): every row with `2 <= Index <= count` applies, so bonuses stack.
 * Names that are not Player properties (AddSkillComeOdds) are dropped later by sumEquipProps.
 */
export function setBonusProps(counts: Readonly<Record<string, number>>, suits: EquipSuits) {
  return Object.entries(counts).flatMap(([suitId, count]) =>
    [...(suits[suitId] ?? [])]
      .filter((row) => row.Index >= FIRST_INDEX && row.Index <= count && !SKIPPED.has(row.PropName))
      .sort((a, b) => a.Index - b.Index)
      .flatMap((row): PropRow[] =>
        row.PropName === SKILL_ADD_ALL
          ? Array.from({ length: SKILL_ADD_ALL_TREES }, (_, i) => ({
              name: `SkillAdd${i}Equip`,
              value: row.PropValue,
            }))
          : [{ name: row.PropName, value: row.PropValue }],
      ),
  )
}

/**
 * RefreshEquipProperty: the props of every active item, then the set bonuses of the active
 * items, summed over PropType 0. Feed the result to `equipBonuses` and `deriveStats`.
 */
export function equipmentTotals(
  equipped: readonly EquippedItem[],
  wearer: EquipWearer,
  tables: EquipTables & { suits: EquipSuits },
): Record<string, number> {
  const active = equipped.filter(({ config, item }) =>
    isEquipActive(config, item.durability, wearer),
  )
  const rows = [
    ...active.flatMap(({ config, item }) => equipItemProps(config, item, tables)),
    ...setBonusProps(setCounts(active.map(({ config }) => config)), tables.suits),
  ]
  return sumEquipProps(rows, tables.propDefines)
}
