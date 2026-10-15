// Gems and enchantments on equipment (2011 EnchaseSystem, AddHoleSystem, AddMagicSystem; Reborn's
// Armory tabs Enchantment / Create Hole / Remove, the bag's gemInsert and Remove Gems). A gear
// row keeps its sockets in `gems` (gem item id, or null for an open socket) and its enchantment
// as the Enchanting Stone's item id; the stats come from the item tables.
import type { PropRow } from '@pockie/game-core'
import { item, magicProps } from './data.js'

/**
 * Gear UseLevel a gem or stone of `level` needs: `(level - 1) * 10 + 1` (EnchaseSystem 115-116,
 * AddMagicSystem.CanBaseAddMagic).
 */
const gearLevelFor = (level: number) => (Math.max(level, 1) - 1) * 10 + 1

/** A JewelItem's socket stat (AddPropName / AddPropValue) and the lowest gear level for it. */
export function gemOf(itemId: string) {
  const def = item(itemId)
  if (def?.class !== 'JewelItem' || !def.AddPropName) return undefined
  return {
    name: String(def.AddPropName),
    value: Number(def.AddPropValue ?? 0),
    level: gearLevelFor(Number(def.JewelLevel ?? 1)),
  }
}

/** A MagicItem's lines (MagicPropLib by AddMagicLibID), the EquipTypes it fits and its level. */
export function stoneOf(itemId: string) {
  const def = item(itemId)
  if (def?.class !== 'MagicItem') return undefined
  const lines = [...(magicProps()[String(def.AddMagicLibID)] ?? [])]
    .sort((a, b) => a.Index - b.Index)
    .map((row) => ({ name: row.PropName, value: row.PropValue }))
  const slots = [def.AddMagicEquipType1, def.AddMagicEquipType2].filter(Boolean).map(String)
  if (lines.length === 0 || slots.length === 0) return undefined
  return { lines, slots, level: gearLevelFor(Number(def.AddMagicLevel ?? 1)) }
}

/** What a gear row's gems and enchantment add to the wearer (equipItemProps `added`). */
export function addedProps(row: {
  gems?: readonly (string | null)[]
  enchantItemId?: string | null
}): PropRow[] {
  const gems = (row.gems ?? []).flatMap((id) => {
    const gem = id ? gemOf(id) : undefined
    return gem ? [{ name: gem.name, value: gem.value }] : []
  })
  const enchant = row.enchantItemId ? (stoneOf(row.enchantItemId)?.lines ?? []) : []
  return [...gems, ...enchant]
}
