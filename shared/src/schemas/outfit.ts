// Outfits as items: Manage Outfit (Visual Outfit) and the Wardrobe (reborn-windows-M-Z-hud.md).
import { z } from 'zod'
import type { BagActionResult, InventoryItemView } from './bag.js'

/** Reborn's Wardrobe: 4 pages of 5 slots. */
export const WARDROBE_PAGES = 4
export const WARDROBE_PAGE_SLOTS = 5
export const WARDROBE_SLOTS = WARDROBE_PAGES * WARDROBE_PAGE_SLOTS
/** Manage Outfit: setting a Visual Outfit costs this much gold; removing it is free. */
export const VISUAL_OUTFIT_GOLD = 250

const wardrobeSlot = z
  .number()
  .int()
  .min(0)
  .max(WARDROBE_SLOTS - 1)

/** POST /api/game/outfit/visual */
export const visualOutfitSchema = z.object({ inventoryId: z.uuid() }).strict()
/** POST /api/game/wardrobe/store (Reborn's moveItemToWardrobe). */
export const wardrobeStoreSchema = z.object({ inventoryId: z.uuid(), slot: wardrobeSlot }).strict()
/** POST /api/game/wardrobe/take (Reborn's moveItemFromWardrobe / clearWardrobe). */
export const wardrobeTakeSchema = z.object({ slot: wardrobeSlot }).strict()

/** An outfit stored in the Wardrobe. */
export interface WardrobeItemView extends InventoryItemView {
  wardrobeSlot: number
}

/** GET /api/game/wardrobe */
export interface WardrobeView {
  items: WardrobeItemView[]
}

/** What the Wardrobe actions return: the character, the bag and the Wardrobe. */
export interface WardrobeActionResult extends BagActionResult {
  wardrobe: WardrobeItemView[]
}

/**
 * Reborn's avatarStars (serverConfig; its client ships the same defaults). The server reads
 * reborn/outfits.json, which a test keeps equal to this. See docs/audit/reborn-outfit-pet-re.md.
 */
export const OUTFIT_STARS = {
  maxStars: 5,
  /** The +N the main outfit and both catalysts need to gain a star by Synthesis. */
  requiredEnhancement: 32,
  requireUnstarredCatalysts: true,
  baseSkillSlots: 6,
  oneStarIsvBonusPercent: 5,
  twoStarSkillSlots: 1,
  threeStarBonusEnhancements: 1,
  fourStarImprintBonusPercent: 5,
  fiveStarSecretTechniqueThresholdPercent: 20,
  fiveStarSkillSlots: 1,
} as const
/** Reborn's top +N (serverConfig synthesisLevelUpRates[0] has 32 steps); 2011 stopped at +31. */
export const OUTFIT_MAX_TIER = 32
/** The +N a star needs: Reborn's requirement, capped at the highest outfit. */
export const STAR_REQUIRED_TIER = Math.min(OUTFIT_STARS.requiredEnhancement, OUTFIT_MAX_TIER)
/** Reborn's recastMaxIsv: 1.1 times the outfit's own ISV. */
export const RECAST_MAX_MULTIPLIER = 1.1

/** Reborn's star-adjusted ISV (nh): +5% from the first star. */
export const starIsv = (isv: number, stars: number) =>
  stars >= 1 ? isv * (1 + OUTFIT_STARS.oneStarIsvBonusPercent / 100) : isv
/** Reborn's star-adjusted +N (hq): +1 from the third star. */
export const starTier = (tier: number, stars: number) =>
  tier + (stars >= 3 ? OUTFIT_STARS.threeStarBonusEnhancements : 0)
/**
 * Reborn's outfit stat (tooltip x()): 20 ISV + 8 ISV per +N + ISV per character level, ISV in
 * points per level (1.2, not our 120). The tooltip floors it.
 */
export const outfitStat = (isv: number, tier: number, level: number) =>
  20 * isv + 8 * isv * tier + isv * level
/** The imprints the fourth star raises (Reborn ap(): the element passives 20x0-20x2). */
export const isStarredImprint = (id: number) => id >= 2000 && id <= 2092 && id % 10 <= 2
/** Skill bar slots: 6, a 7th from the second star, an 8th from the fifth. */
export const skillSlotsFor = (stars: number) =>
  OUTFIT_STARS.baseSkillSlots +
  (stars >= 2 ? OUTFIT_STARS.twoStarSkillSlots : 0) +
  (stars >= 5 ? OUTFIT_STARS.fiveStarSkillSlots : 0)
