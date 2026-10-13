// Weekly toll gate ranking (pvp-rankings.md 7, toll-gates.md 3.1). Weeks start Monday 00:00 UTC
// (decision 14) and are part of the row key, so nothing has to be reset: "last week" is simply
// the previous Monday's rows. Order: progress desc, then the earlier time, then character id.
import {
  TOLL_GATE_RANKING_SIZE,
  type TollGateRanking,
  type TollGateReward,
  type TollGateWeek,
} from '@pockie/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { characters, tollGateWeekly, tollGateWeeklyClaims } from '../../db/schema.js'
import { rankings, tollGateRankReward } from '../../game/data.js'
import { expUpdate, saveCharacterProgress, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { tollGateTables } from '../gates/data.js'

const DAY_MS = 24 * 3600 * 1000
const CAPITAL_STONE = 0

/** The UTC Monday (YYYY-MM-DD) of the week `at` falls in. */
export function weekStart(at: Date) {
  const daysSinceMonday = (at.getUTCDay() + 6) % 7
  return new Date(at.getTime() - daysSinceMonday * DAY_MS).toISOString().slice(0, 10)
}
const previousWeek = (at: Date) => weekStart(new Date(at.getTime() - 7 * DAY_MS))

/**
 * schedule% of the original (TollGateSystem 1436-1457): the last passed point (subSeq * 5 +
 * pointSeq, the run's passedPoint) out of all points of the gate, truncated. Integer maths, so
 * no float rounding drops a percent.
 */
export const tollGateProgress = (passedPoint: number, points: number) =>
  Math.trunc(((passedPoint + 1) * 100) / points)

export const isRankedGate = (gateId: number) => rankings().tollGates.gates.includes(gateId)

/**
 * Records a ninja's progress at a ranked toll gate (100001-100008) for the week of `at`, keeping
 * the best progress (ties keep the earlier time). Ignored for other gates, progress 0 and ninjas
 * outside the gate's level range (RequirMinLevel..RequirMaxLevel, TollGateSystem 1058-1090).
 * Called inside the run's transaction; the teams task calls it once per member.
 */
export async function recordTollGateProgress(
  tx: Tx,
  characterId: string,
  gateId: number,
  progressPercent: number,
  at: Date,
) {
  if (!isRankedGate(gateId) || progressPercent <= 0) return
  if (!Number.isInteger(progressPercent) || progressPercent > 100)
    throw new Error(`Toll gate progress out of range: ${progressPercent}`)
  const gate = tollGateTables().gates[String(gateId)]
  const [character] = await tx
    .select({ level: characters.level })
    .from(characters)
    .where(eq(characters.id, characterId))
  if (!gate || !character) return
  if (character.level < gate.RequirMinLevel || character.level > gate.RequirMaxLevel) return

  await tx
    .insert(tollGateWeekly)
    .values({ gateId, week: weekStart(at), characterId, schedule: progressPercent, reachedAt: at })
    .onConflictDoUpdate({
      target: [tollGateWeekly.gateId, tollGateWeekly.week, tollGateWeekly.characterId],
      set: { schedule: sql`excluded.schedule`, reachedAt: sql`excluded.reached_at` },
      setWhere: sql`excluded.schedule > ${tollGateWeekly.schedule} or (excluded.schedule = ${tollGateWeekly.schedule} and excluded.reached_at < ${tollGateWeekly.reachedAt})`,
    })
}

async function weekRows(db: Tx | Db, gateId: number, week: string) {
  const rows = await db
    .select({
      characterId: tollGateWeekly.characterId,
      name: characters.name,
      level: characters.level,
      nation: characters.nation,
      schedule: tollGateWeekly.schedule,
      reachedAt: tollGateWeekly.reachedAt,
    })
    .from(tollGateWeekly)
    .innerJoin(characters, eq(characters.id, tollGateWeekly.characterId))
    .where(and(eq(tollGateWeekly.gateId, gateId), eq(tollGateWeekly.week, week)))
    .orderBy(
      desc(tollGateWeekly.schedule),
      asc(tollGateWeekly.reachedAt),
      asc(tollGateWeekly.characterId),
    )
    .limit(TOLL_GATE_RANKING_SIZE)
  return rows.map((row, index) => ({ ...row, place: index + 1 }))
}

async function week(db: Tx | Db, gateId: number, week: string, characterId: string) {
  const rows = await weekRows(db, gateId, week)
  const view: TollGateWeek = {
    week,
    rows: rows.map(({ characterId: _, reachedAt, ...row }) => ({
      ...row,
      reachedAt: reachedAt.toISOString(),
    })),
    myPlace: rows.find((row) => row.characterId === characterId)?.place ?? null,
  }
  return view
}

/** RankExpReward / RankMoneyReward for a place; RankItemReward is all 0 in the data. */
function placeReward(gateId: number, place: number): TollGateReward | null {
  const reward = tollGateRankReward(gateId, place)
  if (!reward) return null
  if (reward.capitalType !== CAPITAL_STONE)
    throw new Error(`Unsupported toll gate reward currency ${reward.capitalType}`)
  if (reward.item !== undefined && String(reward.item) !== '0')
    throw new Error(`Unsupported toll gate item reward ${reward.item}`)
  return { place, exp: reward.exp, stone: reward.money }
}

export function requireRankedGate(gateId: number) {
  if (!isRankedGate(gateId))
    throw new HttpError(404, 'unknown_gate', 'This toll gate has no weekly ranking.')
}

export async function tollGateRanking(
  db: Tx | Db,
  gateId: number,
  characterId: string,
  now = new Date(),
): Promise<TollGateRanking> {
  const last = await week(db, gateId, previousWeek(now), characterId)
  const reward = last.myPlace ? placeReward(gateId, last.myPlace) : null
  const claimed = reward
    ? (
        await db
          .select({ place: tollGateWeeklyClaims.place })
          .from(tollGateWeeklyClaims)
          .where(
            and(
              eq(tollGateWeeklyClaims.characterId, characterId),
              eq(tollGateWeeklyClaims.gateId, gateId),
              eq(tollGateWeeklyClaims.week, last.week),
            ),
          )
      ).length > 0
    : false
  return {
    gateId,
    thisWeek: await week(db, gateId, weekStart(now), characterId),
    lastWeek: { ...last, reward: reward && { ...reward, claimed } },
  }
}

/**
 * OnCommandRewardRank: last week's place reward, once per ninja and gate. The caller holds the
 * character row lock (lockCharacter), which serializes claims; the claim row's primary key
 * makes a repeat a no-op even without it.
 */
export async function claimTollGateReward(
  tx: Tx,
  character: typeof characters.$inferSelect,
  gateId: number,
  now = new Date(),
) {
  const week = previousWeek(now)
  const place = (await weekRows(tx, gateId, week)).find(
    (row) => row.characterId === character.id,
  )?.place
  const reward = place ? placeReward(gateId, place) : null
  if (!reward)
    throw new HttpError(
      400,
      'not_ranked',
      'You were not in the top 50 of this toll gate last week.',
    )
  const [claim] = await tx
    .insert(tollGateWeeklyClaims)
    .values({ characterId: character.id, gateId, week, place: reward.place })
    .onConflictDoNothing()
    .returning()
  if (!claim) throw new HttpError(400, 'already_claimed', 'You have already claimed this reward.')
  const { levelsGained, ...update } = expUpdate(character, reward.exp)
  await saveCharacterProgress(tx, character.id, {
    ...update,
    stone: character.stone + reward.stone,
  })
  return { ...reward, levelsGained }
}
