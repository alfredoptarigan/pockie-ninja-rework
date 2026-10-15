// Periodic jobs: Market expiry, mail purge, the team grace sweep, the Tailed Beast week and Team
// Stone matchmaking, weekly pay and monthly reset, the Arena Weekly Rewards hours and the
// Championship rounds, the Clan Wars weekly Top 3 and escaped Clan Mission bosses. Each one is
// idempotent
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
import {
  CHAMPIONSHIP_SETTLE_INTERVAL_MS,
  settleChampionships,
} from './modules/arena/championship.js'
import { accrueWeekly, WEEKLY_ACCRUE_INTERVAL_MS } from './modules/arena/weekly.js'
import {
  CLAN_MISSIONS_SETTLE_INTERVAL_MS,
  settleMissions,
} from './modules/clan-missions/missions.js'
import { CLAN_WAR_SETTLE_INTERVAL_MS, settleClanWarWeek } from './modules/clan-wars/wars.js'

/** "Run it every few seconds" (teams/routes.ts). */
const TEAM_SWEEP_INTERVAL_MS = 5_000

/**
 * Starts the timers; returns the function that stops them and resolves once the runs already
 * started have finished, so the database is not closed (or truncated in tests) under them.
 */
export function startJobs(db: Db, onError: (error: unknown) => void) {
  const running = new Set<Promise<void>>()
  const every = (ms: number, job: () => Promise<unknown>) =>
    setInterval(() => {
      const run = job()
        .then(() => undefined)
        .catch(onError)
        .finally(() => running.delete(run))
      running.add(run)
    }, ms)
  const timers = [
    every(MARKET_EXPIRY_INTERVAL_MS, () => expireListings(db)),
    every(MAIL_PURGE_INTERVAL_MS, () => purgeExpiredMail(db)),
    every(TEAM_SWEEP_INTERVAL_MS, () => sweepTeams(db)),
    every(TAILED_BEAST_RESET_INTERVAL_MS, () => tailedBeastWeeklyReset(db)),
    every(TEAM_STONE_MATCH_INTERVAL_MS, () => matchTeamStone(db)),
    every(TEAM_STONE_SETTLE_INTERVAL_MS, () => payTeamStoneWeek(db)),
    every(TEAM_STONE_SETTLE_INTERVAL_MS, () => resetTeamStoneMonth(db)),
    every(WEEKLY_ACCRUE_INTERVAL_MS, () => accrueWeekly(db)),
    every(CHAMPIONSHIP_SETTLE_INTERVAL_MS, () => settleChampionships(db)),
    every(CLAN_WAR_SETTLE_INTERVAL_MS, () => settleClanWarWeek(db)),
    every(CLAN_MISSIONS_SETTLE_INTERVAL_MS, () => settleMissions(db)),
  ]
  return async () => {
    timers.forEach(clearInterval)
    await Promise.allSettled(running)
  }
}
