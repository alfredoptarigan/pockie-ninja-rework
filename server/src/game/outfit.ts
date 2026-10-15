// Outfits as items (Reborn's Outfit slot): an AvatarItem worn in the 'Outfit' slot of an
// equipment set. characters.clothing / avatar_id always follow the active set's outfit, else set
// I's (Reborn's fallback); syncOutfit keeps them in step after an equip or a set switch.
import { and, eq } from 'drizzle-orm'
import { characters, inventoryItems } from '../db/schema.js'
import type { Bonuses, SkillAddKey } from '@pockie/game-core'
import {
  OUTFIT_STARS,
  RECAST_MAX_MULTIPLIER,
  isStarredImprint,
  outfitStat,
  starIsv,
  starTier,
} from '@pockie/shared'
import { avatarSkillIds, avatarStats, item, rebornOutfits } from './data.js'
import type { Tx } from './progress.js'

export const OUTFIT_SLOT = 'Outfit'
/** Reborn's requirement grows over +2..+32. */
const LEVEL_STEPS = 31

/**
 * Reborn's outfit level requirement (item tooltip): 1 up to +1, then ceil((plus - 1) * r / 31),
 * r by the outfit value (27 -> 0, 35 -> 20, 60 -> 60, anything else -> 50); r = 0 needs level 1.
 */
export function outfitRequiredLevel(plus: number, value: number) {
  const max = value === 27 ? 0 : value === 35 ? 20 : value === 60 ? 60 : 50
  return plus <= 1 || max === 0 ? 1 : Math.ceil(((plus - 1) * max) / LEVEL_STEPS)
}

export interface OutfitFacts {
  clothing: number
  avatarId: number
  /** Reborn's "+N" (props.level): AvatarLevel - 1, so a fresh outfit is +0 like 2011's names. */
  plus: number
  /** Reborn's outfit value (its Synthesis Value), else our JudgeValueScore. */
  value: number
  /** Required character level. */
  level: number
}

/** The outfit facts of an AvatarItem id, or undefined for any other item. */
export function outfitOf(itemId: string): OutfitFacts | undefined {
  const def = item(itemId)
  if (def?.class !== 'AvatarItem') return undefined
  const plus = Number(def.AvatarLevel) - 1
  const clothing = Number(def.Clothing)
  const value = rebornOutfits().outfits[String(clothing)]?.value ?? Number(def.JudgeValueScore ?? 0)
  return {
    clothing,
    avatarId: Number(def.AvatarID),
    plus,
    value,
    level: outfitRequiredLevel(plus, value),
  }
}

type Triple = [number, number, number]
const triple = (f: (i: number) => number): Triple => [f(0), f(1), f(2)]

/**
 * An outfit's ISV in hundredths (Strength, Agility, Stamina): Reborn's own ISV, or a recast held
 * within [ISV, recast cap]; `max` is the cap, Reborn's recastMaxIsv = round(1.1 * ISV).
 */
export function outfitIsv(itemId: string, recast?: readonly number[]) {
  const outfit = outfitOf(itemId)
  if (!outfit) return undefined
  const avatar = avatarStats(outfit.avatarId)
  const base = [avatar.StrengthUp, avatar.AgilityUp, avatar.StaminaUp]
  // Reborn's float path: Math.round(1.1 * isv * 100) / 100 with isv in points.
  const max = triple((i) => Math.round(RECAST_MAX_MULTIPLIER * (base[i]! / 100) * 100))
  const isv = triple((i) => Math.min(max[i]!, Math.max(base[i]!, recast?.[i] ?? base[i]!)))
  return { isv, max }
}

/** The worn outfit as equipmentBonuses sees it: its row's stars and recast ISV. */
export interface WornOutfit {
  itemId: string
  stars: number
  isv?: readonly number[]
}

const STATS = ['strength', 'agility', 'stamina'] as const
const UPS = ['StrengthUp', 'AgilityUp', 'StaminaUp'] as const
const BASES = ['Strength', 'Agility', 'Stamina'] as const
/** SkillAdd units are percent * 100. */
const SKILL_ADD_PER_PERCENT = 100

/**
 * What the worn outfit adds over its avatar row (which deriveStats already counts): Reborn's
 * stat 20 ISV + 8 ISV per +N + ISV per level with the recast ISV and the star bonuses, minus the
 * row's, and the fourth star's imprint points.
 */
export function outfitBonuses(worn: WornOutfit, level: number): Partial<Bonuses> {
  const outfit = outfitOf(worn.itemId)
  const own = outfitIsv(worn.itemId, worn.isv)
  if (!outfit || !own) return {}
  const avatar = avatarStats(outfit.avatarId)
  const tier = starTier(outfit.plus, worn.stars)
  const bonuses: Partial<Bonuses> = Object.fromEntries(
    STATS.map((stat, i) => {
      const isv = starIsv(own.isv[i]! / 100, worn.stars)
      // Hundredths; the epsilon keeps 2519.9999... from a float product at 2520.
      const value = Math.floor(outfitStat(isv, tier, level) * 100 + 1e-6)
      return [stat, value - (avatar[BASES[i]!] + level * avatar[UPS[i]!])]
    }),
  )
  const imprint = avatarSkillIds(outfit.avatarId)?.[3] ?? 0
  if (worn.stars >= 4 && isStarredImprint(imprint)) {
    const tree = Math.floor((imprint - 2000) / 10)
    bonuses[`skillAdd${tree}` as SkillAddKey] =
      OUTFIT_STARS.fourStarImprintBonusPercent * SKILL_ADD_PER_PERCENT
  }
  return bonuses
}

/** Reborn's fifth star: the Secret Technique fires below 20% HP instead of 15%. */
export const secretThreshold = (stars: number) =>
  stars >= 5 ? OUTFIT_STARS.fiveStarSecretTechniqueThresholdPercent : undefined

const outfitInSet = async (tx: Tx, characterId: string, set: number) => {
  const [row] = await tx
    .select({ itemId: inventoryItems.itemId })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.characterId, characterId),
        eq(inventoryItems.equippedSlot, OUTFIT_SLOT),
        eq(inventoryItems.equippedSet, set),
      ),
    )
  return row && outfitOf(row.itemId)
}

/**
 * Sets clothing / avatar_id from the active set's outfit, else set I's; leaves them as they are
 * when neither wears one. The caller holds the character lock.
 */
export async function syncOutfit(tx: Tx, characterId: string, activeSet: number) {
  const outfit =
    (await outfitInSet(tx, characterId, activeSet)) ?? (await outfitInSet(tx, characterId, 1))
  if (!outfit) return
  await tx
    .update(characters)
    .set({ clothing: outfit.clothing, avatarId: outfit.avatarId })
    .where(eq(characters.id, characterId))
}
