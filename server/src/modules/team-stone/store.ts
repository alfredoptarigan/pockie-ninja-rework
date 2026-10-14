// Team Stone state (M5 decision 28): lazy daily attempts, the weekly league pay and the monthly
// score reset. Both periodic jobs and every route settle a player the same way, so a late job or
// a fight in a new week never loses a payout. Locks: the character row first, then the player row.
import { leagueIndex } from '../../../../game-core/src/events/team-stone.js'
import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { characters, teamStonePlayers } from '../../db/schema.js'
import { rebornEvents } from '../../game/data.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { sendSystemMail } from '../../game/system-mail.js'
import { weekStart } from '../rankings/toll-gate-weekly.js'

export type PlayerRow = typeof teamStonePlayers.$inferSelect

export const config = () => rebornEvents().teamStone
export const utcDay = (now: Date) => now.toISOString().slice(0, 10)
export const monthStart = (now: Date) => `${now.toISOString().slice(0, 7)}-01`
export { weekStart }

export const attemptsUsed = (row: Pick<PlayerRow, 'attemptsDay' | 'attemptsUsed'>, now: Date) =>
  row.attemptsDay === utcDay(now) ? row.attemptsUsed : 0

/** Score as of `now`: 0 once the month it belongs to is over (the full monthly reset). */
export const currentScore = (row: Pick<PlayerRow, 'month' | 'score'>, now: Date) =>
  row.month === monthStart(now) ? row.score : 0

export const leagueOf = (score: number) => {
  const leagues = config().leagues
  return leagues[
    leagueIndex(
      leagues.map((l) => l.minScore),
      score,
    )
  ]!
}

/** Locks (creating it first) the player row; the caller holds the character lock. */
export async function lockPlayer(tx: Tx, characterId: string) {
  await tx.insert(teamStonePlayers).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(teamStonePlayers)
    .where(eq(teamStonePlayers.characterId, characterId))
    .for('update')
  return row!
}

/** Pays a finished week's league once (only if the ninja fought in it). */
async function payWeek(tx: Tx, row: PlayerRow) {
  const league = leagueOf(row.score)
  await tx
    .update(characters)
    .set({ battleCoins: sql`${characters.battleCoins} + ${league.battleCoins}` })
    .where(eq(characters.id, row.characterId))
  // ponytail: a full bag loses the top-league item; add a claim box if players miss it.
  if (league.item)
    await grantItems(
      tx,
      row.characterId,
      Array.from({ length: league.amount ?? 1 }, () => ({ itemId: league.item!, bound: true })),
      { dropOverflow: true },
    )
  await sendSystemMail(tx, row.characterId, 'other', 'team_stone_weekly', {
    league: league.id,
    battleCoins: league.battleCoins,
    ...(league.item && { itemId: league.item, count: league.amount ?? 1 }),
  })
}

/**
 * Brings a locked player row to `now`: pays the last played week (with the score it ended on),
 * then clears the week flag and resets the score in a new month. Returns the saved row.
 */
export async function settle(tx: Tx, row: PlayerRow, now: Date): Promise<PlayerRow> {
  const week = weekStart(now)
  const month = monthStart(now)
  if (row.week === week && row.month === month) return row
  if (row.week !== null && row.week < week && row.playedThisWeek) await payWeek(tx, row)
  const next = {
    ...(row.week !== week && { week, playedThisWeek: false }),
    ...(row.month !== month && { month, score: 0 }),
  }
  const [saved] = await tx
    .update(teamStonePlayers)
    .set(next)
    .where(eq(teamStonePlayers.characterId, row.characterId))
    .returning()
  return saved!
}

/** Locks the character, then the player row, and settles it (one transaction per ninja). */
async function settleOne(db: Db, characterId: string, now: Date) {
  await db.transaction(async (tx) => {
    const [character] = await tx
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.id, characterId))
      .for('update')
    if (character) await settle(tx, await lockPlayer(tx, characterId), now)
  })
}

async function settleAll(db: Db, ids: { characterId: string }[], now: Date) {
  for (const { characterId } of ids) await settleOne(db, characterId, now)
  return ids.length
}

/** Weekly job: pays every ninja who fought in a finished week. Idempotent. */
export async function payTeamStoneWeek(db: Db, now = new Date()) {
  const due = await db
    .select({ characterId: teamStonePlayers.characterId })
    .from(teamStonePlayers)
    .where(
      and(eq(teamStonePlayers.playedThisWeek, true), lt(teamStonePlayers.week, weekStart(now))),
    )
  return settleAll(db, due, now)
}

/** Monthly job: resets the score of every ninja from a past month (paying their week first). */
export async function resetTeamStoneMonth(db: Db, now = new Date()) {
  const due = await db
    .select({ characterId: teamStonePlayers.characterId })
    .from(teamStonePlayers)
    .where(lt(teamStonePlayers.month, monthStart(now)))
  return settleAll(db, due, now)
}

/** "Run it every few minutes": both jobs are cheap no-ops when nothing is due. */
export const TEAM_STONE_SETTLE_INTERVAL_MS = 5 * 60_000

export const playerRows = (tx: Tx | Db, ids: string[]) =>
  tx.select().from(teamStonePlayers).where(inArray(teamStonePlayers.characterId, ids))
