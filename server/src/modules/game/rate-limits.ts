// Per-route request limits for the game API (@fastify/rate-limit, counted per route and IP).
const perMinute = (max: number) => ({ max, timeWindow: '1 minute' })

export const RATE_LIMITS = {
  shopOpen: perMinute(120),
  shopWholesale: perMinute(30),
  shopRefresh: perMinute(30),
  shopBuy: perMinute(30),
  shopBuyAll: perMinute(20),
  shopSell: perMinute(30),
  shopSellAll: perMinute(20),
  shopPouch: perMinute(20),
  shopMerchant: perMinute(120),
  shopMerchantBuy: perMinute(30),
  read: perMinute(120),
  createCharacter: perMinute(10),
  fight: perMinute(60),
  // The 300 s cooldown already limits real searches; this only stops hammering.
  explore: perMinute(20),
  explorePeek: perMinute(30),
  talk: perMinute(60),
  acceptQuest: perMinute(30),
  item: perMinute(60),
  travel: perMinute(30),
  revive: perMinute(10),
  buyPouches: perMinute(20),
}
