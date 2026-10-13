import { randomInt } from 'node:crypto'
import {
  createRandom,
  ELEMENT_PASSIVES,
  LEARNABLE_NINJUTSU,
  type SkillInput,
} from '@pockie/game-core'
import {
  SCROLL_SKILLS_PER_TREE,
  SKILL_RESET_COST,
  SKILL_SLOTS_PER_TREE,
  SKILL_TREE_COUNT,
  type SkillSlotInput,
  type SkillView,
} from '@pockie/shared'
import { and, eq, gt, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import {
  characterSkills,
  characterSkillSlots,
  characterSkillState,
  characters,
} from '../db/schema.js'
import { HttpError } from '../http.js'
import { item, rebornScrollSkills, skill } from './data.js'
import { learningView, learnThroughLevel } from './learning.js'
import type { Tx } from './progress.js'

const bad = (code: string, message: string) => new HttpError(400, code, message)
const owner = (id: string) => eq(characterSkillSlots.characterId, id)
const skillAt = (id: number, level: number): SkillInput | undefined => {
  const actualId = id + (level - 1) * 10000
  const row = skill(actualId)
  return row ? { id: actualId, ...row } : undefined
}

const DAY_MS = 24 * 60 * 60 * 1000
const scrollIds = () => Object.keys(rebornScrollSkills()).map(Number)
export const isScrollSkill = (id: number) => Object.hasOwn(rebornScrollSkills(), String(id))
const ownSkill = (characterId: string, skillId: number) =>
  and(eq(characterSkills.characterId, characterId), eq(characterSkills.skillId, skillId))
/** Rows still usable at `now`: everything but expired 7-day scroll skills. */
const live = (now: Date) =>
  or(isNull(characterSkills.expiresAt), gt(characterSkills.expiresAt, now))

/** Lazily deletes expired scroll skills; their slots cascade. The character lock must be held. */
async function dropExpiredScrolls(tx: Tx, characterId: string, now = new Date()) {
  await tx
    .delete(characterSkills)
    .where(and(eq(characterSkills.characterId, characterId), lte(characterSkills.expiresAt, now)))
}

/**
 * SkillScrollItem (decision 18): learns the scroll's skill. A 7-day scroll extends from
 * max(now, expiry); a permanent one clears the expiry; a permanent skill refuses both.
 * Returns false for other items. The character lock must be held.
 */
export async function learnScrollSkill(
  tx: Tx,
  characterId: string,
  def: NonNullable<ReturnType<typeof item>>,
  now = new Date(),
) {
  if (def.class !== 'SkillScrollItem') return false
  const skillId = Number(def.AddSkillId)
  const days = Number(def.ScrollDays)
  if (!isScrollSkill(skillId) || ![0, 7].includes(days))
    throw bad('cannot_use', 'That scroll cannot be used.')
  await dropExpiredScrolls(tx, characterId, now)
  const [current] = await tx
    .select()
    .from(characterSkills)
    .where(ownSkill(characterId, skillId))
    .for('update')
  if (current && current.expiresAt === null)
    throw bad('already_permanent', 'You already know that skill permanently.')
  const expiresAt = days
    ? new Date(Math.max(now.getTime(), current?.expiresAt?.getTime() ?? 0) + days * DAY_MS)
    : null
  if (current)
    await tx.update(characterSkills).set({ expiresAt }).where(ownSkill(characterId, skillId))
  else await tx.insert(characterSkills).values({ characterId, skillId, level: 1, expiresAt })
  return true
}

/** Expiry times (ms) of live 7-day scroll skills, for rebuilding the arena snapshot. */
export async function scrollSkillExpiries(tx: Tx | Db, characterId: string, now = new Date()) {
  const rows = await tx
    .select({ expiresAt: characterSkills.expiresAt })
    .from(characterSkills)
    .where(
      and(
        eq(characterSkills.characterId, characterId),
        isNotNull(characterSkills.expiresAt),
        gt(characterSkills.expiresAt, now),
      ),
    )
  return rows.map((row) => row.expiresAt!.getTime())
}

export async function skillView(tx: Tx, characterId: string): Promise<SkillView> {
  await dropExpiredScrolls(tx, characterId)
  const scrolls = await tx
    .select({ skillId: characterSkills.skillId, expiresAt: characterSkills.expiresAt })
    .from(characterSkills)
    .where(
      and(
        eq(characterSkills.characterId, characterId),
        inArray(characterSkills.skillId, scrollIds()),
      ),
    )
    .orderBy(characterSkills.skillId)
  const learning = await learningView(tx, characterId)
  const [state] = await tx
    .select()
    .from(characterSkillState)
    .where(eq(characterSkillState.characterId, characterId))
  const rows = await tx.select().from(characterSkillSlots).where(owner(characterId))
  return {
    ...learning,
    learned: learning.learned.filter((row) => !isScrollSkill(row.skillId)),
    scrolls: scrolls.map((row) => ({
      skillId: row.skillId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    })),
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
  const scroll = isScrollSkill(input.skillId)
  if (!scroll && !LEARNABLE_NINJUTSU.includes(input.skillId))
    throw bad('not_slottable', 'Only learned ninjutsu and scroll skills can go in the skill bar.')
  await dropExpiredScrolls(tx, characterId)
  const [learned] = await tx
    .select()
    .from(characterSkills)
    .where(ownSkill(characterId, input.skillId))
  if (!learned) throw bad('not_learned', 'You have not learned that skill.')
  if (scroll) {
    const others = await tx
      .select({ skillId: characterSkillSlots.skillId })
      .from(characterSkillSlots)
      .where(
        and(
          owner(characterId),
          eq(characterSkillSlots.tree, input.tree),
          ne(characterSkillSlots.slot, input.slot),
          ne(characterSkillSlots.skillId, input.skillId),
        ),
      )
    if (others.filter((row) => isScrollSkill(row.skillId)).length >= SCROLL_SKILLS_PER_TREE)
      throw bad(
        'not_slottable',
        `A skill tree holds at most ${SCROLL_SKILLS_PER_TREE} scroll skills.`,
      )
  }
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
  // Expired scroll skills drop out at once (decision 18), before the lazy delete.
  const slots = await tx
    .select({ skillId: characterSkillSlots.skillId, level: characterSkillSlots.level })
    .from(characterSkillSlots)
    .innerJoin(
      characterSkills,
      and(
        eq(characterSkills.characterId, characterSkillSlots.characterId),
        eq(characterSkills.skillId, characterSkillSlots.skillId),
      ),
    )
    .where(
      and(
        owner(characterId),
        eq(characterSkillSlots.tree, state?.activeTree ?? 0),
        live(new Date()),
      ),
    )
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
  // Cascades their slots in all three bars; scroll skills (bought, timed) are kept.
  await tx
    .delete(characterSkills)
    .where(
      and(
        eq(characterSkills.characterId, character.id),
        notInArray(characterSkills.skillId, scrollIds()),
      ),
    )
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
