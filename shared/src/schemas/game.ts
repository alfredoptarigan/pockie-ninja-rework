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

/**
 * Scenes no road leads to yet: the Christmas House maps (xx04) belong to the original Christmas
 * event (UI_SmallMap ChristmasStartTime / ChristmasEndTime), which is not built. They have no
 * exits of their own, so a ninja sent there could not leave.
 */
export const CLOSED_SCENES: readonly number[] = [2104, 2204, 2304, 2404, 2504]

/**
 * Bag rows a character can hold (the inventory window's 10 tabs of 15 cells). ponytail: the
 * original grows the bag by pages bought with Gold; a per-character size column when that lands.
 */
export const BAG_SLOTS = 150

/** Params of POST /api/game/items/:id/equip and /unequip: the inventory row. */
export const itemActionParamsSchema = z.object({ id: z.uuid() })

/** 0 Fire, 1 Water, 2 Earth, 3 Wind, 4 Lightning (original nation numbering). */
export type Nation = 0 | 1 | 2 | 3 | 4

/** Base stat an outfit favours; the creation screen names it and the stats it affects. */
export type OutfitBoost = 'strength' | 'agility' | 'stamina'

export interface CreationOptions {
  outfits: { clothing: number; gender: 0 | 1; weaponClass: number; boost: OutfitBoost }[]
  villages: { nation: Nation; sceneId: number }[]
  suggestedNation: Nation
}

export interface Character {
  id: string
  name: string
  gender: 0 | 1
  nation: Nation
  /** The worn outfit's clothing (stats, weapon class). */
  clothing: number
  /** Reborn's Visual Outfit: the clothing drawn instead of `clothing`; null = the worn one. */
  visualClothing: number | null
  avatarId: number
  /** The outfit's weapon class (UsePopsinger bits: 1 Blunt, 2 Sharp, 4 Fists). */
  weaponClass: number
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
  /** VIP membership end (ISO instant); null without VIP (decision 14). */
  vipUntil: string | null
  /** Worn equipment set (Reborn loadout) 1-5. */
  activeSet: number
  /** Inventory "Hide": other players' View Character gets no stats or skills. */
  hideStats: boolean
}

/** POST /api/game/character/privacy (Reborn's setCharacterPrivacy). */
export const characterPrivacySchema = z.object({ hideStats: z.boolean() }).strict()

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
  /** Levels its EXP reward gained. */
  levelsGained: amountSchema,
})

/**
 * Quests an action completed and what each granted, in the same order. Talk, item use, equip and
 * pouch buys return these fields as they are.
 */
export const questCompletionSchema = z.object({
  completed: z.array(z.number().int().positive()),
  rewards: z.array(questHandInSchema),
  /** Levels all of them gained together. */
  levelsGained: amountSchema,
})

/**
 * POST /api/game/fight and /explore/:spotId: their `rewards` is the fight or search loot, so the
 * quest hand-ins come as `questRewards`; `rewards.levelsGained` includes their level-ups.
 */
export const lootQuestCompletionSchema = z.object({
  completed: z.array(z.number().int().positive()),
  questRewards: z.array(questHandInSchema),
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
export type QuestCompletion = z.infer<typeof questCompletionSchema>
export type LootQuestCompletion = z.infer<typeof lootQuestCompletionSchema>
export type MonsterDrop = z.infer<typeof monsterDropSchema>

/**
 * POST /api/game/travel. `link` takes a scene exit (scenequeue.ini, SceneSystem.CanSwitchScene),
 * `map` a world map place (sceneswitchrule.ini, SceneSwitchRuleSystem.CanChangeScene); `home`
 * ("Village") and `out` ("Go out") use the scene's ToScene, else the village or its first field.
 */
export const travelSchema = z.union([
  z.object({
    sceneId: z.number().int().positive(),
    via: z.enum(['link', 'map']).default('map'),
  }),
  z.object({ via: z.enum(['home', 'out']) }),
])
export type TravelInput = z.input<typeof travelSchema>
