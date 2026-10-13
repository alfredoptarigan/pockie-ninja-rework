import { z } from 'zod'
export interface LearnedSkill {
  skillId: number
  level: number
}
export interface LearnableSkill {
  skillId: number
  nameKey: string
  kind: 'ninjutsu' | 'element'
  type: number
  maxLevel: number
}
export interface SkillLearningView {
  learned: LearnedSkill[]
  catalog: LearnableSkill[]
  learnedThrough: number
}

export const SKILL_TREE_COUNT = 3
export const SKILL_SLOTS_PER_TREE = 6
export const SKILL_RESET_COST = 8
export interface SkillSlot {
  slot: number
  skillId: number | null
  level: number
}
export interface SkillView extends SkillLearningView {
  trees: SkillSlot[][]
  activeTree: number
  freeResets: number
  resetCost: number
}
const tree = z
  .number()
  .int()
  .min(0)
  .max(SKILL_TREE_COUNT - 1)
export const skillTreeSchema = z.object({ tree })
export const skillSlotSchema = z.object({
  tree,
  slot: z
    .number()
    .int()
    .min(0)
    .max(SKILL_SLOTS_PER_TREE - 1),
  skillId: z.number().int().positive().nullable(),
  level: z.number().int().min(1).max(13).optional(),
})
export const skillResetSchema = z.object({
  currency: z.enum(['gold', 'giftCoupon']).default('gold'),
})
export type SkillSlotInput = z.infer<typeof skillSlotSchema>
