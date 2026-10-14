import { and, eq } from 'drizzle-orm'
import { characters, characterWeeklyRewards } from '../../db/schema.js'
import { rebornEvents } from '../../game/data.js'
import type { Tx } from '../../game/progress.js'

export type WeeklyActivity =
  | 'arenaDuel'
  | 'duelFriend'
  | 'tollGate'
  | 'pubFight'
  | 'lasNoches'
  | 'twentyMinReward'
  | 'globalChat'
  | 'mission'
export const utcDay = (now: Date) => now.toISOString().slice(0, 10)
export function utcWeek(now: Date) {
  const monday = new Date(`${utcDay(now)}T00:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return utcDay(monday)
}
export const weeklyWhere = (characterId: string, week: string) =>
  and(eq(characterWeeklyRewards.characterId, characterId), eq(characterWeeklyRewards.week, week))
export async function weeklyState(tx: Tx, characterId: string, now: Date) {
  const week = utcWeek(now)
  await tx.insert(characterWeeklyRewards).values({ characterId, week }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(characterWeeklyRewards)
    .where(weeklyWhere(characterId, week))
    .for('update')
  return row!
}
/** Captured weekly points are proportional to progress, capped at 245 total. */
export const weeklyPoints = (counters: Record<string, number>) =>
  rebornEvents().weekly.activities.reduce(
    (total, activity) =>
      total +
      Math.floor(
        (activity.points * Math.min(activity.max, Math.max(0, counters[activity.id] ?? 0))) /
          activity.max,
      ),
    0,
  )
/** Call inside the action's transaction. Character is always locked before feature state. */
export async function recordWeeklyActivity(
  tx: Tx,
  characterId: string,
  activity: WeeklyActivity,
  now = new Date(),
) {
  const [character] = await tx
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.id, characterId))
    .for('update')
  if (!character) throw new Error('Character does not exist.')
  const rule = rebornEvents().weekly.activities.find((rule) => rule.id === activity)
  if (!rule) throw new Error('Unknown weekly activity.')
  const row = await weeklyState(tx, characterId, now)
  await tx
    .update(characterWeeklyRewards)
    .set({
      counters: {
        ...row.counters,
        [activity]: Math.min(rule.max, (row.counters[activity] ?? 0) + 1),
      },
    })
    .where(weeklyWhere(characterId, row.week))
}
