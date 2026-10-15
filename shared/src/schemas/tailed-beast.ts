// Tailed Beast (M5 decision 27): GET /api/game/tailed-beast and its actions.
import { z } from 'zod'
import type { Character } from './game.js'

const itemId = z.string().regex(/^i\d+$/)
export const tailedBeastFightSchema = z
  .object({
    beast: z.number().int().min(1).max(9),
    /** 0 normal, 1 hard, 2 rampage. */
    mode: z.number().int().min(0).max(2),
  })
  .strict()
export const tailedBeastBoxSchema = z
  .object({ fights: z.union([z.literal(5), z.literal(10), z.literal(20)]) })
  .strict()
export const tailedBeastKageSchema = z.object({ itemId }).strict()
export const tailedBeastShopSchema = z
  .object({ itemId, count: z.number().int().min(1).max(99).default(1) })
  .strict()

export type TailedBeastFightInput = z.input<typeof tailedBeastFightSchema>
export type TailedBeastShopInput = z.input<typeof tailedBeastShopSchema>

export interface TailedBeastPool {
  mode: number
  level: number
  ticketCost: number
  hpLeft: number
  maxHp: number
  /** Name of the ninja who dealt the last hit, null while alive. */
  killedBy: string | null
}

export interface TailedBeastView {
  /** UTC Monday of this event week. */
  week: string
  /** Monday = 1 ... Sunday = 7. */
  day: number
  /** Next Monday 00:00 UTC. */
  resetAt: string
  beasts: { id: number; nameKey: string; pools: TailedBeastPool[] }[]
  tickets: { used: number; perDay: number }
  /** `place`: your place by Honor this week, null without Honor. */
  me: { village: number; honor: number; essence: number; fights: number; place: number | null }
  boxes: { fights: number; itemId: string; claimed: boolean; ready: boolean }[]
  /** This week's Honor per village 0-4. */
  villages: { village: number; honor: number }[]
  /** Top 100 by Honor this week. */
  leaderboard: { place: number; name: string; level: number; village: number; honor: number }[]
  /** Last week's Kage per village; `isMe` may pick one reward once. */
  kages: { village: number; name: string; isMe: boolean; claimedItemId: string | null }[]
  kageChoices: string[]
  shop: { itemId: string; essence: number; available: boolean }[]
}

export interface TailedBeastResult {
  tailedBeast: TailedBeastView
  character: Character
}

export interface TailedBeastFightResult<R = unknown> extends TailedBeastResult {
  replay: R
  npcIds: string[]
  damage: number
  honor: number
  /** This fight dealt the last hit. */
  killed: boolean
}
