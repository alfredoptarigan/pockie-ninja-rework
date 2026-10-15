// Arena and Squad Arena Weekly Rewards (Reborn `loadArenaWeeklyRewards` /
// `claimArenaWeeklyReward` and the Team Arena pair): every hour the ladder's top 50 earn points
// (rank 1-9: 10 down to 2, rank 10-50: 1); the week's points rank the ninjas, and last week's top 50
// claim a reward for 5 days after the Monday reset. Weeks start Monday 00:00 UTC (decision 14;
// Reborn: UK time). The hour is inserted before it is paid, so the job and the lazy settle of
// GET /weekly pay each hour once.
import { and, asc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  ladderSchema,
  type Ladder,
  type WeeklyClaimResult,
  type WeeklyRewardView,
  type WeeklyStanding,
  type WeeklyView,
} from '../../../../shared/src/schemas/arena-extras.js'
import type { Db } from '../../db/client.js'
import {
  arenaWeeklyClaims,
  arenaWeeklyHours,
  arenaWeeklyPoints,
  characters,
} from '../../db/schema.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { utcWeek } from '../events/weekly-activity.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  requireBagRoom,
  saveCharacter,
  withCharacter,
} from '../gates/common.js'
import { WEEKLY_REWARD_PLACEHOLDERS, WEEKLY_RULES } from './config.js'
import { lockExtras, saveExtras } from './extras.js'
import { squadLadder } from './squad-store.js'
import { playersAt } from './store.js'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const LEADERBOARD_SIZE = 10
const LADDERS: Ladder[] = ['arena', 'squad']
/** The job looks every 5 minutes; a missed hour stays unpaid (the rank then is unknown). */
export const WEEKLY_ACCRUE_INTERVAL_MS = 5 * 60_000

/** Points an hour at a 1-based ladder rank. */
export const hourlyPoints = (rank: number) =>
  rank < 1 || rank > WEEKLY_RULES.rankedPlaces ? 0 : (WEEKLY_RULES.hourlyPoints[rank - 1] ?? 1)

/** The reward of a 1-based weekly rank: places 1-10, then the place-50 row for 11-50. */
export function rewardFor(kind: Ladder, rank: number): WeeklyRewardView | undefined {
  if (rank < 1 || rank > WEEKLY_RULES.rankedPlaces) return undefined
  const place = rank <= 10 ? rank : WEEKLY_RULES.rankedPlaces
  return WEEKLY_REWARD_PLACEHOLDERS[kind].find((reward) => reward.place === place)
}

const mondayOf = (week: string) => new Date(`${week}T00:00:00Z`)
const previousWeek = (now: Date) => utcWeek(new Date(now.getTime() - 7 * DAY_MS))

/** The ladder's top 50 character ids, rank 1 first. */
async function ladderTop(tx: Tx, kind: Ladder) {
  const size = WEEKLY_RULES.rankedPlaces
  if (kind === 'squad') return (await squadLadder(tx, size)).map((row) => row.characterId)
  const byPlace = await playersAt(
    tx,
    Array.from({ length: size }, (_, place) => place),
  )
  return [...byPlace.entries()].sort(([a], [b]) => a - b).map(([, id]) => id)
}

/** Pays the current hour on both ladders, once each (its own transaction per ladder). */
export async function accrueWeekly(db: Db, now = new Date()) {
  const hour = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS)
  const week = utcWeek(hour)
  for (const kind of LADDERS)
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .insert(arenaWeeklyHours)
        .values({ kind, hour })
        .onConflictDoNothing()
        .returning()
      if (!fresh) return
      const rows = (await ladderTop(tx, kind)).map((characterId, index) => ({
        kind,
        week,
        characterId,
        points: hourlyPoints(index + 1),
      }))
      if (!rows.length) return
      await tx
        .insert(arenaWeeklyPoints)
        .values(rows)
        .onConflictDoUpdate({
          target: [arenaWeeklyPoints.kind, arenaWeeklyPoints.week, arenaWeeklyPoints.characterId],
          set: { points: sql`${arenaWeeklyPoints.points} + excluded.points` },
        })
    })
}

/** The week's standings: points desc, then character id (one fixed order). */
const standings = (tx: Tx | Db, kind: Ladder, week: string) =>
  tx
    .select({
      characterId: arenaWeeklyPoints.characterId,
      name: characters.name,
      points: arenaWeeklyPoints.points,
      rank: sql<number>`(row_number() over (order by ${arenaWeeklyPoints.points} desc, ${arenaWeeklyPoints.characterId}))::int`.as(
        'rank',
      ),
    })
    .from(arenaWeeklyPoints)
    .innerJoin(characters, eq(characters.id, arenaWeeklyPoints.characterId))
    .where(and(eq(arenaWeeklyPoints.kind, kind), eq(arenaWeeklyPoints.week, week)))
    .as('standings')

async function leaderboard(tx: Tx | Db, kind: Ladder, week: string): Promise<WeeklyStanding[]> {
  const list = standings(tx, kind, week)
  return tx.select().from(list).orderBy(asc(list.rank)).limit(LEADERBOARD_SIZE)
}

async function standingOf(tx: Tx | Db, kind: Ladder, week: string, characterId: string) {
  const list = standings(tx, kind, week)
  const [row] = await tx.select().from(list).where(eq(list.characterId, characterId))
  return row
}

async function claimed(tx: Tx | Db, kind: Ladder, week: string, characterId: string) {
  const [row] = await tx
    .select({ week: arenaWeeklyClaims.week })
    .from(arenaWeeklyClaims)
    .where(
      and(
        eq(arenaWeeklyClaims.kind, kind),
        eq(arenaWeeklyClaims.week, week),
        eq(arenaWeeklyClaims.characterId, characterId),
      ),
    )
  return Boolean(row)
}

export async function weeklyView(
  tx: Tx | Db,
  kind: Ladder,
  characterId: string,
  now = new Date(),
): Promise<WeeklyView> {
  const currentWeek = utcWeek(now)
  const lastWeek = previousWeek(now)
  const isMonday = now.getUTCDay() === 1
  const week = isMonday ? lastWeek : currentWeek
  const mine = await standingOf(tx, kind, week, characterId)
  const last = isMonday ? mine : await standingOf(tx, kind, lastWeek, characterId)
  const lastRank = last?.rank ?? null
  const closesAt = new Date(mondayOf(currentWeek).getTime() + WEEKLY_RULES.claimDays * DAY_MS)
  const isClaimed = await claimed(tx, kind, lastWeek, characterId)
  return {
    kind,
    isMonday,
    week,
    currentWeek,
    userRank: mine?.rank ?? null,
    userPoints: mine?.points ?? 0,
    leaderboard: await leaderboard(tx, kind, week),
    rewards: WEEKLY_REWARD_PLACEHOLDERS[kind],
    resetAt: new Date(mondayOf(currentWeek).getTime() + 7 * DAY_MS).toISOString(),
    claim: { week: lastWeek, rank: lastRank, claimed: isClaimed, closesAt: closesAt.toISOString() },
    canClaim:
      !isClaimed && now < closesAt && lastRank !== null && rewardFor(kind, lastRank) !== undefined,
  }
}

export async function weeklyRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/weekly', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const { kind } = ladderSchema.parse(request.query)
    await accrueWeekly(db)
    return withCharacter(db, request, (tx, character) => weeklyView(tx, kind, character.id))
  })

  app.post('/weekly/claim', { config: { rateLimit: RATE_LIMITS.daily } }, async (request) => {
    const { kind } = ladderSchema.parse(request.body)
    return withCharacter(db, request, async (tx, character): Promise<WeeklyClaimResult> => {
      const now = new Date()
      const view = await weeklyView(tx, kind, character.id, now)
      if (view.claim.claimed) throw bad('already_claimed', 'You already claimed this reward.')
      const reward = view.claim.rank === null ? undefined : rewardFor(kind, view.claim.rank)
      if (!reward) throw bad('no_reward', "Only last week's top 50 earn a reward.")
      if (!view.canClaim) throw bad('claim_closed', 'The claim period for last week is over.')
      const items = reward.items.map((itemId) => ({ itemId, bound: true }))
      await requireBagRoom(tx, character.id, items)
      // The claim row is the once-only guard (primary key), inserted before anything is paid.
      const [fresh] = await tx
        .insert(arenaWeeklyClaims)
        .values({ kind, week: view.claim.week, characterId: character.id })
        .onConflictDoNothing()
        .returning()
      if (!fresh) throw bad('already_claimed', 'You already claimed this reward.')
      await saveCharacter(tx, character.id, {
        giftCoupon: character.giftCoupon + reward.giftCoupons,
        gold: character.gold + reward.gold,
        ...(kind === 'arena' && { honor: character.honor + reward.medals }),
      })
      if (kind === 'squad') {
        const extras = await lockExtras(tx, character.id)
        await saveExtras(tx, character.id, { teamCoins: extras.teamCoins + reward.medals })
      }
      await grantItems(tx, character.id, items)
      return {
        weekly: await weeklyView(tx, kind, character.id, now),
        reward,
        character: await characterView(tx, character.id),
      }
    })
  })
}
