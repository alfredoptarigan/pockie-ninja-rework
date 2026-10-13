import { randomInt } from 'node:crypto'
import { createRandom, ELEMENT_PASSIVES, LEARNABLE_NINJUTSU, type Random } from '@pockie/game-core'
import type { LearnedSkill, SkillLearningView } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import { characterSkills, characterSkillState, characters } from '../db/schema.js'
import { skill } from './data.js'
import type { Tx } from './progress.js'

/** Every learnable row in UpSkilCfg.ini has MaxLevel=1. Primary level 1 needs role level 1. */
export const MAX_LEARNED_SKILL_LEVEL = 1
export function rollLearning(
  existing: LearnedSkill[],
  from: number,
  through: number,
  random: Random,
): LearnedSkill[] {
  const learned = existing.map((row) => ({ ...row }))
  const add = (ids: number[]) => {
    const available = ids.filter(
      (id) => !learned.some((row) => row.skillId === id && row.level >= MAX_LEARNED_SKILL_LEVEL),
    )
    if (available.length)
      learned.push({ skillId: available[random.int(available.length)]!, level: 1 })
  }
  // AutoAddPlayerSkill learns all secondary skills first, then each crossed tenth-level primary.
  for (let level = from + 1; level <= through; level++) add(LEARNABLE_NINJUTSU)
  for (let level = from + 1; level <= through; level++) if (level % 10 === 0) add(ELEMENT_PASSIVES)
  return learned
}

/** Character lock must be held; the checkpoint makes legacy catch-up and retries idempotent. */
export async function learnThroughLevel(
  tx: Tx,
  character: Pick<typeof characters.$inferSelect, 'id' | 'level'>,
) {
  await tx.insert(characterSkillState).values({ characterId: character.id }).onConflictDoNothing()
  const [state] = await tx
    .select()
    .from(characterSkillState)
    .where(eq(characterSkillState.characterId, character.id))
  const existing = await tx
    .select()
    .from(characterSkills)
    .where(eq(characterSkills.characterId, character.id))
  if (state!.learnedThrough >= character.level) return false
  const learned = rollLearning(
    existing,
    state!.learnedThrough,
    character.level,
    createRandom(randomInt(2 ** 31)),
  )
  const added = learned.filter((row) => !existing.some((old) => old.skillId === row.skillId))
  if (added.length)
    await tx
      .insert(characterSkills)
      .values(added.map((row) => ({ characterId: character.id, ...row })))
  await tx
    .update(characterSkillState)
    .set({ learnedThrough: character.level })
    .where(eq(characterSkillState.characterId, character.id))
  return true
}

export async function learningView(tx: Tx, characterId: string): Promise<SkillLearningView> {
  const learned = await tx
    .select({ skillId: characterSkills.skillId, level: characterSkills.level })
    .from(characterSkills)
    .where(eq(characterSkills.characterId, characterId))
    .orderBy(characterSkills.skillId)
  const [state] = await tx
    .select()
    .from(characterSkillState)
    .where(eq(characterSkillState.characterId, characterId))
  return {
    learned,
    learnedThrough: state!.learnedThrough,
    catalog: [...LEARNABLE_NINJUTSU, ...ELEMENT_PASSIVES].map((skillId) => ({
      skillId,
      nameKey: `lg_Skill_${skillId}`,
      kind: ELEMENT_PASSIVES.includes(skillId) ? 'element' : 'ninjutsu',
      type: skill(skillId)?.type ?? 3,
      maxLevel: MAX_LEARNED_SKILL_LEVEL,
    })),
  }
}
