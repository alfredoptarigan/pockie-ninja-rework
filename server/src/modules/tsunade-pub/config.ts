// PLACEHOLDERS: Reborn keeps the Tsunade Pub prize pool, weights and sell values on its server
// (reborn-lazy-features.md, "Not determinable from client code"). These are ours until the user
// confirms them. The spec's values (free spins, cost, bonus / legendary cadence, Valhalla and
// unbound chances) live in TSUNADE_PUB_RULES (shared/src/schemas/tsunade-pub.ts).
import type { PubRarity } from '../../../../shared/src/schemas/tsunade-pub.js'

export const TSUNADE_PUB_PLACEHOLDERS = {
  /**
   * Tier weights in percent. Reborn's guide: Common ~60, Uncommon ~25, Rare ~12, Epic ~2-3,
   * Legendary "guaranteed @100"; the 0.5 left over is our base Legendary chance.
   */
  tierWeights: { common: 60, uncommon: 25, rare: 12, epic: 2.5, legendary: 0.5 },
  /**
   * The pool per tier, one picked uniformly. Items come from our 2011 treasure-box pool
   * (OpenBoxSystem, treasure-data.json) plus shop potions, the Blue Card Pack and a wing, sorted
   * into Reborn's tier examples.
   */
  prizes: {
    common: [
      { itemId: 'i160010', amount: 5 }, // Healing Draught (HP potion)
      { itemId: 'i160020', amount: 5 }, // Chakra Draught (MP potion)
      { itemId: 'i150110', amount: 1 }, // Level 3 Stone Bag
      { itemId: 'i150112', amount: 1 }, // Level 5 Stone Bag
      { itemId: 'i160101', amount: 1 }, // Gray Outfit Wishing Pot
      { itemId: 'i100004', amount: 1 }, // Seal Breaker
    ],
    uncommon: [
      { itemId: 'i150172', amount: 1 }, // Level 5 Exp Bag
      { itemId: 'i150177', amount: 1 }, // Level 10 Exp Bag
      { itemId: 'i120002', amount: 1 }, // Exp Seal
      { itemId: 'i150156', amount: 1 }, // Level 9 Honor Bag (medal bag)
      { itemId: 'i160102', amount: 1 }, // Blue Outfit Wishing Pot
    ],
    rare: [
      { itemId: 'i150302', amount: 1 }, // Lucky Gem
      { itemId: 'i171002', amount: 1 }, // Blue Card Pack
      { itemId: 'i160103', amount: 1 }, // Orange Outfit Wishing Pot
      { itemId: 'i160111', amount: 1 }, // S-Rank Outfit Wishing Pot
      { itemId: 'i152046', amount: 1 }, // Level 10 Stone Bag
    ],
    epic: [
      { itemId: 'i159006', amount: 1 }, // 500,000 Stone Bag (large bag)
      { itemId: 'i159005', amount: 1 }, // 300 Gift Coupon Bag
      { itemId: 'i159102', amount: 1 }, // Recast Talisman*3
      { itemId: 'i152045', amount: 1 }, // Luxury Pet Box
      { itemId: 'i160104', amount: 1 }, // Legend Wishing Pot
    ],
    legendary: [
      { itemId: 'i160107', amount: 1 }, // +21 Pet Wishing Pot (enhanced pet)
      { itemId: 'i160105', amount: 1 }, // +27 Orange Outfit Wishing Pot
      { itemId: 'i218000', amount: 1 }, // a wing
      { itemId: 'i290098', amount: 1 }, // Kyuubi Naruto outfit
      { itemId: 'i159004', amount: 1 }, // 1000 Gift Coupon Bag (high-end reward)
    ],
  } satisfies Record<PubRarity, { itemId: string; amount: number }[]>,
  /** Stone per prize when its item has no shop sell price (Price x amount wins otherwise). */
  sellStone: { common: 100, uncommon: 500, rare: 2_000, epic: 10_000, legendary: 50_000 },
  /** Valhalla gear: refinement lines rolled when collected (our equipment maximum). */
  valhallaLines: 4,
  /** Valhalla gear's rarity frame (Reborn: orange quality). */
  valhallaRarity: 'epic' as PubRarity,
  /** Unclaimed prizes kept at most (5 pages of 80 tiles); a full list refuses spins. */
  maxUnclaimed: 400,
} as const
