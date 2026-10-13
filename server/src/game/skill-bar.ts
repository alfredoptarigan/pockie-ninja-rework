import { randomInt } from 'node:crypto'
import {
  createRandom,
  ELEMENT_PASSIVES,
  LEARNABLE_NINJUTSU,
  type SkillInput,
} from '@pockie/game-core'
import {
  SKILL_RESET_COST,
  SKILL_SLOTS_PER_TREE,
  SKILL_TREE_COUNT,
  type SkillSlotInput,
  type SkillView,
} from '@pockie/shared'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import {
  characterSkills,
  characterSkillSlots,
  characterSkillState,
  characters,
} from '../db/schema.js'
import { HttpError } from '../http.js'
import { item, skill } from './data.js'
import { learningView, learnThroughLevel } from './learning.js'
import type { Tx } from './progress.js'

const bad = (code: string, message: string) => new HttpError(400, code, message)
const owner = (id: string) => eq(characterSkillSlots.characterId, id)
const skillAt = (id: number, level: number): SkillInput | undefined => {
  const actualId = id + (level - 1) * 10000
  const row = skill(actualId)
  return row ? { id: actualId, ...row } : undefined
}

export async function skillView(tx: Tx, characterId: string): Promise<SkillView> {
  const [state] = await tx
    .select()
    .from(characterSkillState)
    .where(eq(characterSkillState.characterId, characterId))
  const rows = await tx.select().from(characterSkillSlots).where(owner(characterId))
  return {
    ...(await learningView(tx, characterId)),
    activeTree: state!.activeTree,
    freeResets: state!.freeResets,
    resetCost: SKILL_RESET_COST,
    trees: Array.from({ length: SKILL_TREE_COUNT }, (_, tree) =>
      Array.from({ length: SKILL_SLOTS_PER_TREE }, (_, slot) => {
        const row = rows.find((row) => row.tree === tree && row.slot === slot)
        return { slot, skillId: row?.skillId ?? null, level: row?.level ?? 0 }
      }),
    ),
  }
}

export async function setSkillSlot(tx: Tx, characterId: string, input: SkillSlotInput) {
  const target = and(
    owner(characterId),
    eq(characterSkillSlots.tree, input.tree),
    eq(characterSkillSlots.slot, input.slot),
  )
  if (input.skillId === null) {
    await tx.delete(characterSkillSlots).where(target)
    return
  }
  if (!LEARNABLE_NINJUTSU.includes(input.skillId))
    throw bad('not_slottable', 'Only learned ninjutsu can go in the skill bar.')
  const [learned] = await tx
    .select()
    .from(characterSkills)
    .where(
      and(eq(characterSkills.characterId, characterId), eq(characterSkills.skillId, input.skillId)),
    )
  if (!learned) throw bad('not_learned', 'You have not learned that skill.')
  const level = input.level ?? learned.level
  if (level > learned.level || !skillAt(input.skillId, level))
    throw bad('invalid_level', 'Choose a level you have learned.')
  await tx
    .delete(characterSkillSlots)
    .where(
      and(
        owner(characterId),
        eq(characterSkillSlots.tree, input.tree),
        eq(characterSkillSlots.skillId, input.skillId),
        ne(characterSkillSlots.slot, input.slot),
      ),
    )
  await tx
    .insert(characterSkillSlots)
    .values({ characterId, tree: input.tree, slot: input.slot, skillId: input.skillId, level })
    .onConflictDoUpdate({
      target: [characterSkillSlots.characterId, characterSkillSlots.tree, characterSkillSlots.slot],
      set: { skillId: input.skillId, level },
    })
}

/** The active bar plus learned element passives; outfit/generic skills are added by combat. */
export async function characterSkillInputs(
  tx: Tx | Db,
  characterId: string,
): Promise<SkillInput[]> {
  const [state] = await tx
    .select()
    .from(characterSkillState)
    .where(eq(characterSkillState.characterId, characterId))
  const slots = await tx
    .select()
    .from(characterSkillSlots)
    .where(and(owner(characterId), eq(characterSkillSlots.tree, state?.activeTree ?? 0)))
    .orderBy(characterSkillSlots.slot)
  const passives = await tx
    .select()
    .from(characterSkills)
    .where(
      and(
        eq(characterSkills.characterId, characterId),
        inArray(characterSkills.skillId, ELEMENT_PASSIVES),
      ),
    )
  return [...slots, ...passives].flatMap((row) => {
    const resolved = skillAt(row.skillId, row.level)
    return resolved ? [resolved] : []
  })
}

export async function resetSkills(
  tx: Tx,
  character: typeof characters.$inferSelect,
  currency: 'gold' | 'giftCoupon',
) {
  const [state] = await tx
    .select()
    .from(characterSkillState)
    .where(eq(characterSkillState.characterId, character.id))
  const free = state!.freeResets > 0
  if (!free && character[currency] < SKILL_RESET_COST)
    throw bad(
      'no_money',
      `You need ${SKILL_RESET_COST} ${currency === 'gold' ? 'Gold' : 'Gift Coupons'}.`,
    )
  const old = await tx
    .select()
    .from(characterSkills)
    .where(eq(characterSkills.characterId, character.id))
  const primaryCount = old
    .filter((row) => ELEMENT_PASSIVES.includes(row.skillId))
    .reduce((count, row) => count + row.level, 0)
  const random = createRandom(randomInt(2 ** 31))
  const learned: { characterId: string; skillId: number; level: number }[] = []
  const draw = (ids: number[], count: number) => {
    const pool = [...ids]
    for (let i = 0; i < count && pool.length; i++)
      learned.push({
        characterId: character.id,
        skillId: pool.splice(random.int(pool.length), 1)[0]!,
        level: 1,
      })
  }
  // OnCustomResetSkill preserves primary count and rerolls primary skills before secondary skills.
  draw(ELEMENT_PASSIVES, primaryCount)
  draw(LEARNABLE_NINJUTSU, character.level - 1)
  await tx.delete(characterSkills).where(eq(characterSkills.characterId, character.id)) // cascades all three bars
  if (learned.length) await tx.insert(characterSkills).values(learned)
  if (free)
    await tx
      .update(characterSkillState)
      .set({ freeResets: state!.freeResets - 1 })
      .where(eq(characterSkillState.characterId, character.id))
  else
    await tx
      .update(characters)
      .set({ [currency]: character[currency] - SKILL_RESET_COST })
      .where(eq(characters.id, character.id))
}

/** FreeTimesItem.js: only the original skill-reset counter is supported here. */
export async function grantFreeSkillReset(
  tx: Tx,
  character: typeof characters.$inferSelect,
  def: NonNullable<ReturnType<typeof item>>,
) {
  if (def.JavaScript !== 'item/FreeTimesItem.js' || def.FreePropName !== 'SkillFreeResetCnt')
    return false
  const count = Number(def.FreeTimes)
  if (!Number.isSafeInteger(count) || count <= 0)
    throw bad('cannot_use', 'That reset item cannot be used.')
  await learnThroughLevel(tx, character)
  await tx
    .update(characterSkillState)
    .set({ freeResets: sql`${characterSkillState.freeResets} + ${count}` })
    .where(eq(characterSkillState.characterId, character.id))
  return true
}
