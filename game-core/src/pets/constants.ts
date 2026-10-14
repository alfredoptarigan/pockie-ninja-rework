// Pet numbers (m6-companions.plan.md decisions 10-18). 2011 tables come from
// server/data/game/reborn/pet-foods.json (PetCfg, PetGrow, PetSkillCnt, PetActCapital); every value
// marked "ours" is a design choice and can be tuned here.
import data from '../../../server/data/game/reborn/pet-foods.json'

/** CapitalDefine / pvp-rankings.md: 0 Stone, 2 Gold, 3 Gift Coupon. */
export const CAPITAL_STONE = 0
export const CAPITAL_GOLD = 2
export const CAPITAL_GIFT_COUPON = 3

/** Decision 10: `PetCfg maxlevel` 50; a pet never passes its master's level (ours). */
export const PET_MAX_LEVEL = data.maxLevel

/** Decision 12 (ours): the active pet gets this percent of the master's fight EXP. */
export const PET_EXP_SHARE_PERCENT = 50

/**
 * Decision 17: `OwnCount` 1 free kennel slot, up to `MaxCount` 5. Each extra slot costs
 * `ActiveCapital` 100 of capital type 2, Gold (`OnCustomActPos`: `needType = 2`).
 */
export const KENNEL_FREE_SLOTS = data.grow.OwnCount
export const KENNEL_MAX_SLOTS = data.grow.MaxCount
export const KENNEL_SLOT_PRICE = data.grow.ActiveCapital
export const KENNEL_SLOT_CAPITAL = CAPITAL_GOLD

/** Decision 18 (ours): evolving needs pet level 30 and 50 Feathers and adds 20 growth. */
export const EVOLVE_LEVEL = 30
export const EVOLVE_FEATHERS = 50
export const EVOLVE_GROWTH = 20

/** Decision 13: appetite cap (`HungerMax`) and digestion time (`PetDigestTime`, seconds). */
export const HUNGER_MAX = data.grow.HungerMax
export const DIGEST_SECONDS = data.grow.PetDigestTime
/**
 * "Finish now" (`OnCustomAtonceDigest`): `DigestAtOnceCapital` 8 of capital type 2 Gold or 3 Gift
 * Coupon, the player's choice (any other type is refused).
 */
export const DIGEST_AT_ONCE_PRICE = data.grow.DigestAtOnceCapital
export const DIGEST_AT_ONCE_CAPITALS = [CAPITAL_GOLD, CAPITAL_GIFT_COUPON] as const

/** Decision 14: `MaxSkillCount` learned skills; skill slots cost Stone (`OnCustomActSkill`). */
export const MAX_LEARNED_SKILLS = data.grow.MaxSkillCount
export const MAX_SLOTS_PER_KIND = 6
export const SKILL_SLOT_CAPITAL = CAPITAL_STONE
/** `OnCustomPetSkillLock`: at most 2 locked skills; the 1st costs 1 lock item, the 2nd 2. */
export const MAX_LOCKED_SKILLS = 2
export const PET_LOCK_ITEM = data.grow.PetLockItem
export const PET_SKILL_REMOVE_ITEM = data.grow.PetSkillRemoveItem

export type PetProp = 'attack' | 'defence' | 'disturb' | 'active' | 'savvy'
export type PetProps = Record<PetProp, number>
export const PET_PROPS: readonly PetProp[] = ['attack', 'defence', 'disturb', 'active', 'savvy']

/**
 * Base props (ours, decision 11b): every 2011 `PetSrcPro` prop is 0, so these replace them.
 * Per nature (1 Plant, 2 Beast, 3 Artificial, 4 Dragon, 5 Tailed Beast, 6 Spirits) at required
 * level 30. Profiles sum to 50 points for natures 1-3 (growth 100-120), 44 for 4 and 6 (growth
 * 120-180) and 38 for 5 (growth 150-180), so growth does not push the strong natures far ahead.
 */
export const NATURE_BASE_PROPS: Record<number, PetProps> = {
  1: { attack: 6, defence: 14, disturb: 10, active: 8, savvy: 12 },
  2: { attack: 14, defence: 8, disturb: 10, active: 10, savvy: 8 },
  3: { attack: 8, defence: 14, disturb: 12, active: 8, savvy: 8 },
  4: { attack: 12, defence: 8, disturb: 7, active: 7, savvy: 10 },
  5: { attack: 9, defence: 8, disturb: 7, active: 7, savvy: 7 },
  6: { attack: 7, defence: 7, disturb: 9, active: 12, savvy: 9 },
}
/** Ours: percent of the level-30 profile for each Reborn required level (item field 1). */
export const LEVEL_BAND_PERCENT: Record<number, number> = { 30: 100, 40: 110, 50: 120 }
/** Ours: an evolved form (a `petFamilies` child) has +20% base props. */
export const EVOLVED_PERCENT = 120

/**
 * Ours: one master bonus point per this many pet prop points (the 2011 fight never reads the
 * totals). Attack adds to both weapon attack terms, Defence to defense, Disturb to hit, Active to
 * dodge and Savvy to crit. Sized so a median level-50 pet's props add about 3% fight power; PET_ATTACK
 * brings the rest (11b).
 */
export const PROP_POINTS_PER_BONUS: PetProps = {
  attack: 420,
  defence: 27,
  disturb: 54,
  active: 66,
  savvy: 108,
}
