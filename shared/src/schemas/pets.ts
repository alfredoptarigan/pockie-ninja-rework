// Pets (M6 decisions 8-19): GET /api/game/pets and the Pet Kennel actions.
import { z } from 'zod'
import type { Character } from './game.js'

const itemId = z.string().regex(/^i\d{6}$/)
/** Skill kind: 1 Halo, 2 Help, 3 Pass (skill.ini `ispet`). */
export const petSkillKindSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
export type PetSkillKind = z.infer<typeof petSkillKindSchema>

export const petParamsSchema = z.object({ id: z.string().uuid() })
export const petSkillParamsSchema = petParamsSchema.extend({
  skill: z.coerce.number().int().positive(),
})
export const petActiveBodySchema = z.object({ active: z.boolean() }).strict()
/** One food item id per food slot (null = leave the slot empty). */
export const petFeedBodySchema = z.object({ foods: z.array(itemId.nullable()).length(6) }).strict()
export const petDigestNowBodySchema = z
  .object({ currency: z.enum(['gold', 'giftCoupon']) })
  .strict()
export const petSkillKindBodySchema = z.object({ kind: petSkillKindSchema }).strict()
export const petBookBodySchema = z.object({ item: itemId }).strict()
/** The evolved form to take; needed only when the species has more than one. */
export const petEvolveBodySchema = z.object({ into: itemId.optional() }).strict()

export type PetFeedBody = z.infer<typeof petFeedBodySchema>
export type PetDigestCurrency = z.infer<typeof petDigestNowBodySchema>['currency']

export interface PetPropsView {
  attack: number
  defence: number
  disturb: number
  active: number
  savvy: number
}

export interface PetFoodSlotView {
  /** Food type the slot asks for (1 = any). */
  type: number
  /** Multiplier tier 0-3 (percent through the species' food multipliers). */
  mul: number
  /** Food item digesting in the slot. */
  item: string | null
}

export interface PetSkillView {
  skillId: number
  nameKey: string
  kind: PetSkillKind
  slot: number
  level: number
  locked: boolean
}

export interface PetView {
  id: string
  species: string
  nameKey: string
  /** Battle art avatar key of client/src/generated/reborn-pets.json. */
  avatar: number
  /** 1 Plant, 2 Beast, 3 Artificial, 4 Dragon, 5 Tailed Beast, 6 Spirits. */
  nature: number
  /** Food type the pet likes (like bonus). */
  foodType: number
  kennelSlot: number
  active: boolean
  level: number
  exp: number
  /** EXP to the next level; null at the level cap. */
  expToNext: number | null
  growth: number
  totals: PetPropsView
  appetite: number
  appetiteMax: number
  /** ISO time the food finishes digesting; null when not digesting. */
  digestEndsAt: string | null
  foodSlots: PetFoodSlotView[]
  skills: PetSkillView[]
  /** Unlocked skill slots per kind: [Halo, Help, Pass]. */
  slots: [number, number, number]
  /** Total skill slots the pet's level allows. */
  slotCap: number
  /** Stone price of the next skill slot; null when no more can be unlocked. */
  nextSlotCost: number | null
  /** Pet Skill Locks the next lock uses; null at the lock cap. */
  nextLockCost: number | null
  /** Species this pet can evolve into. */
  evolvesTo: { species: string; nameKey: string }[]
}

export interface PetItemCount {
  itemId: string
  nameKey: string
  count: number
}

export interface PetsView {
  pets: PetView[]
  petSlots: number
  maxSlots: number
  /** Gold per extra kennel slot. */
  slotPrice: number
  /** Gold or Gift Coupons to finish digesting at once. */
  digestPrice: number
  evolve: { level: number; feathers: number }
  feathers: number
  lockItem: PetItemCount
  removeItem: PetItemCount
  foods: (PetItemCount & { type: number; hunger: number })[]
  books: (PetItemCount & { skillId: number; kind: PetSkillKind })[]
}

export interface PetActionResult extends PetsView {
  character: Character
}
