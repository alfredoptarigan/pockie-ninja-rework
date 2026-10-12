import { z } from 'zod'

export const characterNameSchema = z
  .string()
  .trim()
  .min(3, 'Ninja name must be at least 3 characters.')
  .max(12, 'Ninja name must be at most 12 characters.')
  .regex(/^[A-Za-z0-9_]+$/, 'Use only letters, numbers and underscores.')

export const createCharacterSchema = z.object({
  name: characterNameSchema,
  gender: z.union([z.literal(0), z.literal(1)], { error: 'Choose a gender.' }),
  clothing: z.number({ error: 'Choose an outfit.' }).int(),
  nation: z
    .number({ error: 'Choose a village.' })
    .int()
    .min(0, 'Choose a village.')
    .max(4, 'Choose a village.'),
})

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>

/** 0 Fire, 1 Water, 2 Earth, 3 Wind, 4 Lightning (original nation numbering). */
export type Nation = 0 | 1 | 2 | 3 | 4

export interface CreationOptions {
  outfits: { clothing: number; gender: 0 | 1; weaponClass: number }[]
  villages: { nation: Nation; sceneId: number }[]
  suggestedNation: Nation
}

export interface Character {
  id: string
  name: string
  gender: 0 | 1
  nation: Nation
  clothing: number
  avatarId: number
  level: number
  exp: number
  stone: number
  gold: number
  giftCoupon: number
  honor: number
  hp: number
  mp: number
  maxHp: number
  maxMp: number
  /** HP/MP pouch amounts and their shared size (RoleUseSystem). */
  hpPouch: number
  mpPouch: number
  pouchMax: number
  sceneId: number
}

/**
 * Combat stats with equipment, as fights use them (GET /api/game/character `stats`).
 * Raw server values: strength/agility/stamina are x100, atkTime is the time between actions.
 */
export interface CharacterStats {
  strength: number
  agility: number
  stamina: number
  maxHp: number
  maxMp: number
  minAttack: number
  maxAttack: number
  atkTime: number
  defense: number
  dodge: number
  hit: number
  crit: number
  critAttach: number
  parry: number
  pierce: number
  tough: number
  neglectDefense: number
  counter: number
  weaponClass: number
}

const itemIdSchema = z.string().regex(/^i\d+$/)
const amountSchema = z.number().int().nonnegative()

/** An item and how many of it (quest rewards, what a hand-in granted). */
export const rewardItemSchema = z.object({
  itemId: itemIdSchema,
  count: z.number().int().positive(),
  /** en.json key of the item's name. */
  nameKey: z.string(),
})

/**
 * What a quest pays (Task.ini Reward*), as the original quest window lists it
 * (GET /api/game/quests and /quests/available `rewards`). Quests that pay a random pick from a
 * drop list have no `items`, like the original.
 */
export const questRewardsSchema = z.object({
  exp: amountSchema,
  stone: amountSchema,
  gold: amountSchema,
  giftCoupon: amountSchema,
  honor: amountSchema,
  items: z.array(rewardItemSchema),
})

/** What completing one quest granted (POST /api/game/npcs/:npcId/talk `rewards`). */
export const questHandInSchema = questRewardsSchema.extend({
  taskId: z.number().int().positive(),
})

/** An item a monster can drop (GET /api/game/scene `monsters[].drops`), without its chance. */
export const monsterDropSchema = z.object({ itemId: itemIdSchema, nameKey: z.string() })

/**
 * One pouch's part of a refill purchase (UI_RoleUse.as choices): 0 none, thousands of points
 * (5 = 5,000) or 'full' to fill it up. Each 1,000 points cost 1 Gold or Gift Coupon.
 */
export const pouchRefillSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(10),
  z.literal(50),
  z.literal(100),
  z.literal('full'),
])

/** POST /api/game/pouches/buy (RoleUseSystem.OnCustomBuy). */
export const buyPouchesSchema = z.object({
  currency: z.enum(['gold', 'giftCoupon']),
  hp: pouchRefillSchema.default(0),
  mp: pouchRefillSchema.default(0),
})

export type PouchRefill = z.infer<typeof pouchRefillSchema>
export type BuyPouchesInput = z.input<typeof buyPouchesSchema>
export type RewardItem = z.infer<typeof rewardItemSchema>
export type QuestRewards = z.infer<typeof questRewardsSchema>
export type QuestHandIn = z.infer<typeof questHandInSchema>
export type MonsterDrop = z.infer<typeof monsterDropSchema>
