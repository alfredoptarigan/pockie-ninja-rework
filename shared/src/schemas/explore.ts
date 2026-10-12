import { z } from 'zod'

const cardIndex = z.number().int().min(0).max(4)
const searchId = z.uuid()
const mode = z.enum(['normal', 'senior']).default('normal')

/** Omitting action preserves the original immediate-search API. */
export const exploreSearchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('quick'), mode }).strict(),
  z.object({ action: z.literal('start'), mode }).strict(),
  z.object({ action: z.literal('pick'), searchId, cardIndex }).strict(),
])

export const explorePeekSchema = z
  .object({
    searchId,
    cardIndex,
    currency: z.enum(['gold', 'giftCoupon']).default('gold'),
  })
  .strict()

export type ExploreSearchInput = z.input<typeof exploreSearchSchema>
export type ExplorePeekInput = z.input<typeof explorePeekSchema>
