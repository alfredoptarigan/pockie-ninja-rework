// Periodic jobs: Market expiry, mail purge, the team grace sweep, the Tailed Beast week and Team
// Stone matchmaking, weekly pay and monthly reset. Each one is idempotent
// and keyed by time, so an overlapping or late run is harmless.
// ponytail: timers in the one server process; move to a job queue with several instances.
import type { Db } from './db/client.js'
import { expireListings, MARKET_EXPIRY_INTERVAL_MS } from './modules/market/market.js'
import { MAIL_PURGE_INTERVAL_MS, purgeExpiredMail } from './modules/social/routes.js'
import {
  TAILED_BEAST_RESET_INTERVAL_MS,
  tailedBeastWeeklyReset,
} from './modules/tailed-beast/routes.js'
import {
  matchTeamStone,
  payTeamStoneWeek,
  resetTeamStoneMonth,
  TEAM_STONE_MATCH_INTERVAL_MS,
  TEAM_STONE_SETTLE_INTERVAL_MS,
} from './modules/team-stone/routes.js'
import { sweepTeams } from './modules/teams/index.js'

/** "Run it every few seconds" (teams/routes.ts). */
const TEAM_SWEEP_INTERVAL_MS = 5_000

/** Starts the timers; returns the function that stops them. */
export function startJobs(db: Db, onError: (error: unknown) => void) {
  const every = (ms: number, job: () => Promise<unknown>) =>
    setInterval(() => void job().catch(onError), ms)
  const timers = [
    every(MARKET_EXPIRY_INTERVAL_MS, () => expireListings(db)),
    every(MAIL_PURGE_INTERVAL_MS, () => purgeExpiredMail(db)),
    every(TEAM_SWEEP_INTERVAL_MS, () => sweepTeams(db)),
    every(TAILED_BEAST_RESET_INTERVAL_MS, () => tailedBeastWeeklyReset(db)),
    every(TEAM_STONE_MATCH_INTERVAL_MS, () => matchTeamStone(db)),
    every(TEAM_STONE_SETTLE_INTERVAL_MS, () => payTeamStoneWeek(db)),
    every(TEAM_STONE_SETTLE_INTERVAL_MS, () => resetTeamStoneMonth(db)),
  ]
  return () => timers.forEach(clearInterval)
}
