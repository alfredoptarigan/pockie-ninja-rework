// PLACEHOLDERS: Reborn keeps the Konoha Boutique's numbers on its server (reborn-lazy-features.md,
// "Not determinable from client code": symbol payouts, bonus symbol, level table, buy tiers,
// exchange rewards, chest / double odds). Nothing in data/reborn-raw has them, so these are ours
// until the user confirms them. Spec values (paylines, x3 / x10 / x50, free coins) live in
// BOUTIQUE_RULES (shared/src/schemas/konoha-boutique.ts).
import type {
  BoutiqueCurrency,
  BoutiqueLevels,
  BoutiqueSymbol,
} from '../../../../shared/src/schemas/konoha-boutique.js'

export const BOUTIQUE_PLACEHOLDERS = {
  /** [total EXP, max multiplier, max lines] per level 1-10. */
  levels: {
    1: [0, 1, 5],
    2: [1_000, 2, 9],
    3: [5_000, 3, 13],
    4: [15_000, 4, 17],
    5: [40_000, 5, 21],
    6: [80_000, 6, 25],
    7: [150_000, 7, 25],
    8: [300_000, 8, 25],
    9: [600_000, 9, 25],
    10: [1_000_000, 10, 25],
  } satisfies BoutiqueLevels,
  /** Boutique EXP per coin bet. */
  expPerCoin: 1,
  /** Reel weights (every cell rolls on its own). */
  weights: {
    j: 30,
    q: 28,
    k: 26,
    a: 24,
    '9': 22,
    '10': 20,
    pic1: 14,
    pic2: 11,
    pic3: 8,
    pic4: 5,
    pic5: 6,
  } satisfies Record<BoutiqueSymbol, number>,
  /** Line pay per symbol, times the multiplier and the x3 / x10 / x50 match payout. */
  values: {
    j: 10,
    q: 10,
    k: 12,
    a: 12,
    '9': 15,
    '10': 15,
    pic1: 25,
    pic2: 40,
    pic3: 60,
    pic4: 100,
  } satisfies Partial<Record<BoutiqueSymbol, number>>,
  /** The bonus symbol (Naruto): 3 anywhere start a Bonus Round; it pays on no line. */
  bonusSymbol: 'pic5' as BoutiqueSymbol,
  bonusSymbolsNeeded: 3,
  /** A chest pays the spin's bet times one of these, picked uniformly. */
  chestMultipliers: [1, 1, 2, 2, 3, 5],
  /** Chance in percent that a winning spin's coins go to a Double Chance instead of the balance. */
  doubleChancePercent: 20,
  /** Double Chance numbers run 1-9; the operator is higher or lower at even odds. */
  doubleNumberMax: 9,
  buyTiers: {
    gold: [
      [10, 1_000],
      [50, 5_500],
      [100, 12_000],
    ],
    stone: [
      [100_000, 1_000],
      [500_000, 5_500],
    ],
    giftCoupon: [
      [100, 1_000],
      [500, 5_500],
      [1_000, 12_000],
    ],
  } satisfies Record<BoutiqueCurrency, [number, number][]>,
  /** Exchange Rewards (Buy Items); ids are stable keys the client sends back. */
  rewards: [
    { id: 'hp-potion', itemId: 'i160010', amount: 10, price: 500 }, // Healing Draught
    { id: 'mp-potion', itemId: 'i160020', amount: 10, price: 500 }, // Chakra Draught
    { id: 'stone-bag', itemId: 'i150112', amount: 1, price: 2_000 }, // Level 5 Stone Bag
    { id: 'honor-bag', itemId: 'i150156', amount: 1, price: 5_000 }, // Level 9 Honor Bag
    { id: 'lucky-gem', itemId: 'i150302', amount: 1, price: 8_000 }, // Lucky Gem
    { id: 'exp-seal', itemId: 'i120002', amount: 1, price: 3_000 }, // Exp Seal
    { id: 'exp-bag', itemId: 'i150177', amount: 1, price: 6_000 }, // Level 10 Exp Bag
    { id: 'card-pack', itemId: 'i171002', amount: 1, price: 4_000 }, // Blue Card Pack
    { id: 'outfit-10', itemId: 'i290010', amount: 1, price: 20_000 }, // Grimmjow Jaegerjaquez outfit
    { id: 'outfit-50', itemId: 'i290050', amount: 1, price: 20_000 }, // 2nd Hokage outfit
    { id: 'outfit-98', itemId: 'i290098', amount: 1, price: 60_000 }, // Kyuubi Naruto outfit
  ],
} as const
