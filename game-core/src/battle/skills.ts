// Skill rows the engine needs on its own, and the ported scripts by their skill.ini `javascript`.
import { AOYI_SCRIPTS } from './scripts/execute.js'
import { FIELD_2600_SKILLS } from './scripts/field-2600-skills.js'
import { MONSTER_SKILLS } from './scripts/monster-skills.js'
import { fightBegin, parry } from './scripts/parry.js'
import type { SkillInput, SkillScript } from './types.js'

/** skill.ini [1]: the normal attack every fighter falls back to. */
export const NORMAL_ATTACK: SkillInput = {
  id: 1,
  type: 1,
  quomodo: 2,
  effect: 1,
  canbecounter: 1,
  mul: 1,
}

/** skill.ini [7777] and [8888]: on every outfit and in every NPC trigger list (record 1000). */
export const GENERIC_SKILLS: SkillInput[] = [
  {
    id: 7777,
    type: 2,
    quomodo: 4,
    effect: 2,
    priority: 1,
    probability: 100,
    javascript: 'skill/skill_gedang_7777.js',
  },
  {
    id: 8888,
    type: 2,
    quomodo: 1,
    effect: 2,
    priority: 1,
    probability: 100,
    javascript: 'skill/skill_init_8888.js',
  },
]

/** Scripts not listed here fail (SKILL_LOSE), so the fighter uses the normal attack instead. */
export const SKILL_SCRIPTS: Record<string, SkillScript> = {
  'skill/skill_gedang_7777.js': parry,
  'skill/skill_init_8888.js': fightBegin,
  ...MONSTER_SKILLS,
  ...FIELD_2600_SKILLS,
  ...AOYI_SCRIPTS,
}
