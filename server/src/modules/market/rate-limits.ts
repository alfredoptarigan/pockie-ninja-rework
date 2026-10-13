// Market request limits (@fastify/rate-limit, per route and IP). The coordinator may move these
// into modules/game/rate-limits.ts.
const perMinute = (max: number) => ({ max, timeWindow: '1 minute' })

export const MARKET_RATE_LIMITS = {
  read: perMinute(120),
  list: perMinute(20),
  cancel: perMinute(30),
  buy: perMinute(30),
  claim: perMinute(30),
}
