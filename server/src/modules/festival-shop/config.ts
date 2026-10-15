// Festival Shop (Reborn's Xmas event: Santa's Helper -> "Christmas Shop", reborn-windows-A-L.md
// "Festival Shop"). The window, the confirm, "(purchased/limit)" and "Sold Out" are Reborn's; its
// catalogue, token prices and limits live on Reborn's server (`christmasShopItems`).

/** Spec: the Xmas event icon shows from level 10. */
export const FESTIVAL_SHOP_MIN_LEVEL = 10

export interface FestivalOffer {
  itemId: string
  /** Units per purchase (the card's "xN"). */
  amount: number
  /** Festival Tokens. */
  cost: number
  /** Purchases per character; Reborn shows "(purchased/limit)". */
  limit: number
}

/**
 * PLACEHOLDERS the user must confirm: Reborn's catalogue, prices, limits and binding are unknown.
 * Items are ones our game names, draws and lets you use (most come from the 2011 Christmas boxes,
 * fixed drops 8000143-8000144, or the Mall). Limits never reset (one event's worth), and
 * everything bought here is bound.
 */
export const FESTIVAL_SHOP_PLACEHOLDERS = {
  bound: true,
  offers: [
    { itemId: 'i160103', amount: 1, cost: 30, limit: 5 }, // Orange Outfit Wishing Pot
    { itemId: 'i152028', amount: 2, cost: 20, limit: 10 }, // Advanced Sage Panacea
    { itemId: 'i152025', amount: 1, cost: 40, limit: 3 }, // Pet Skill Book Box
    { itemId: 'i152098', amount: 1, cost: 25, limit: 10 }, // Gold Treasure Jar
    { itemId: 'i152101', amount: 1, cost: 15, limit: 10 }, // Special Gem Jar
    { itemId: 'i152043', amount: 1, cost: 15, limit: 10 }, // Mystic Jar
    { itemId: 'i170110', amount: 5, cost: 10, limit: 10 }, // Watermelon
    { itemId: 'i120001', amount: 10, cost: 5, limit: 20 }, // Sushi
    { itemId: 'i150270', amount: 1, cost: 100, limit: 1 }, // 3 Day VIP
  ] satisfies FestivalOffer[],
} as const
