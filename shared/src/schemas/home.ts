// Reborn's Home (the village "Home" icon, scene 4101: the six-field farm and Storage) and the clan
// Events it shares the planting with: Ninja Garden / Ninjutsu Garden, Picnic in Garden and Select
// Outfit (data/reborn-raw/audit-2026-10-14: reborn-windows-M-Z-hud.md "Ninja Garden" ... "Select
// Outfit", reborn-windows-A-L.md "Choose Tree", "Contribution Leaderboard"; main.js @3589900 Home).
// Routes: /api/game/home and /api/game/clan-events. Times come from the server clock.
import { z } from 'zod'
import type { Character } from './game.js'

// --- Reborn's numbers (main.js) -----------------------------------------------------------------

/** Home farm: six fields f_0..f_5 (scenes/home). */
export const HOME_FARM_PLOTS = 6

/** Clan level bar: 35,000 x level (x3 from level 9, x5 from 18), MAX at 20. */
export const CLAN_MAX_LEVEL = 20
export const clanLevelExp = (level: number) =>
  level >= CLAN_MAX_LEVEL ? null : 35_000 * level * (level >= 18 ? 5 : level >= 9 ? 3 : 1)

export const GARDEN_RULES = {
  plots: 9,
  /** "Do you want to unlock this plot for 250 Gift Certificates?" */
  unlockCost: 250,
  /** "Plant limit reached (n/2 today)", reset at midnight UTC. */
  dailyPlants: 2,
  /** Scroll badge default and "Current: 18/18". */
  maxScrolls: 18,
  maxLevel: 5,
  /** "Random Level": 25 GC or 25,000 Stones. */
  reroll: { gc: 25, stones: 25_000 },
  /** "Level Up Tree": 250 GC or 5 Gold. */
  levelUp: { gc: 250, gold: 5 },
} as const

export const TREE_TYPES = ['money', 'zenpakuto'] as const
export type TreeType = (typeof TREE_TYPES)[number]

export interface TreeLevel {
  hours: number
  clanPoints: number
  coins: number
  bankaiExp: number
}

/** Tree table `Bh` @2826587: levels 1-5 grow in 2-6 hours. */
export const GARDEN_TREES: Record<TreeType, { name: string; levels: TreeLevel[] }> = {
  money: {
    name: 'Money Tree',
    levels: [300, 450, 600, 750, 900].map((clanPoints, i) => ({
      hours: i + 2,
      clanPoints,
      coins: [240, 450, 660, 870, 1080][i]!,
      bankaiExp: 0,
    })),
  },
  zenpakuto: {
    name: 'Zenpakuto Tree',
    levels: [1150, 1238, 1325, 1413, 1500].map((bankaiExp, i) => ({
      hours: i + 2,
      clanPoints: [220, 415, 610, 805, 1000][i]!,
      coins: 0,
      bankaiExp,
    })),
  },
}
export const treeLevel = (type: TreeType, level: number) => GARDEN_TREES[type].levels[level - 1]!

export const PICNIC_RULES = {
  /** "Picnic unlocks at level 4". */
  unlockLevel: 4,
  stone: { cost: 150_000, points: 10 },
  giftCoupon: { cost: 20, points: 30 },
} as const

/**
 * PLACEHOLDERS: Reborn keeps these on its server (main.js only renders what the server sends), so
 * these numbers are ours until the user confirms them.
 */
export const HOME_PLACEHOLDERS = {
  /** Home farm seeds (Reborn's HOME.farm rows [item, cost, time]): Stones, minutes, crops. */
  farmSeeds: [
    { crop: 'i170001', cost: 500, minutes: 60, yield: 5 },
    { crop: 'i170002', cost: 2_000, minutes: 120, yield: 3 },
    { crop: 'i170003', cost: 2_000, minutes: 240, yield: 5 },
    { crop: 'i170004', cost: 5_000, minutes: 480, yield: 3 },
  ],
  /** Ninja Garden: a harvested plot rests this long ("Plot is on Cooldown"; 1 scroll skips it). */
  gardenCooldownMinutes: 120,
  /** Garden scrolls refill to GARDEN_RULES.maxScrolls every Monday 00:00 UTC (no shop: dead UI). */
  gardenScrollsRefillWeekly: true,
  /** "Random Level" odds of levels 1-5 (percent). */
  gardenRerollWeights: [40, 30, 15, 10, 5],
  /** Picnic warehouse size: points to fill in a week. */
  picnicRequirement: 1_000,
  /** Picnic Boxes per claim. */
  picnicBoxesPerClaim: 1,
  /**
   * A Clan Picnic Box Lv.N (N = clan level) opens straight into its contents, since Reborn's box
   * ids 180001+ are 2011 skill books here: Refining Talismans (i161004) and Bankai Coins (its
   * 2,000-coin bags). Reborn's 300-slot bag and Souls Collection Chests have no equivalent.
   */
  picnicBox: (level: number) => ({ refineTalismans: 10 * level, bankaiCoins: 4_000 * level }),
  /** Outfit Contribution "1-7 points": one point per 5 outfit levels (+1..+5 = 1, +31 = 7). */
  outfitPoints: (plus: number) => Math.min(7, Math.max(1, Math.ceil(plus / 5))),
} as const

// --- Home farm ----------------------------------------------------------------------------------

export interface FarmSeed {
  crop: string
  cost: number
  minutes: number
  yield: number
}
export interface FarmPlot {
  crop: string
  /** Server time (ms) when the crop is ripe. */
  readyAt: number
}
export interface HomeView {
  /** Server clock (ms), so timers count from server time. */
  serverNow: number
  plots: (FarmPlot | null)[]
  seeds: FarmSeed[]
}
export interface HomeResult {
  home: HomeView
  character: Character
  harvested?: { crop: string; count: number }
}

const farmPlot = z
  .number()
  .int()
  .min(0)
  .max(HOME_FARM_PLOTS - 1)
export const homePlantSchema = z
  .object({ plot: farmPlot, crop: z.string().regex(/^i\d{6}$/) })
  .strict()
export const homePlotSchema = z.object({ plot: farmPlot }).strict()

// --- Clan level ---------------------------------------------------------------------------------

export interface ClanLevelView {
  level: number
  /** EXP into the current level. */
  exp: number
  /** EXP the level needs; null at MAX. */
  next: number | null
}

// --- Ninja Garden -------------------------------------------------------------------------------

export interface GardenPlotView {
  locked: boolean
  tree: { type: TreeType; level: number; readyAt: number } | null
  /** Server time (ms) the empty plot rests until; 0 when free. */
  cooldownUntil: number
}
export interface GardenView {
  serverNow: number
  plots: GardenPlotView[]
  scrolls: number
  plantsToday: number
  /** Next midnight UTC (ms): the daily plant limit resets. */
  resetAt: number
  /** The level the next tree is planted at (Random Level / Level Up Tree change it). */
  pendingLevel: number
  clan: ClanLevelView
}
export interface GardenHarvest {
  type: TreeType
  level: number
  clanHonor: number
  coins: number
  bankaiExp: number
}
export interface GardenResult {
  garden: GardenView
  character: Character
  harvest?: GardenHarvest
}

const gardenPlot = z
  .number()
  .int()
  .min(0)
  .max(GARDEN_RULES.plots - 1)
export const gardenPlotSchema = z.object({ plotIndex: gardenPlot }).strict()
export const gardenPlantSchema = z
  .object({
    plotIndex: gardenPlot,
    treeLevel: z.number().int().min(1).max(GARDEN_RULES.maxLevel),
    treeType: z.enum(TREE_TYPES),
  })
  .strict()
export const gardenRerollSchema = z.object({ payWith: z.enum(['gc', 'stones']) }).strict()
export const gardenLevelUpSchema = z
  .object({
    currentLevel: z.number().int().min(1).max(GARDEN_RULES.maxLevel),
    payWith: z.enum(['gc', 'gold']),
  })
  .strict()

// --- Picnic in Garden ---------------------------------------------------------------------------

export interface PicnicContribution {
  characterId: string
  name: string
  points: number
}
export interface PicnicView {
  unlocked: boolean
  unlockLevel: number
  clanLevel: number
  /** This week's warehouse (Monday 00:00 UTC). */
  warehousePoints: number
  requirement: number
  isFull: boolean
  /** Last week's warehouse was full: its boxes are claimed on Monday. */
  lastWeekFull: boolean
  canClaim: boolean
  alreadyClaimedThisWeek: boolean
  rewardAmount: number
  /** Clan level of the boxes (Clan Picnic Box Lv.N). */
  boxLevel: number
  /** ms until next Monday 00:00 UTC. */
  timeUntilMonday: number
  stoneCost: number
  stonePoints: number
  goldCost: number
  goldPoints: number
  contributions: PicnicContribution[]
}
export interface PicnicResult {
  picnic: PicnicView
  character: Character
  pointsAdded?: number
  claimed?: { boxes: number; refineTalismans: number; bankaiCoins: number }
}

export const picnicOutfitSchema = z.object({ uid: z.uuid() }).strict()
