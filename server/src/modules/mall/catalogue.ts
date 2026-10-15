// Ninja Mall catalogue. Reborn keeps its catalogue on its server (reborn-lazy-features.md "Ninja
// Mall": catalogue, prices, limits and level locks are UNKNOWN), so this is the 2011 Mall:
// - items, prices and currencies: commerce/virtualshop.ini (server prices `capital2` Gold =
//   `capial3` Gift Certificates for every row) joined with the client table
//   DT/virtualshop.s29901.tab (row order, `PayType` 1 = Gold only, 3 = Gold or Gift Certificates;
//   `SubTabID` -> tabs by its first digit, DT/supershoptab: 1 Hot, 2 Food, 3 Gem, 4 Pet, 5 VIP,
//   6 Other). The five server-only rows (i159388-i159390, i159367-i159368) have no client row
//   and stay out, as in 2011.
// - left out: the S/A/B/C Secret Technique Scrolls (i159000-i159003), withheld like the
//   refresh shops do (shop/data.ts) while the skills-gap rollout is reviewed.
// - left out: items with no icon in 2011 or in Reborn: Ham and Egg Cake (i120007), Skip Card
//   (i152039) and the Mark / Seal / Stamp of Special Training (i150400-i150402).
// - 2011 VIP prices equal the normal ones on the server, so there is no VIP discount.
// - Gold buys unbound items, Gift Certificates bound ones (VirtualShopSystem, 2011).
import type { MallGroupKey } from '../../../../shared/src/schemas/mall.js'

export interface MallEntry {
  itemId: string
  price: number
  /** Also sold for Gift Certificates (2011 PayType 3). */
  coupons: boolean
  groups: MallGroupKey[]
  dailyLimit?: number
}

/**
 * PLACEHOLDERS the user must confirm: 2011 has no purchase limits (`count` -1 everywhere) and
 * Reborn's are unknown. Item -> purchases a day (UTC).
 */
export const MALL_DAILY_LIMIT_PLACEHOLDERS: Readonly<Record<string, number>> = {
  i150270: 1, // 3 Day VIP
}

type Row = [itemId: string, price: number, coupons: boolean, groups: string]
// prettier-ignore
const ROWS: Row[] = [
  ['i161009', 8, false, 'hot'], // High Level Inscription Talisman
  ['i170127', 45, true, 'hot,pet'], // Midsized Beans
  ['i141011', 30, true, 'hot,other'], // Apprentice Panel Opening Book
  ['i350001', 20, true, 'gem'], // Lv.1 Engrave Blade
  ['i350002', 24, true, 'gem'], // Lv.2 Engrave Blade
  ['i350003', 28, true, 'gem'], // Lv.3 Engrave Blade
  ['i350004', 32, true, 'gem'], // Lv. 4 Carving Blade
  ['i350005', 36, true, 'gem'], // Lv. 5 Carving Blade
  ['i350006', 40, true, 'hot,gem'], // Lv.6 Carving Blade
  ['i350007', 44, true, 'gem'], // Lv. 7 Carving Blade
  ['i350008', 48, true, 'gem'], // Lv. 8 Carving Blade
  ['i170110', 18, true, 'hot,pet'], // Watermelon
  ['i152098', 28, false, 'hot'], // Gold Treasure Jar
  ['i152099', 28, false, 'hot'], // Diamond Treasure Jar
  ['i152100', 38, false, 'hot'], // Special Treasure Jar
  ['i152101', 18, false, 'hot'], // Special Gem Jar
  ['i152043', 18, false, 'hot'], // Mystic Jar
  ['i180001', 188, true, 'hot,pet'], // Attack
  ['i180007', 188, true, 'hot,pet'], // Block
  ['i110101', 8, true, 'hot,gem'], // Ruby Level 1
  ['i110102', 24, true, 'gem'], // Ruby Level 2
  ['i110103', 40, true, 'hot,gem'], // Ruby Level 3
  ['i110201', 8, true, 'hot,gem'], // Sapphire Level 1
  ['i110202', 24, true, 'gem'], // Sapphire Level 2
  ['i110203', 40, true, 'gem'], // Sapphire Level 3
  ['i110301', 8, true, 'hot,gem'], // Topaz Level 1
  ['i110302', 24, true, 'gem'], // Topaz Level 2
  ['i110303', 40, true, 'hot,gem'], // Topaz Level 3
  ['i110401', 8, true, 'gem'], // Emerald Level 1
  ['i110402', 24, true, 'gem'], // Emerald Level 2
  ['i110403', 40, true, 'gem'], // Emerald Level 3
  ['i110501', 8, true, 'hot,gem'], // Diamond Level 1
  ['i110502', 24, true, 'gem'], // Diamond Level 2
  ['i110503', 40, true, 'hot,gem'], // Diamond Level 3
  ['i110601', 8, true, 'gem'], // Agate Level 1
  ['i110602', 24, true, 'gem'], // Agate Level 2
  ['i110603', 40, true, 'gem'], // Agate Level 3
  ['i150554', 38, true, 'food'], // Level 31 Cake Box
  ['i150555', 38, true, 'food'], // Level 41 Cake Box
  ['i150556', 38, true, 'food'], // Level 51 Cake Box
  ['i150557', 38, true, 'food'], // Level 61 Cake Box
  ['i150580', 38, true, 'food'], // Level 71 Cake Box
  ['i159039', 38, true, 'food'], // Lv.81 Cake Box
  ['i120001', 18, true, 'food'], // Sushi
  ['i120019', 18, true, 'food'], // HP Candy
  ['i120049', 18, true, 'food'], // Chakra Candy
  ['i120020', 18, true, 'food'], // HP Candy
  ['i120021', 18, true, 'food'], // Premium Chakra Candy
  ['i120022', 14, true, 'hot,food'], // Sushi
  ['i120023', 14, true, 'hot,food'], // Bun
  ['i120024', 14, true, 'hot,food'], // Longbread
  ['i120025', 14, true, 'hot,food'], // Roast Meat
  ['i120035', 14, true, 'food'], // Steamed Bun
  ['i120036', 14, true, 'food'], // Whole Wheat Bread
  ['i120037', 14, true, 'hot,food'], // Roast Meat
  ['i120038', 14, true, 'food'], // Curry Beef Rice
  ['i120039', 14, true, 'food'], // Sandwich Roll
  ['i120040', 14, true, 'hot,food'], // Roast Pig
  ['i180028', 288, true, 'pet'], // Dragonmight
  ['i180029', 288, true, 'hot,pet'], // Dragonscale
  ['i150270', 28, false, 'hot,vip'], // 3 Day VIP
  ['i150271', 68, false, 'vip'], // 7 Day VIP
  ['i150272', 258, false, 'vip'], // 30 Day VIP
  ['i150274', 80, true, 'hot,gem'], // Level 1 Ruby Bag
  ['i150279', 80, true, 'hot,gem'], // Level 1 Sapphire Bag
  ['i150284', 80, true, 'gem'], // Level 1 Topaz Bag
  ['i150294', 80, true, 'gem'], // Level 1 Reserve Gem Bag
  ['i150289', 80, true, 'gem'], // Level 1 Diamond Bag
  ['i150299', 80, true, 'hot,gem'], // Level 1 Agate Bag
  ['i120002', 18, true, 'food'], // Exp Seal
  ['i120003', 8, true, 'food'], // Exp Mark
  ['i150343', 3, true, 'hot,other'], // 1 Hour Talisman
  ['i150344', 18, true, 'hot,other'], // 4 Hours Talisman
  ['i150399', 45, true, 'hot,other'], // 8 Hours Talisman
  ['i150405', 35, true, 'hot,pet'], // Pet Egg
  ['i170112', 18, true, 'hot,pet'], // Little Beans
  ['i150406', 28, true, 'hot,pet'], // Pet Skill Lock
  ['i150407', 340, true, 'hot,pet'], // Pet Egg Gift Box
  ['i120005', 18, true, 'hot,food'], // French Steak
  ['i120006', 18, true, 'hot,food'], // Omelette Rice
  ['i180002', 288, true, 'hot,pet'], // Leather Armor
  ['i180003', 288, true, 'hot,pet'], // Fence Sitter
  ['i180004', 288, true, 'hot,pet'], // Armor Corrosion
  ['i180005', 288, true, 'hot,pet'], // Mystic Energy
  ['i180008', 288, true, 'hot,pet'], // Dragon Wing
  ['i180009', 288, true, 'hot,pet'], // False Tooth
  ['i180010', 288, true, 'hot,pet'], // Natural Enemy
  ['i180012', 288, true, 'hot,pet'], // Aiming Device
  ['i180013', 288, true, 'hot,pet'], // Costume Clone
  ['i180014', 288, true, 'hot,pet'], // Nihility
  ['i180015', 288, true, 'hot,pet'], // X-ray Vision
  ['i120050', 19, true, 'food'], // Ichiraku Ramen
  ['i120051', 19, true, 'food'], // Shrimp Fried Rice
  ['i120052', 19, true, 'food'], // Sea Urchin Chicken Burger
]

export const MALL_CATALOGUE: readonly MallEntry[] = ROWS.map(
  ([itemId, price, coupons, groups]) => ({
    itemId,
    price,
    coupons,
    groups: groups.split(',') as MallGroupKey[],
    dailyLimit: MALL_DAILY_LIMIT_PLACEHOLDERS[itemId],
  }),
)
