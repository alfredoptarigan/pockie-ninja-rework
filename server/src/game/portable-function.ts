// Reborn's Portable Function (reborn-windows-M-Z-hud.md "Portable Function"): Synthesis, Recast
// and Impress. Reborn keeps their rules on its server, so they follow the 2011 ComposeSystem,
// AvatarSystem recast and IdentifySystem impress over our imported tables, shaped by Reborn's
// client: recast locks and their talisman costs, impress adding a line to gear with fewer than 4.
// Pure rules; modules/portable-function locks the rows, checks the bag and pays.
import type { Random } from '@pockie/game-core'
import {
  avatarRecast,
  avatarStats,
  composeBlocked,
  composeRandom,
  composeRecipes,
  equipConfig,
  impressRates,
  item,
  type ComposeRecipe,
} from './data.js'
import { outfitOf } from './outfit.js'

/**
 * PLACEHOLDERS, to be confirmed: Reborn decides these on its server and its Portable Function
 * shows no price for them.
 * - synthesisStone: Stone per Synthesis. 2011 charged count * 10 Stone, the count rising with
 *   each synthesis of the day (EquipCommon.ini, ComposeSystem 171-189).
 * - impressGold: Gold per Impress attempt. 2011 charged ImpressCost (198 Gold).
 */
export const PORTABLE_FUNCTION_PLACEHOLDERS = { synthesisStone: 0, impressGold: 0 } as const

/** ComposeSystem.CanComposeEquip: Synthesis opens at level 15. */
export const SYNTHESIS_MIN_LEVEL = 15
/** GetSubItemJValue: each catalyst counts RandInt(8, 12) percent of its value. */
const CATALYST_PCT = { min: 8, max: 12 } as const
const GEAR = 'EquipItem'

export interface SynthesisPart {
  itemId: string
  /** EquipIdentifyPropCount of gear; 0 for anything else. */
  lines: number
}

/** IdentifyCountJValue0..4: gear's Synthesis Value by line count (14, 22, 31, 39, 46). */
const lineValues = () =>
  [0, 1, 2, 3, 4].map((n) => Number(equipConfig()[`IdentifyCountJValue${n}`]))
const judge = (itemId: string) => Number(item(itemId)?.JudgeValueScore ?? 0)
const isGear = (itemId: string) => item(itemId)?.class === GEAR

/** Why an item cannot go into a Synthesis slot (OnMainTestAdd / OnSecondaryTestAdd), or null. */
export function synthesisPartProblem(itemId: string, catalyst: boolean): string | null {
  const def = item(itemId)
  if (!def || def.class === 'TaskItem' || Number(def.CanMelting) !== 1)
    return 'That item cannot be synthesized.'
  const level = Number(def.JewelLevel ?? def.AvatarLevel ?? def.PetLevel ?? 1)
  if (catalyst && level >= 2) return 'Only level 1 gems, outfits and pets can be catalysts.'
  return null
}

/** CalculateJValue / CalculateIValue (600-661): the one formula both values use. */
export function composeValue(main: number, catalysts: number) {
  const m = main / 10
  const value = m ** 2 + catalysts - Math.max(m - 2, 0) ** 2 + Math.max(m - 3, 0) ** 2
  return Math.trunc(Math.sqrt(Math.max(value, 0)) * 10)
}

/** GetSubItemIValue: gear counts 1 + its line value, anything else its JudgeValueScore. */
const catalystWeight = (part: SynthesisPart, pct: number) =>
  (pct / 100) * (isGear(part.itemId) ? 1 + (lineValues()[part.lines] ?? 0) : judge(part.itemId))

/** FindFinalIValue: the line count a Synthesis Value gives (46+ = 4 ... below 22 = 0). */
export function linesFor(value: number) {
  return lineValues().reduce((lines, min, n) => (value >= min ? n : lines), 0)
}

let recipesByMain: Map<string, ComposeRecipe[]> | undefined
/** FixedCompose: the recipe for the main item whose three sources match the slots in any order. */
function recipeFor(ids: string[]) {
  recipesByMain ??= Object.values(composeRecipes()).reduce(
    (map, recipe) => map.set(recipe.Src1, [...(map.get(recipe.Src1) ?? []), recipe]),
    new Map<string, ComposeRecipe[]>(),
  )
  const key = [...ids].sort().join()
  return recipesByMain
    .get(ids[0]!)
    ?.find((recipe) => [recipe.Src1, recipe.Src2, recipe.Src3].sort().join() === key)
}

let pools: Map<string, Map<number, string[]>> | undefined
/**
 * GetRandItem: a random item of the main item's class from the highest EquipComposeRand value at or
 * below `value`, CantComposerItem ids left out. Undefined = the failure item.
 */
function randomPick(itemClass: string, value: number, random: Random) {
  pools ??= Object.entries(composeRandom()).reduce((map, [id, row]) => {
    const byValue = map.get(row.class) ?? new Map<number, string[]>()
    byValue.set(row.JudgeValueScore, [...(byValue.get(row.JudgeValueScore) ?? []), id])
    return map.set(row.class, byValue)
  }, new Map<string, Map<number, string[]>>())
  const pool = pools.get(itemClass)
  for (let v = value; pool && v > 0; v--) {
    const ids = pool.get(v)?.filter((id) => !composeBlocked().includes(id))
    if (ids) return ids.length ? ids[random.between(0, ids.length - 1)] : undefined
  }
  return undefined
}

export type SynthesisPlan =
  | { kind: 'recipe'; resultItemId: string; rate: number }
  | {
      kind: 'random'
      rate: number
      /** Gear only: the Synthesis Value range of the result and the line counts it gives. */
      value?: { min: number; max: number; lines: [number, number] }
    }

/** The value random gear rolls its line count from (GetRandomIValue). */
const gearValue = (main: SynthesisPart, catalysts: SynthesisPart[], pct: [number, number]) =>
  composeValue(
    lineValues()[main.lines] ?? 0,
    catalystWeight(catalysts[0]!, pct[0]) + catalystWeight(catalysts[1]!, pct[1]),
  )

/** What the three slots make: a recipe (FixedCompose) or a random item (RandCompose). */
export function synthesisPlan(
  main: SynthesisPart,
  catalysts: [SynthesisPart, SynthesisPart],
): SynthesisPlan | { error: string } {
  const recipe = recipeFor([main.itemId, catalysts[0].itemId, catalysts[1].itemId])
  if (recipe) {
    const target = String(recipe.Target)
    // Target 0 (FeedBack_Common_135) and targets missing from item.ini make nothing.
    if (!item(target)) return { error: 'Those items cannot be synthesized together.' }
    return { kind: 'recipe', resultItemId: target, rate: Number(recipe.Rate ?? 100) }
  }
  if (!isGear(main.itemId)) return { kind: 'random', rate: 100 }
  const min = gearValue(main, catalysts, [CATALYST_PCT.min, CATALYST_PCT.min])
  const max = gearValue(main, catalysts, [CATALYST_PCT.max, CATALYST_PCT.max])
  return { kind: 'random', rate: 100, value: { min, max, lines: [linesFor(min), linesFor(max)] } }
}

export interface SynthesisRoll {
  /** Failed: only the catalysts are used up and nothing is made. */
  success: boolean
  resultItemId?: string
  /** Line count of a random gear result. */
  lines: number
}

/** OnCustomEquipCompose: rolls a plan made by synthesisPlan. */
export function rollSynthesis(
  main: SynthesisPart,
  catalysts: [SynthesisPart, SynthesisPart],
  plan: SynthesisPlan,
  random: Random,
): SynthesisRoll {
  if (plan.kind === 'recipe') {
    const success = random.between(1, 100) <= plan.rate
    return { success, ...(success && { resultItemId: plan.resultItemId }), lines: 0 }
  }
  const pct: [number, number] = [
    random.between(CATALYST_PCT.min, CATALYST_PCT.max),
    random.between(CATALYST_PCT.min, CATALYST_PCT.max),
  ]
  const itemClass = String(item(main.itemId)!.class)
  const gear = itemClass === GEAR
  const value = gear
    ? judge(main.itemId)
    : composeValue(
        judge(main.itemId),
        catalystWeight(catalysts[0], pct[0]) + catalystWeight(catalysts[1], pct[1]),
      )
  const picked = randomPick(itemClass, value, random) ?? String(equipConfig().RandomComposeFailItem)
  // An id item.ini lacks cannot be made (RandomComposeFail): the catalysts are lost.
  if (!item(picked)) return { success: false, lines: 0 }
  const lines = gear && isGear(picked) ? linesFor(gearValue(main, catalysts, pct)) : 0
  return { success: true, resultItemId: picked, lines }
}

// --- Recast (AvatarSystem.OnCustomAvatarRecast; Reborn's Lock / Free toggles) ---

/** Reborn's Recast tab: 0, 1 or 2 locked stats cost 1, 5 or 15 Recast Talismans. */
export const RECAST_COSTS = [1, 5, 15] as const
export const RECAST_TALISMAN = 'i161007'

/** An outfit's ISV bounds per stat (Strength, Agility, Stamina): its avatar's Up to AddMax. */
export interface RecastRange {
  base: [number, number, number]
  max: [number, number, number]
  unit: [number, number, number]
}

export function recastRange(itemId: string): RecastRange | undefined {
  const outfit = outfitOf(itemId)
  const row = avatarRecast(itemId)
  if (!outfit || !row) return undefined
  const avatar = avatarStats(outfit.avatarId)
  return {
    base: [avatar.StrengthUp, avatar.AgilityUp, avatar.StaminaUp],
    max: [row.StrengthAddMax, row.AgilityAddMax, row.StaminaAddMax],
    unit: [row.StrengthUnit, row.AgilityUnit, row.StaminaUnit],
  }
}

/** Unit steps from the base to the cap; 0 = the stat never changes. */
const steps = (range: RecastRange, stat: number) =>
  range.unit[stat]! > 0
    ? Math.max(0, Math.trunc((range.max[stat]! - range.base[stat]!) / range.unit[stat]!))
    : 0
const atMax = (range: RecastRange, isv: readonly number[], stat: number) =>
  isv[stat]! >= range.base[stat]! + steps(range, stat) * range.unit[stat]!

/** A free stat can still move, and not every stat has reached its cap (RECAST_STATE_THREE). */
export function canRecast(range: RecastRange, isv: readonly number[], locked: readonly number[]) {
  const movable = [0, 1, 2].filter((stat) => steps(range, stat) > 0)
  return (
    movable.some((stat) => !locked.includes(stat)) &&
    !movable.every((stat) => atMax(range, isv, stat))
  )
}

/**
 * Each free stat rolls RandInt(0, steps): 0 keeps it, n sets base + n units (2011). Locked stats
 * keep their value.
 */
export function rollRecast(
  range: RecastRange,
  isv: readonly number[],
  locked: readonly number[],
  random: Random,
): [number, number, number] {
  const roll = (stat: number) => {
    const n = locked.includes(stat) ? 0 : random.between(0, steps(range, stat))
    return n > 0 ? range.base[stat]! + n * range.unit[stat]! : isv[stat]!
  }
  return [roll(0), roll(1), roll(2)]
}

/**
 * Strength / Agility / Stamina a recast outfit adds over its avatar's: the base and every level use
 * the ISV instead of the avatar's Up (ComputeRecastProp: base + 8 * (AvatarLevel - 1) * Up;
 * RefreshSystem 141-157: + level * Up).
 */
export function recastBonus(itemId: string, isv: readonly number[], level: number) {
  const outfit = outfitOf(itemId)
  if (!outfit) return undefined
  const avatar = avatarStats(outfit.avatarId)
  const times = 8 * (outfit.plus - 1) + level
  return {
    strength: times * (isv[0]! - avatar.StrengthUp),
    agility: times * (isv[1]! - avatar.AgilityUp),
    stamina: times * (isv[2]! - avatar.StaminaUp),
  }
}

// --- Impress (IdentifySystem.ImpressEquip; Reborn's Main Item + Blade + Crystals) ---

/** ImpressRate.ini by the gear's UseLevel: the common or gold (4th line) rate, if any. */
export function impressBaseRate(useLevel: number, gold: boolean) {
  const level = Math.max(1, useLevel)
  const row = impressRates().find((r) => level >= r.MinLevel && level <= r.MaxLevel)
  return row && (gold ? row.GoldIdentifyPropRate : row.CommonIdentifyPropRate)
}

/**
 * Crystals add `count * ImpressRate`. At 100 or more the impress cannot fail and uses only the
 * crystals it needs; below, every crystal is spent on the roll.
 */
export function impressOdds(base: number, crystals: number, perCrystal: number) {
  if (base + crystals * perCrystal < 100) {
    return { rate: base + crystals * perCrystal, crystalsUsed: crystals }
  }
  const needed = perCrystal > 0 ? Math.ceil(Math.max(0, 100 - base) / perCrystal) : 0
  return { rate: 100, crystalsUsed: Math.min(crystals, needed) }
}

/** `RandInt(0, 100) <= rate`, sure at 100. */
export const rollImpress = (rate: number, random: Random) =>
  rate >= 100 || random.between(0, 100) <= rate
