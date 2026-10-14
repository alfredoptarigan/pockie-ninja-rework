import { requireBagRoom } from '../../game/bag.js'
import { dailyRewardBodySchema, dailyTaskParamsSchema, dailyViewSchema } from '@pockie/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { recordWeeklyActivity } from '../events/weekly-activity.js'
import { characterDailyQuests, characterQuests, characters } from '../../db/schema.js'
import { itemNameKey, subTasks, task } from '../../game/data.js'
import {
  acceptQuest,
  completeQuest,
  expUpdate,
  loadQuests,
  saveCharacterProgress,
  type Tx,
} from '../../game/progress.js'
import { questLock, questRewards } from '../../game/quests.js'
import { HttpError } from '../../http.js'
import { lockCharacter, toCharacter } from '../game/characters.js'
import { requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { dailyData, neutralField, pickTasks } from './rules.js'

const config = dailyData.config
const bad = (code: string, message: string) => new HttpError(400, code, message)
type CharacterRow = typeof characters.$inferSelect
const boardWhere = (id: string) => eq(characterDailyQuests.characterId, id)
const taskWhere = (id: string, taskId: number) =>
  and(boardWhere(id), eq(characterDailyQuests.taskId, taskId))
/** The route's quest id; unknown ids (also past the int column's range) stop before SQL. */
function taskIdOf(params: unknown) {
  const { taskId } = dailyTaskParamsSchema.parse(params)
  if (!task(taskId)) throw bad('not_offered', 'That daily quest is not available.')
  return taskId
}

/** DayTaskSystem.UpdataDayTaskCompleteNum, OnCustomOpenTaskDialog and H_DayTaskFlushkHeart. */
async function openBoard(tx: Tx, character: CharacterRow) {
  if (!neutralField(character.sceneId))
    throw bad('outside_neutral', 'Daily quests are only available in neutral fields.')
  if (character.level < config.CanAcceptDayMinLevel)
    throw bad('too_low', 'Your level is too low for daily quests.')
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const quests = await loadQuests(tx, character.id)
  if (character.dailyQuestDay !== day) {
    character.dailyQuestDay = day
    character.dailyQuestsAccepted = quests.filter(
      (q) => Number(task(q.taskId)?.TaskBaseType) === 2 && q.state !== 2,
    ).length
    character.dailyQuestsCompleted = 0
    await tx
      .update(characters)
      .set({
        dailyQuestDay: day,
        dailyQuestsAccepted: character.dailyQuestsAccepted,
        dailyQuestsCompleted: 0,
      })
      .where(eq(characters.id, character.id))
  }
  // DayTaskSystem.FlushTaskScore: pay last week's score as honor (UTC Monday week).
  const weekDate = new Date(`${day}T00:00:00Z`)
  weekDate.setUTCDate(weekDate.getUTCDate() - ((weekDate.getUTCDay() + 6) % 7))
  const week = weekDate.toISOString().slice(0, 10)
  if (character.dailyScoreWeek !== week) {
    character.honor += character.dailyScore
    character.dailyScore = 0
    character.dailyScoreWeek = week
    await tx
      .update(characters)
      .set({ honor: character.honor, dailyScore: 0, dailyScoreWeek: week })
      .where(eq(characters.id, character.id))
  }
  let board = await tx.select().from(characterDailyQuests).where(boardWhere(character.id))
  // The original retains unfinished tasks; refresh removes offered and rewarded rows only.
  if (
    !board.length ||
    (character.dailyQuestOfferAt &&
      now.getTime() - character.dailyQuestOfferAt.getTime() >= config.FlushDayTaskTime * 60000)
  ) {
    if (character.dailyQuestsAccepted < config.PerDayCompleteTaskMax) {
      const removed = board
        .filter((row) => row.state === 0 || row.state === 3)
        .map((row) => row.taskId)
      if (removed.length)
        await tx
          .delete(characterDailyQuests)
          .where(and(boardWhere(character.id), inArray(characterDailyQuests.taskId, removed)))
      board = board.filter((row) => row.state !== 0 && row.state !== 3)
      for (const taskId of pickTasks(character, board))
        await tx.insert(characterDailyQuests).values({ characterId: character.id, taskId })
    }
    character.dailyQuestOfferAt = now
    await tx
      .update(characters)
      .set({ dailyQuestOfferAt: now })
      .where(eq(characters.id, character.id))
  }
  return character
}
async function view(tx: Tx, character: CharacterRow) {
  const board = await tx.select().from(characterDailyQuests).where(boardWhere(character.id))
  const held = await loadQuests(tx, character.id)
  return dailyViewSchema.parse({
    day: character.dailyQuestDay,
    resetAt: new Date(Date.parse(`${character.dailyQuestDay}T00:00:00Z`) + 86400000).toISOString(),
    refreshAt: new Date(
      (character.dailyQuestOfferAt?.getTime() ?? Date.now()) + config.FlushDayTaskTime * 60000,
    ).toISOString(),
    accepted: character.dailyQuestsAccepted,
    completed: character.dailyQuestsCompleted,
    limit: config.PerDayCompleteTaskMax,
    inProgressLimit: config.AcceptedDayTaskMaxNum,
    quests: board
      .sort((a, b) => a.taskId - b.taskId)
      .map((row) => {
        const quest = held.find((q) => q.taskId === row.taskId)
        return {
          ...row,
          state: row.state === 1 && quest?.state === 1 ? 2 : row.state,
          progress: row.state === 0 ? subTasks(row.taskId).map(() => 0) : (quest?.progress ?? []),
          nameKey: `lg_Task_${row.taskId}`,
          grade: Number(task(row.taskId)!.TaskGrade),
          rewards: questRewards(row.taskId),
          steps: subTasks(row.taskId).map((step) => ({
            descriptionKey: `lg_${step.SubTaskDescription}`,
            target: Number(step.TargetRequireNum),
            kind:
              Number(step.SubTaskType) === 2
                ? 'kill'
                : Number(step.SubTaskType) === 3
                  ? 'talk'
                  : 'collect',
            targetId: String(
              Number(step.SubTaskType) !== 1 ? step.TargetConfiger : step.TargetItem,
            ),
            targetNameKey:
              Number(step.SubTaskType) !== 1
                ? `lg_name_${step.TargetConfiger}`
                : itemNameKey(String(step.TargetItem)),
            sceneId: Number(step.SubmitSceneID),
          })),
        }
      }),
  })
}
export async function dailyRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.daily } }, async (request) => {
    const userId = requireUser(request).id
    return db.transaction(async (tx) =>
      view(tx, await openBoard(tx, await lockCharacter(tx, userId))),
    )
  })
  // DayTaskSystem.OnCustomAcceptDayTask / CheckAcceptedDayTaskCount, TaskSystem.TryAcceptTask.
  app.post('/:taskId/accept', { config: { rateLimit: RATE_LIMITS.daily } }, async (request) => {
    const userId = requireUser(request).id
    const taskId = taskIdOf(request.params)
    return db.transaction(async (tx) => {
      const character = await openBoard(tx, await lockCharacter(tx, userId))
      const board = await tx.select().from(characterDailyQuests).where(boardWhere(character.id))
      if (!board.some((q) => q.taskId === taskId && q.state === 0))
        throw bad('not_offered', 'That daily quest is not available.')
      if (
        character.dailyQuestsAccepted >= config.PerDayCompleteTaskMax ||
        board.filter((q) => q.state === 1 || q.state === 2).length >= config.AcceptedDayTaskMaxNum
      )
        throw bad('daily_limit', 'You have reached the daily quest limit.')
      // Completed dailies may be picked again on a later refresh (TaskSystem removes them).
      await tx
        .delete(characterQuests)
        .where(
          and(
            eq(characterQuests.characterId, character.id),
            eq(characterQuests.taskId, taskId),
            eq(characterQuests.state, 2),
          ),
        )
      const locked = questLock(taskId, character, await loadQuests(tx, character.id), true)
      if (locked) throw bad(locked.code, locked.message)
      await acceptQuest(tx, character.id, taskId)
      await tx.update(characterDailyQuests).set({ state: 1 }).where(taskWhere(character.id, taskId))
      character.dailyQuestsAccepted++
      await tx
        .update(characters)
        .set({ dailyQuestsAccepted: character.dailyQuestsAccepted })
        .where(eq(characters.id, character.id))
      return view(tx, character)
    })
  })
  // DayTaskSystem.OnCustomRewardDayTask / CheckSelectTaskRewardType / DecRewardDayTaskCapital.
  app.post('/:taskId/hand-in', { config: { rateLimit: RATE_LIMITS.daily } }, async (request) => {
    const userId = requireUser(request).id
    const taskId = taskIdOf(request.params)
    const { selectType } = dailyRewardBodySchema.parse(request.body ?? {})
    return db.transaction(async (tx) => {
      const character = await openBoard(tx, await lockCharacter(tx, userId))
      const [row] = await tx
        .select()
        .from(characterDailyQuests)
        .where(taskWhere(character.id, taskId))
      if (!row || (row.state !== 1 && row.state !== 2))
        throw bad('not_accepted', 'You have not accepted that daily quest.')
      if (selectType !== 0 && Number(task(taskId)!.TaskGrade) < 2)
        throw bad('invalid_reward', 'That quest cannot use a bonus reward.')
      const choice =
        selectType === 1
          ? { currency: 'gold' as const, cost: 1, factor: 25 }
          : selectType === 2
            ? { currency: 'giftCoupon' as const, cost: 1, factor: 20 }
            : selectType === 3
              ? { currency: 'stone' as const, cost: 1000, factor: 10 }
              : undefined
      if (choice && character[choice.currency] < choice.cost)
        throw bad('no_money', 'You do not have enough currency for that reward choice.')
      const reward = await completeQuest(tx, character.id, taskId)
      if (!reward) throw bad('not_ready', 'Finish the daily quest objectives first.')
      // TaskBaseRule.CanGiveTaskRewardItems: a full bag must not lose the quest or its rewards.
      await requireBagRoom(tx, character.id, [])
      // TaskBaseRule.OnAfterTaskComplete: dailies are removed, never stored in TaskCompleted_Rec.
      await tx
        .delete(characterQuests)
        .where(
          and(eq(characterQuests.characterId, character.id), eq(characterQuests.taskId, taskId)),
        )
      await tx.update(characterDailyQuests).set({ state: 3 }).where(taskWhere(character.id, taskId))
      await tx
        .update(characters)
        .set({
          dailyQuestsCompleted: character.dailyQuestsCompleted + 1,
          dailyScore: character.dailyScore + Number(task(taskId)!.RewardScore),
        })
        .where(eq(characters.id, character.id))
      await recordWeeklyActivity(tx, character.id, 'mission')
      if (choice) {
        // RewardRule.GetRewardTaskFactor / RewardExp: only EXP is increased; money and items are unchanged.
        // reward.exp already holds the VIP bonus (completeQuest), so the factor scales it too.
        const bonus = Math.floor(Math.fround(Math.fround(reward.exp) * choice.factor) / 100)
        const [paid] = await tx.select().from(characters).where(eq(characters.id, character.id))
        const { levelsGained, ...exp } = expUpdate(paid!, bonus)
        await saveCharacterProgress(tx, character.id, {
          ...exp,
          [choice.currency]: paid![choice.currency] - choice.cost,
        })
        reward.exp += bonus
        reward.levelsGained += levelsGained
      }
      const [updated] = await tx.select().from(characters).where(eq(characters.id, character.id))
      return { ...(await view(tx, updated!)), reward, character: toCharacter(updated!) }
    })
  })
}

export default dailyRoutes
