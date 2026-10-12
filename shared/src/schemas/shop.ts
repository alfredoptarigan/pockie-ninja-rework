import { z } from 'zod'
export const shopTypeSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
export const shopCurrencySchema = z.enum(['stone', 'gold', 'giftCoupon'])
export const shopOpenSchema = z
  .object({ tab: z.coerce.number().int().min(1).max(4).optional() })
  .strict()
export const merchantOpenSchema = z.object({}).strict()
export const wholesaleBuySchema = z
  .object({ itemId: z.string().regex(/^i\d+$/), count: z.number().int().min(1).max(10000) })
  .strict()
export const shopRefreshSchema = z
  .object({
    shopType: shopTypeSchema,
    mode: z.enum(['countdown', 'instant']),
    currency: shopCurrencySchema.default('stone'),
  })
  .strict()
export const shopBuySchema = z
  .object({
    shopType: shopTypeSchema,
    slot: z.number().int().min(0).max(99),
    currency: shopCurrencySchema.default('stone'),
  })
  .strict()
export const shopBuyAllSchema = z.object({ shopType: shopTypeSchema }).strict()
export const shopSellSchema = z
  .object({ inventoryId: z.uuid(), count: z.number().int().min(1).max(10000) })
  .strict()
export const shopSellAllSchema = z
  .object({
    inventoryIds: z
      .array(z.uuid())
      .min(1)
      .max(150)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict()
export const shopPouchRefillSchema = z
  .object({
    currency: z.enum(['gold', 'giftCoupon']),
    hp: z.number().int().min(-1).max(10000).default(0),
    mp: z.number().int().min(-1).max(10000).default(0),
  })
  .strict()
export const merchantBuySchema = z
  .object({
    spawnId: z.uuid(),
    tab: z.enum(['gold', 'vip']).default('gold'),
    slot: z.number().int().min(0).max(99),
    count: z.number().int().min(1).max(10000),
  })
  .strict()
