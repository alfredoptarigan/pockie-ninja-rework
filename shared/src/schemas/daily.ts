import { z } from 'zod'
import { questRewardsSchema } from './game.js'

export const dailyTaskParamsSchema = z.object({ taskId: z.coerce.number().int().positive() })
export const dailyRewardBodySchema = z.object({
  selectType: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(0),
})
export const dailyQuestSchema = z.object({
  taskId: z.number().int().positive(),
  nameKey: z.string(),
  grade: z.number().int().min(0).max(5).optional(),
  state: z.number().int().min(0).max(3),
  progress: z.array(z.number().int().nonnegative()),
  steps: z.array(
    z.object({
      descriptionKey: z.string(),
      target: z.number().int().nonnegative(),
      kind: z.enum(['kill', 'collect', 'talk']).optional(),
      targetId: z.string().optional(),
      targetNameKey: z.string().optional(),
      sceneId: z.number().int().optional(),
    }),
  ),
  rewards: questRewardsSchema,
})
export const dailyViewSchema = z.object({
  day: z.string(),
  resetAt: z.iso.datetime(),
  refreshAt: z.iso.datetime(),
  accepted: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  /** Tasks held in progress at once (AcceptedDayTaskMaxNum). */
  inProgressLimit: z.number().int().positive(),
  quests: z.array(dailyQuestSchema),
})
export type DailyView = z.infer<typeof dailyViewSchema>
