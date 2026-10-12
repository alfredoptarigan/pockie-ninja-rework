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
  sceneId: number
}
