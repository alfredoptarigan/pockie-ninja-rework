// Periodic M4 jobs: Market expiry, mail purge and the team grace sweep. Each one is idempotent
// and keyed by time, so an overlapping or late run is harmless.
// ponytail: timers in the one server process; move to a job queue with several instances.
import type { Db } from './db/client.js'
import { expireListings, MARKET_EXPIRY_INTERVAL_MS } from './modules/market/market.js'
import { MAIL_PURGE_INTERVAL_MS, purgeExpiredMail } from './modules/social/routes.js'
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
  ]
  return () => timers.forEach(clearInterval)
}
