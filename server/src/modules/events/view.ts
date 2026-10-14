import { eq } from 'drizzle-orm'
import type { EventsView } from '../../../../shared/src/schemas/events.js'
import type { QuestRewards } from '@pockie/shared'
import { characterDailyLogin, characters } from '../../db/schema.js'
import { itemNameKey, rebornEvents } from '../../game/data.js'
import { playerFighter } from '../../game/combat.js'
import type { Tx } from '../../game/progress.js'
import { toCharacter } from '../game/characters.js'
import { ACTIVITY_LABELS, DICE_BUY_LIMIT } from './constants.js'
import { diceBuffs } from './dice-buffs.js'
import { utcDay, weeklyPoints, weeklyState } from './weekly-activity.js'

export type CharacterRow = typeof characters.$inferSelect
export const nextDay = (now: Date) =>
  new Date(Date.parse(`${utcDay(now)}T00:00:00Z`) + 86400000).toISOString()
export function rewardView(reward: {
  item?: string
  amount?: number
  gold?: number
}): QuestRewards {
  return {
    exp: 0,
    stone: 0,
    gold: reward.gold ?? 0,
    giftCoupon: 0,
    honor: 0,
    items: reward.item
      ? [{ itemId: reward.item, count: reward.amount!, nameKey: itemNameKey(reward.item) }]
      : [],
  }
}
export async function loginState(tx: Tx, characterId: string) {
  await tx.insert(characterDailyLogin).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(characterDailyLogin)
    .where(eq(characterDailyLogin.characterId, characterId))
    .for('update')
  return row!
}
export async function resetDaily(tx: Tx, character: CharacterRow, now: Date) {
  const day = utcDay(now)
  if (character.diceDay !== day) {
    character.diceDay = day
    character.diceUsed = 0
    character.diceBought = 0
  }
  if (character.twentyMinDay !== day) {
    character.twentyMinDay = day
    character.twentyMinCount = 0
  }
  await tx
    .update(characters)
    .set({
      diceDay: day,
      diceUsed: character.diceUsed,
      diceBought: character.diceBought,
      twentyMinDay: day,
      twentyMinCount: character.twentyMinCount,
    })
    .where(eq(characters.id, character.id))
}
export async function eventsView(tx: Tx, character: CharacterRow, now: Date): Promise<EventsView> {
  const config = rebornEvents()
  const login = await loginState(tx, character.id)
  const weekly = await weeklyState(tx, character.id, now)
  const buffs = await diceBuffs(tx, character.id, now)
  const day = utcDay(now)
  const cycle = login.completedDays % 7
  const claimedToday = login.claimDay === day
  const progress = claimedToday && cycle === 0 ? 7 : cycle
  return {
    character: toCharacter(character, await playerFighter(tx, character)),
    resetAt: nextDay(now),
    login: {
      completedDays: login.completedDays,
      nextDay: cycle + 1,
      canClaim: !claimedToday,
      canClaimBonus: login.bonusDay !== day,
      rewards: config.dailyLogin.cycle.map((reward, index) => ({
        day: index + 1,
        reward: rewardView(reward),
        claimed: index < progress,
      })),
      bonus: rewardView(config.dailyLogin.bonus),
    },
    weekly: {
      week: weekly.week,
      points: weeklyPoints(weekly.counters),
      counters: weekly.counters,
      activities: config.weekly.activities.map((activity) => ({
        ...activity,
        label: ACTIVITY_LABELS[activity.id]!,
        count: weekly.counters[activity.id] ?? 0,
      })),
      milestones: config.weekly.milestones.map((reward) => ({
        points: reward.points,
        reward: rewardView(reward),
        claimed: weekly.claimedMilestones.includes(reward.points),
      })),
      weekdays: config.weekly.weekdayRewards
        .map((reward) => ({
          day: reward.dayIndex || 7,
          reward: rewardView(reward),
          claimed: weekly.claimedWeekdays.includes(reward.dayIndex || 7),
        }))
        .sort((a, b) => a.day - b.day),
      weekday: now.getUTCDay() || 7,
      canClaimBonus: weekly.claimedWeekdays.length === 7 && !weekly.bonusClaimed,
      bonus: rewardView(config.weekly.bonus),
    },
    dice: {
      rollsLeft: Math.max(0, config.dice.rollsPerDay - character.diceUsed),
      bought: character.diceBought,
      buyLimit: DICE_BUY_LIMIT,
      replenishCost: config.dice.replenishCost,
      clearCost: config.dice.clearCurseCost,
      curse: buffs.some((buff) => buff.buffId >= 80201),
      buffs: buffs.map((buff) => ({
        buffId: buff.buffId,
        expiresAt: buff.expiresAt?.toISOString() ?? null,
      })),
    },
    twentyMinute: {
      nextClaimAt: character.twentyMinAt
        ? new Date(
            character.twentyMinAt.getTime() + config.twentyMinute.cooldownSeconds * 1000,
          ).toISOString()
        : now.toISOString(),
      claimsToday: character.twentyMinCount,
      dailyCap: config.twentyMinute.claimsPerDay,
      coupons: config.twentyMinute.giftCoupons,
    },
  }
}
