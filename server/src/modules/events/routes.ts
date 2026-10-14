import { randomInt } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { rollDice } from '../../../../game-core/src/events/dice.js'
import {
  milestoneParamsSchema,
  weekdayParamsSchema,
} from '../../../../shared/src/schemas/events.js'
import type { Db } from '../../db/client.js'
import { characterDailyLogin, characterWeeklyRewards, characters } from '../../db/schema.js'
import { requireBagRoom } from '../../game/bag.js'
import { rebornEvents } from '../../game/data.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { lockCharacter, requireUser } from '../game/characters.js'
import { refreshBuffState } from '../game/nonfight-buffs.js'
import { DICE_BUY_LIMIT } from './constants.js'
import { applyDiceBuff, diceBuffs, removeDiceCurse } from './dice-buffs.js'
import { eventsView, loginState, resetDaily, type CharacterRow } from './view.js'
import {
  recordWeeklyActivity,
  utcDay,
  weeklyPoints,
  weeklyState,
  weeklyWhere,
} from './weekly-activity.js'

const bad = (code: string, message: string) => new HttpError(400, code, message)
type Reward = { item?: string; amount?: number; gold?: number }
async function grantReward(tx: Tx, character: CharacterRow, reward: Reward) {
  const items = reward.item
    ? Array.from({ length: reward.amount! }, () => ({ itemId: reward.item!, bound: true }))
    : []
  await requireBagRoom(tx, character.id, items)
  await grantItems(tx, character.id, items)
  if (reward.gold) {
    character.gold += reward.gold
    await tx.update(characters).set({ gold: character.gold }).where(eq(characters.id, character.id))
  }
}
export async function eventsRoutes(
  app: FastifyInstance,
  {
    db,
    now = () => new Date(),
    random = () => randomInt(6) / 6,
  }: { db: Db; now?: () => Date; random?: () => number },
) {
  const config = rebornEvents()
  // All reads and actions share the same lock order and lazy UTC reset.
  app.get('/', async (request) =>
    db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      const time = now()
      await resetDaily(tx, character, time)
      return eventsView(tx, character, time)
    }),
  )
  for (const bonus of [false, true])
    app.post(bonus ? '/login/bonus' : '/login/claim', async (request) =>
      db.transaction(async (tx) => {
        const character = await lockCharacter(tx, requireUser(request).id)
        const time = now()
        await resetDaily(tx, character, time)
        const row = await loginState(tx, character.id)
        const day = utcDay(time)
        if ((bonus ? row.bonusDay : row.claimDay) === day)
          throw bad('already_claimed', 'You already claimed this reward today.')
        await grantReward(
          tx,
          character,
          bonus ? config.dailyLogin.bonus : config.dailyLogin.cycle[row.completedDays % 7]!,
        )
        await tx
          .update(characterDailyLogin)
          .set(bonus ? { bonusDay: day } : { claimDay: day, completedDays: row.completedDays + 1 })
          .where(eq(characterDailyLogin.characterId, character.id))
        return eventsView(tx, character, time)
      }),
    )
  for (const kind of ['milestone', 'weekday', 'bonus'] as const)
    app.post(
      kind === 'bonus'
        ? '/weekly/bonus'
        : `/weekly/${kind}/:${kind === 'milestone' ? 'points' : 'day'}`,
      async (request) => {
        const value =
          kind === 'milestone'
            ? milestoneParamsSchema.parse(request.params).points
            : kind === 'weekday'
              ? weekdayParamsSchema.parse(request.params).day
              : 0
        return db.transaction(async (tx) => {
          const character = await lockCharacter(tx, requireUser(request).id)
          const time = now()
          await resetDaily(tx, character, time)
          const row = await weeklyState(tx, character.id, time)
          const points = weeklyPoints(row.counters)
          let reward: Reward
          if (kind === 'milestone') {
            if (row.claimedMilestones.includes(value))
              throw bad('already_claimed', 'You already claimed this milestone.')
            if (points < value) throw bad('not_ready', 'Earn more weekly points first.')
            reward = config.weekly.milestones.find((reward) => reward.points === value)!
          } else if (kind === 'weekday') {
            if (row.claimedWeekdays.includes(value))
              throw bad('already_claimed', 'You already claimed this weekday reward.')
            if (points < config.weekly.weekdayThreshold || value !== (time.getUTCDay() || 7))
              throw bad('not_ready', 'Earn 50 points and claim on the matching weekday.')
            reward = config.weekly.weekdayRewards.find(
              (reward) => (reward.dayIndex || 7) === value,
            )!
          } else {
            if (row.bonusClaimed)
              throw bad('already_claimed', 'You already claimed the weekly bonus.')
            if (row.claimedWeekdays.length !== 7)
              throw bad('not_ready', 'Claim all seven weekday rewards first.')
            reward = config.weekly.bonus
          }
          await grantReward(tx, character, reward)
          await tx
            .update(characterWeeklyRewards)
            .set(
              kind === 'milestone'
                ? { claimedMilestones: [...row.claimedMilestones, value] }
                : kind === 'weekday'
                  ? { claimedWeekdays: [...row.claimedWeekdays, value] }
                  : { bonusClaimed: true },
            )
            .where(weeklyWhere(character.id, row.week))
          return eventsView(tx, character, time)
        })
      },
    )
  for (const action of ['roll', 'replenish', 'clear'] as const)
    app.post(`/dice/${action}`, async (request) =>
      db.transaction(async (tx) => {
        const character = await lockCharacter(tx, requireUser(request).id)
        const time = now()
        await resetDaily(tx, character, time)
        let lastRoll: ReturnType<typeof rollDice> | undefined
        if (action === 'roll') {
          if (character.diceUsed >= config.dice.rollsPerDay)
            throw bad('no_attempts', 'You have no dice rolls left.')
          lastRoll = rollDice(random)
          await applyDiceBuff(tx, character.id, lastRoll.buffId, time)
          character.diceUsed++
        } else if (action === 'replenish') {
          if (character.diceUsed !== config.dice.rollsPerDay)
            throw bad('rolls_remaining', 'Use all your rolls before replenishing.')
          if (character.diceBought >= DICE_BUY_LIMIT)
            throw bad('buy_limit', 'You reached the daily replenish limit.')
          if (character.stone < config.dice.replenishCost)
            throw bad('no_money', 'You do not have enough Stone.')
          character.stone -= config.dice.replenishCost
          character.diceUsed = 0
          character.diceBought++
        } else {
          if (!(await diceBuffs(tx, character.id, time)).some((buff) => buff.buffId >= 80201))
            throw bad('no_active_curse', 'You have no active dice curse.')
          if (character.stone < config.dice.clearCurseCost)
            throw bad('no_money', 'You do not have enough Stone.')
          await removeDiceCurse(tx, character.id)
          character.stone -= config.dice.clearCurseCost
        }
        await tx
          .update(characters)
          .set({
            stone: character.stone,
            diceUsed: character.diceUsed,
            diceBought: character.diceBought,
          })
          .where(eq(characters.id, character.id))
        if (action !== 'replenish') {
          const state = await refreshBuffState(tx, character)
          character.hp = state.hp
          character.mp = state.mp
        }
        const view = await eventsView(tx, character, time)
        if (lastRoll) view.dice.lastRoll = lastRoll
        return view
      }),
    )
  app.post('/twenty-minute/claim', async (request) =>
    db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      const time = now()
      await resetDaily(tx, character, time)
      if (character.twentyMinCount >= config.twentyMinute.claimsPerDay)
        throw bad('daily_limit', 'You reached the daily reward limit.')
      if (
        character.twentyMinAt &&
        time.getTime() - character.twentyMinAt.getTime() <
          config.twentyMinute.cooldownSeconds * 1000
      )
        throw bad('cooldown', 'Your next reward is not ready yet.')
      character.twentyMinAt = time
      character.twentyMinCount++
      character.giftCoupon += config.twentyMinute.giftCoupons
      await tx
        .update(characters)
        .set({
          twentyMinAt: time,
          twentyMinCount: character.twentyMinCount,
          giftCoupon: character.giftCoupon,
        })
        .where(eq(characters.id, character.id))
      await recordWeeklyActivity(tx, character.id, 'twentyMinReward', time)
      return eventsView(tx, character, time)
    }),
  )
}
export default eventsRoutes
