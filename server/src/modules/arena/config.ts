// Arena extras: Buy Tickets, Weekly Rewards, Squad Arena 3v3 and the Championship. Values read
// from Reborn's client are marked "spec"; everything under a *_PLACEHOLDERS constant is a number
// Reborn keeps on its server, ours until the user confirms it.

/** Buy Arena Tickets (spec: 100 Gift Certificates each, 1-20 per purchase). */
export const ARENA_TICKETS = { giftCoupons: 100, maxPerPurchase: 20 } as const
/** Buy Squad Arena Tickets (spec: 200 Gift Certificates each, 1-10 per purchase). */
export const SQUAD_TICKETS = { giftCoupons: 200, maxPerPurchase: 10 } as const

/** Weekly Rewards rules from the window's tooltip (spec). */
export const WEEKLY_RULES = {
  /** Ranks 1-50 earn points every hour. */
  rankedPlaces: 50,
  /** Points per hour for ranks 1-9; ranks 10-50 earn 1. */
  hourlyPoints: [10, 9, 8, 7, 6, 5, 4, 3, 2] as readonly number[],
  /** "Weekly reward mail expires 5 days after the reset." */
  claimDays: 5,
} as const

export interface WeeklyReward {
  /** 1-10, then 50 for ranks 11-50 (spec). */
  place: number
  /** Arena: Honor (Reborn's "Medals"); Squad Arena: Team Coins. */
  medals: number
  giftCoupons: number
  gold: number
  items: string[]
}

const tier = (place: number, medals: number, giftCoupons: number, gold: number, items: string[]) =>
  ({ place, medals, giftCoupons, gold, items }) satisfies WeeklyReward

// Level 10 Exp Bag, Level 5 Exp Bag, Lucky Gem.
const EXP_BAG_10 = 'i150177'
const EXP_BAG_5 = 'i150172'
const LUCKY_GEM = 'i150302'

/** PLACEHOLDERS: the reward table (Reborn sends `rewards[]` from its server). */
export const WEEKLY_REWARD_PLACEHOLDERS = {
  arena: [
    tier(1, 1000, 100, 50, [EXP_BAG_10, LUCKY_GEM]),
    tier(2, 800, 80, 30, [EXP_BAG_10]),
    tier(3, 600, 60, 20, [EXP_BAG_10]),
    tier(4, 500, 50, 0, [EXP_BAG_5]),
    tier(5, 450, 45, 0, [EXP_BAG_5]),
    tier(6, 400, 40, 0, [EXP_BAG_5]),
    tier(7, 350, 35, 0, []),
    tier(8, 300, 30, 0, []),
    tier(9, 250, 25, 0, []),
    tier(10, 200, 20, 0, []),
    tier(50, 100, 10, 0, []),
  ],
  squad: [
    tier(1, 2000, 100, 50, [EXP_BAG_10, LUCKY_GEM]),
    tier(2, 1600, 80, 30, [EXP_BAG_10]),
    tier(3, 1200, 60, 20, [EXP_BAG_10]),
    tier(4, 1000, 50, 0, [EXP_BAG_5]),
    tier(5, 900, 45, 0, [EXP_BAG_5]),
    tier(6, 800, 40, 0, [EXP_BAG_5]),
    tier(7, 700, 35, 0, []),
    tier(8, 600, 30, 0, []),
    tier(9, 500, 25, 0, []),
    tier(10, 400, 20, 0, []),
    tier(50, 200, 10, 0, []),
  ],
} satisfies Record<'arena' | 'squad', WeeklyReward[]>

/** An exchange offer (Squad Arena Exchange, Championship Shop): `amount` x item for `price`. */
export interface CoinOffer {
  id: string
  itemId: string
  amount: number
  price: number
}

/** Squad Arena 3v3. */
export const SQUAD_ARENA = {
  /** Spec: "Requires Level" 50. */
  minLevel: 50,
  /** Spec: three loadouts with different main stats (STR, AGI, STA); sets IV-V need VIP. */
  squadSize: 3,
  /** Spec: 3 rows of 6 player squads, real players only. */
  opponents: 18,
  /** Spec rewards box: 50 Team Coins per match, 10% chance of 50 Gift Certificates. */
  teamCoinsPerMatch: 50,
  giftCouponChance: 0.1,
  giftCoupons: 50,
  /** Spec: "3x Rank Multiplier"; ours: the solo arena's Elo score change times 3. */
  rankMultiplier: 3,
  /** Spec: the squad ladder starts at the arena's 93500 (rank table of the top bar). */
  initScore: 93500,
} as const

/** PLACEHOLDERS: Squad Arena numbers Reborn keeps on its server. */
export const SQUAD_ARENA_PLACEHOLDERS = {
  /** Free tickets every UTC day (Reborn resets them at `nextTicketReset`). */
  freeTicketsPerDay: 10,
  /** History lines kept per ninja. */
  historySize: 15,
  /**
   * "Your squad will fight in sequence": ours is three 1v1 fights, loadout #k against the
   * opponent's #k, at full HP; the side that wins two of them wins the match.
   */
  winsNeeded: 2,
  /** Squad Arena Exchange (Reborn: `openSquadArenaPot` jars, contents unknown). */
  shop: [
    { id: 'hp-potion', itemId: 'i160010', amount: 10, price: 150 }, // Healing Draught
    { id: 'mp-potion', itemId: 'i160020', amount: 10, price: 150 }, // Chakra Draught
    { id: 'exp-bag-5', itemId: 'i150172', amount: 1, price: 400 }, // Level 5 Exp Bag
    { id: 'card-pack', itemId: 'i171002', amount: 1, price: 800 }, // Blue Card Pack
    { id: 'exp-bag-10', itemId: 'i150177', amount: 1, price: 1_200 }, // Level 10 Exp Bag
    { id: 'lucky-gem', itemId: 'i150302', amount: 1, price: 2_000 }, // Lucky Gem
  ] satisfies CoinOffer[],
} as const

/** Championship (spec: level 30, a 16-slot bracket, Hero Coins per round won). */
export const CHAMPIONSHIP = {
  minLevel: 30,
  slots: 16,
  /** Hero Coins for winning a Quarterfinal, a Semifinal and the Final (spec). */
  heroCoins: { 2: 100, 3: 250, 4: 500 } as Record<number, number>,
} as const

/** PLACEHOLDERS: the Championship schedule and shop (Reborn's server times them). */
export const CHAMPIONSHIP_PLACEHOLDERS = {
  /**
   * One bracket per UTC day: registration from 00:00 for `registrationHours`, then one round
   * every `roundMinutes` (Round of 16, Quarterfinals, Semifinals, Final), then a cooldown to the
   * next day's 00:00.
   */
  registrationHours: 22,
  roundMinutes: 15,
  /** Championship Shop (Reborn: `openChampionshipPot` jars other than 1-3, contents unknown). */
  shop: [
    { id: 'exp-bag-10', itemId: 'i150177', amount: 1, price: 100 }, // Level 10 Exp Bag
    { id: 'lucky-gem', itemId: 'i150302', amount: 1, price: 250 }, // Lucky Gem
    { id: 'legend-pot', itemId: 'i160104', amount: 1, price: 500 }, // Legend Wishing Pot
    { id: 'outfit-box', itemId: 'i152044', amount: 1, price: 850 }, // Luxury Outfit Box
  ] satisfies CoinOffer[],
} as const
