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

/** Skill bar trees: Reborn's Skills window presets 1-5. */
export const SKILL_TREE_COUNT = 5
export const SKILL_SLOTS_PER_TREE = 6
/** Reborn's outfit stars open a 7th (2 stars) and an 8th (5 stars) slot. */
export const MAX_SKILL_SLOTS = 8
export const SKILL_RESET_COST = 8
export interface SkillSlot {
  slot: number
  skillId: number | null
  level: number
}
/** At most this many scroll skills per skill-bar tree (M5 decision 18). */
export const SCROLL_SKILLS_PER_TREE = 2
/** A learned scroll skill; `expiresAt` null = permanent. */
export interface ScrollSkill {
  skillId: number
  expiresAt: string | null
}
export interface SkillView extends SkillLearningView {
  /** The open slots of each tree: 6, more with the worn outfit's stars. */
  trees: SkillSlot[][]
  /** Live scroll skills (not in `learned`). */
  scrolls: ScrollSkill[]
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
    .max(MAX_SKILL_SLOTS - 1),
  skillId: z.number().int().positive().nullable(),
  level: z.number().int().min(1).max(13).optional(),
})
export const skillResetSchema = z.object({
  currency: z.enum(['gold', 'giftCoupon']).default('gold'),
})
export type SkillSlotInput = z.infer<typeof skillSlotSchema>
