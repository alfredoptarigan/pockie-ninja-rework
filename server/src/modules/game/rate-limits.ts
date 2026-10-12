// Per-route request limits for the game API (@fastify/rate-limit, counted per route and IP).
const perMinute = (max: number) => ({ max, timeWindow: '1 minute' })

export const RATE_LIMITS = {
  read: perMinute(120),
  createCharacter: perMinute(10),
  fight: perMinute(60),
  // The 300 s cooldown already limits real searches; this only stops hammering.
  explore: perMinute(20),
  talk: perMinute(60),
  acceptQuest: perMinute(30),
  item: perMinute(60),
  travel: perMinute(30),
  revive: perMinute(10),
  buyPouches: perMinute(20),
}
