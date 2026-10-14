import { z } from 'zod'

export const tracingFlipBodySchema = z
  .object({ boardId: z.string().uuid(), cell: z.number().int().min(0).max(8) })
  .strict()
export const tracingBuyBodySchema = z.object({ currency: z.literal('gold') }).strict()
export const kennelBuyBodySchema = z
  .object({ itemId: z.string().regex(/^i\d{6}$/), count: z.number().int().min(1).max(20) })
  .strict()
export type TracingArrow = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'
export interface TracingView {
  boardId: string
  cells: (TracingArrow | null)[]
  attemptsLeft: number
  canBuy: boolean
  feathers: number
  reward?: { feathers: number; petItem: string | null }
}
export interface KennelShopView {
  level: number
  feathers: number
  offers: {
    itemId: string
    nameKey: string
    price: number
    level: number
    dailyLimit: number
    purchased: number
  }[]
}
