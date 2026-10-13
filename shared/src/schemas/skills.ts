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
