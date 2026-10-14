// Pet skill rules (decision 14). NewPetSystem.java: PetRealizeSkill (learned list, levels,
// MaxSkillCount), LearnSkill (random pick), OnCustomActSkill (slots), OnCustomPetSkillLock.
import data from '../../../server/data/game/reborn/pet-foods.json'
import type { Random } from '../random.js'
import { MAX_LEARNED_SKILLS, MAX_LOCKED_SKILLS, MAX_SLOTS_PER_KIND } from './constants.js'

/** One `character_pet_skills` row: kind 1 Halo, 2 Help, 3 Pass; slot 0-5 or null. */
export interface LearnedSkill {
  skillId: number
  level: number
  learnedOrder: number
  locked: boolean
  kind: number
  slot: number | null
}

/**
 * PetRealizeSkill: a known skill gains a level (refused at `maxLevel`); a new one joins at level 1.
 * When the list holds MaxSkillCount (5), the oldest unlocked skill leaves (2011 drops row 0; the
 * lock is decision 14). Returns the new list, or null when refused.
 */
export function learnSkill(
  learned: readonly LearnedSkill[],
  skillId: number,
  kind: number,
  maxLevel: number,
): LearnedSkill[] | null {
  const known = learned.find((s) => s.skillId === skillId)
  if (known) {
    if (known.level >= maxLevel) return null
    return learned.map((s) => (s === known ? { ...s, level: s.level + 1 } : s))
  }
  let kept = [...learned]
  if (kept.length >= MAX_LEARNED_SKILLS) {
    const oldest = kept
      .filter((s) => !s.locked)
      .reduce<LearnedSkill | null>((a, s) => (!a || s.learnedOrder < a.learnedOrder ? s : a), null)
    if (!oldest) return null
    kept = kept.filter((s) => s !== oldest)
  }
  const order = Math.max(-1, ...learned.map((s) => s.learnedOrder)) + 1
  return [...kept, { skillId, level: 1, learnedOrder: order, locked: false, kind, slot: null }]
}

/** LearnSkill: `RandInt(0, n - 1)` over the species' pool of the kind minus known skills. */
export function pickLearnSkill(
  pool: readonly number[],
  learned: readonly LearnedSkill[],
  random: Random,
) {
  const open = pool.filter((id) => !learned.some((s) => s.skillId === id))
  return open.length ? open[random.between(0, open.length - 1)]! : null
}

/** PetSkillCnt: the slot total a pet of `level` may hold (levels past 35 use 35). */
export const skillCap = (level: number) =>
  data.skillCount[Math.min(Math.max(level, 0), data.skillCount.length - 1)]!

/** PetActCapital[n]: Stone price of the pet's n-th slot; null past the table. */
export const slotCost = (n: number) => data.slotCost[n] ?? null

/** OnCustomActSkill: below the level's total, below 6 in the kind, and priced. */
export const canUnlockSlot = (slotsTotal: number, kindSlots: number, level: number) =>
  slotsTotal < skillCap(level) &&
  kindSlots < MAX_SLOTS_PER_KIND &&
  (slotCost(slotsTotal + 1) ?? 0) > 0

/** OnCustomPetSkillLock: lock items for the next lock (1, then 2); null at 2 locks. */
export const lockCost = (lockedCount: number) =>
  lockedCount >= MAX_LOCKED_SKILLS ? null : lockedCount + 1
