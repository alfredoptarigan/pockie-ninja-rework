// Zanpakuto (Reborn village icon, level 61): crystals in a 16-slot spirit inventory, 6 slots per
// weapon tab. Tables, costs and formatting are Reborn's client (chunk 984, main.js modules 17737
// and 82710; data/reborn-raw/audit-2026-10-14/reborn-lazy-features.md "## Zanpakuto"). The stat
// ranges and pools are Reborn server config we do not have: see ZANPAKUTO_REFINE_RANGES.
import type { Random } from '../random.js'

export const ZANPAKUTO_LEVEL = 61
export const SPIRIT_SLOTS = 16
/**
 * Spirit slots open from the start. ponytail: Reborn's `lockedSlot` comes from its server
 * (UNKNOWN); slots 0-3 cost 0 Stones in its formula, so they are taken as the free ones.
 */
export const FREE_SPIRIT_SLOTS = 4
export const WEAPON_SLOTS = 6
export const MAX_CRYSTAL_STATS = 3
export const FREE_REFINES_PER_DAY = 3
export const REFINE_COST_SC = 10
export const BULK_OPTION_COUNT = 10
export const BULK_REFRESH_COST = { coins: 30, stones: 50_000 } as const
/** Coupons to activate stat 2 (position 1) and stat 3 (position 2). */
export const ATTRIBUTE_UNLOCK_COUPONS: Record<1 | 2, number> = { 1: 1000, 2: 2000 }

export const ZANPAKUTO_TABS = ['sharp', 'blunt', 'fist'] as const
export type ZanpakutoTab = (typeof ZANPAKUTO_TABS)[number]
/** 0 Blue, 1 Purple, 2 Orange. */
export type CrystalCategory = 0 | 1 | 2
/** [stat id, raw value]: Reborn's `props.stat` entries. */
export type CrystalStat = [stat: number, value: number]

/**
 * PLACEHOLDER VALUES, NOT REBORN'S. Reborn sends `ZANPAKUTO.Refine[category][statId] = [min, max]`
 * in its login serverConfig and our capture of it is empty (re/serverConfig.json `zanpakuto: {}`),
 * and no 2011 table has an equivalent. Every number below is made up so the flows work, and must
 * be confirmed or replaced. The ids are the stats Reborn's formatter names (module 82710); each
 * tier's keys are also its roll pool (also UNKNOWN). Values are raw: the window shows raw * 0.5
 * (ids 9/11/12/14 as /10 %, id 18 as /100 %). Crystals add nothing to combat until confirmed.
 */
export const ZANPAKUTO_REFINE_RANGES: Record<
  CrystalCategory,
  Record<number, [min: number, max: number]>
> = {
  0: {
    8: [40, 200],
    9: [10, 40],
    11: [10, 40],
    12: [10, 40],
    13: [40, 200],
    14: [10, 40],
    15: [4, 20],
    16: [4, 20],
    18: [100, 400],
    19: [4, 20],
    21: [2, 10],
    23: [2, 10],
    24: [2, 10],
  },
  1: {
    8: [200, 400],
    9: [40, 80],
    11: [40, 80],
    12: [40, 80],
    13: [200, 400],
    14: [40, 80],
    15: [20, 40],
    16: [20, 40],
    18: [400, 800],
    19: [20, 40],
    21: [10, 20],
    23: [10, 20],
    24: [10, 20],
  },
  2: {
    8: [400, 800],
    9: [80, 160],
    11: [80, 160],
    12: [80, 160],
    13: [400, 800],
    14: [80, 160],
    15: [40, 80],
    16: [40, 80],
    18: [800, 1600],
    19: [40, 80],
    21: [20, 40],
    23: [20, 40],
    24: [20, 40],
  },
}

export interface CrystalInfo {
  iid: number
  tab: ZanpakutoTab
  category: CrystalCategory
  /** 1-6: the weapon-tab slot it equips into (slot index position - 1). */
  position: number
  /** Spirit Coins when sold. */
  coins: number
  name: string
  /** Icon path under icons/items. */
  icon: string
}

const TAB_INFO = {
  sharp: { base: 480_000, art: 'rui', label: 'Sharp' },
  blunt: { base: 480_030, art: 'dun', label: 'Blunt' },
  fist: { base: 480_060, art: 'quan', label: 'Fist' },
} as const
const TIERS = [
  { label: 'Blue', art: 's', coins: 1 },
  { label: 'Purple', art: 'p', coins: 5 },
  { label: 'Orange', art: 'b', coins: 50 },
] as const
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

export const CRYSTALS: Record<number, CrystalInfo> = Object.fromEntries(
  ZANPAKUTO_TABS.flatMap((tab) =>
    TIERS.flatMap((tier, category) =>
      ROMAN.map((roman, index) => {
        const { base, art, label } = TAB_INFO[tab]
        const iid = base + 10 * category + index + 1
        const info: CrystalInfo = {
          iid,
          tab,
          category: category as CrystalCategory,
          position: index + 1,
          coins: tier.coins * (index + 1),
          name: `${label} ${tier.label} Crystal ${roman}`,
          icon: `zanpakuto/${art}_${tier.art}${index + 1}`,
        }
        return [iid, info] as const
      }),
    ),
  ),
)

export const crystalInfo = (iid: number): CrystalInfo | undefined => CRYSTALS[iid]

/** "Unlock Spirit Slot" prices for slot i (0-15). */
export const spiritSlotCost = (slot: number) => ({
  coupons: 200 * slot,
  stones: 100_000 * (Math.floor((slot - 4) / 4) + 1),
})

/** Weapon slot idx (0-5) opens after 25 * idx Impel Down floors (lock when maxFloor / 25 < idx). */
export const weaponSlotOpen = (index: number, impelDownMaxFloor: number) =>
  impelDownMaxFloor / 25 >= index

export const bulkApplyCost = (locks: number) =>
  locks === 0 ? { coins: 0, stones: 0 } : { coins: 3 + 3 * locks, stones: 5000 + 5000 * locks }

/** One stat from the tier's pool, uniform in its range. Repeats are allowed (Reborn strikes them). */
function rollStat(category: CrystalCategory, random: Random): CrystalStat {
  const pool = Object.entries(ZANPAKUTO_REFINE_RANGES[category])
  const [stat, [min, max]] = pool[random.int(pool.length)]!
  return [Number(stat), random.between(min, max)]
}

export const rollStats = (category: CrystalCategory, count: number, random: Random) =>
  Array.from({ length: count }, () => rollStat(category, random))

export const bulkOptions = (category: CrystalCategory, count: number, random: Random) =>
  Array.from({ length: BULK_OPTION_COUNT }, () => rollStats(category, count, random))

/**
 * The stats a bulk option gives with `locks` (stat indexes) kept, or undefined when a locked stat
 * id would repeat in an unlocked column (Reborn hides those options).
 */
export function applyBulkOption(
  current: readonly CrystalStat[],
  option: readonly CrystalStat[],
  locks: readonly number[],
): CrystalStat[] | undefined {
  const lockedIds = locks.map((index) => current[index]![0])
  const clash = option.some((stat, index) => !locks.includes(index) && lockedIds.includes(stat[0]))
  if (clash) return undefined
  return option.map((stat, index) => (locks.includes(index) ? current[index]! : stat))
}

const NAME_OVERRIDES: Record<number, string> = {
  9: 'Max Health Increase',
  11: 'Attack Increase',
  12: 'Speed Increase',
  14: 'Max Chakra Increase',
  18: 'Block Increase',
}
/** Reborn's `stat__{id}` strings for the ids crystals use. */
const STAT_NAMES: Record<number, string> = {
  8: 'Max Health',
  13: 'Max Chakra',
  15: 'Critical',
  16: 'Critical Damage',
  19: 'Pierce',
  21: 'Counterattack %',
  23: 'Lifesteal %',
  24: 'Damage Reduction %',
}
const TENTH_PERCENT = [9, 11, 12, 14]

export const statName = (stat: number) => NAME_OVERRIDES[stat] ?? STAT_NAMES[stat] ?? `Stat ${stat}`

/** raw * 0.5; id 18 as (x / 100)%, ids 9/11/12/14 as (x / 10)%, both with two decimals. */
export function formatStatValue(stat: number, raw: number) {
  const value = raw * 0.5
  if (stat === 18) return `${(value / 100).toFixed(2)}%`
  if (TENTH_PERCENT.includes(stat)) return `${(value / 10).toFixed(2)}%`
  return String(value)
}

export const TIER_COLORS: Record<CrystalCategory, string> = {
  0: '#00aeff',
  1: '#CA47AE',
  2: 'orange',
}

/** Refine-quality colour of a stat against its range max ('' when the range is unknown). */
export function qualityColor(category: CrystalCategory, stat: number, value: number) {
  const range = ZANPAKUTO_REFINE_RANGES[category][stat]
  if (!range) return ''
  const max = range[1]
  if (category === 0) return value === max ? '#00b034' : '#a8a8a8'
  if (category === 1) return value === max ? '#00aeff' : '#00b034'
  if (value === max) return '#f2b41e'
  return (value / max) * 100 >= 80 ? '#CA47AE' : '#00aeff'
}
