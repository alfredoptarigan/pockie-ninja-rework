import { z } from 'zod'
import type { Character, QuestRewards } from './game.js'

export const milestoneParamsSchema = z.object({
  points: z.coerce.number().pipe(z.union([z.literal(50), z.literal(100), z.literal(200)])),
})
export const weekdayParamsSchema = z.object({ day: z.coerce.number().int().min(1).max(7) })
export interface EventsView {
  character: Character
  resetAt: string
  login: {
    completedDays: number
    nextDay: number
    canClaim: boolean
    canClaimBonus: boolean
    rewards: { day: number; reward: QuestRewards; claimed: boolean }[]
    bonus: QuestRewards
  }
  weekly: {
    week: string
    points: number
    counters: Record<string, number>
    activities: { id: string; label: string; points: number; count: number; max: number }[]
    milestones: { points: number; reward: QuestRewards; claimed: boolean }[]
    weekdays: { day: number; reward: QuestRewards; claimed: boolean }[]
    weekday: number
    canClaimBonus: boolean
    bonus: QuestRewards
  }
  dice: {
    rollsLeft: number
    bought: number
    buyLimit: number
    replenishCost: number
    clearCost: number
    curse: boolean
    buffs: { buffId: number; expiresAt: string | null }[]
    lastRoll?: { dice: number[]; net: number; buffId: number | null }
  }
  twentyMinute: { nextClaimAt: string; claimsToday: number; dailyCap: number; coupons: number }
}
