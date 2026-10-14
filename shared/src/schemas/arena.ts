// Arena, Honor shop and Ninjutsu Duels (/api/game/arena/*, docs/original-data/pvp-rankings.md).
import { z } from 'zod'
import type { Character } from './game.js'

export const arenaFightSchema = z.object({ slot: z.number().int().min(0).max(17) }).strict()
export const arenaRevengeSchema = z.object({ logId: z.uuid() }).strict()
export const arenaLogParamsSchema = z.object({ id: z.uuid() }).strict()
export const arenaDuelSchema = z
  .object({ name: z.string().regex(/^[A-Za-z0-9_]{3,12}$/, 'There is no ninja with that name.') })
  .strict()
export const honorShopBuySchema = z.object({ itemId: z.string().regex(/^i\d+$/) }).strict()
export const honorExchangeSchema = z.object({ units: z.number().int().min(1).max(1000) }).strict()

export type ArenaFightInput = z.input<typeof arenaFightSchema>
export type ArenaRevengeInput = z.input<typeof arenaRevengeSchema>
export type ArenaDuelInput = z.input<typeof arenaDuelSchema>
export type HonorShopBuyInput = z.input<typeof honorShopBuySchema>
export type HonorExchangeInput = z.input<typeof honorExchangeSchema>

/** How a fighter is drawn: an outfit (players, the Referee) or arena NPC art by id. */
export type ArenaLook =
  | { clothing: number; weaponItemId?: string; wingSprite?: string; aura?: string }
  | { npcId: string }

export type ArenaSlotView =
  | { slot: number; beaten: boolean; kind: 'npc'; npcId: string; level: number; score: number }
  | {
      slot: number
      beaten: boolean
      kind: 'player'
      characterId: string
      name: string
      level: number
      clothing: number
      tier: number
      score: number
      place: number
    }
  | { slot: number; beaten: boolean; kind: 'referee'; place: number; score: number }

export interface ArenaView {
  tier: number
  /** Raw score; shown divided by 100. */
  score: number
  /** 0-based place in the arena list (tier 2+), null in the NPC phase. */
  place: number | null
  streak: number
  fights: number
  wins: number
  winRate: number
  honor: number
  /** Free tries left today and tries bought today (of maxBought). */
  freeTriesLeft: number
  triesBought: number
  maxBought: number
  /** Gold for the next fight (0 free), null when no try is left today. */
  tryGold: number | null
  /** When the next free list refresh is ready; null = ready now. */
  freeRefreshAt: string | null
  refreshGold: number
  /** The boss of the tier is open (score at the tier's end score). */
  bossReady: boolean
  bossNpcId: string | null
  /** Score needed for the boss, null on the top tier. */
  bossScore: number | null
  slots: ArenaSlotView[]
}

export type ArenaLogKind = 'attack' | 'revenge' | 'boss' | 'defense' | 'duel' | 'duel_defense'

export interface ArenaLogView {
  id: string
  kind: ArenaLogKind
  opponentName: string
  /** From this ninja's side: 0 loss, 1 win, 2 draw. */
  result: number
  scoreDelta: number
  honor: number
  streak: number
  createdAt: string
  /** A defence you lost against a ninja who is still in the arena. */
  canRevenge: boolean
}

/** The replay and how both sides are drawn (attacker first). */
export interface ArenaReplay<R = unknown> {
  replay: R
  looks: [ArenaLook, ArenaLook]
}

export interface ArenaFightResult<R = unknown> extends ArenaReplay<R> {
  won: boolean
  scoreDelta: number
  honor: number
  /** The new tier after a boss win. */
  promotedTo: number | null
  arena: ArenaView
  character: Character
}

export interface ArenaActionResult {
  arena: ArenaView
  character: Character
}

export interface DuelCandidate {
  name: string
  level: number
  clothing: number
  tier: number
  score: number
}

export interface DuelView {
  /** Your arena tier (duels need tier 2 on both sides). */
  tier: number
  duelsUsed: number
  freeDuels: number
  /** Gold for the next duel (0 free). */
  duelGold: number
  /** 6 random ninjas within ±30 places of you. */
  candidates: DuelCandidate[]
  /** Your friends at tier 2+. */
  friends: DuelCandidate[]
  logs: ArenaLogView[]
}

export interface DuelResult<R = unknown> extends ArenaReplay<R> {
  won: boolean
  duel: DuelView
  character: Character
}

export interface HonorShopOfferView {
  itemId: string
  honor: number
  minTier: number
}

export interface HonorShopView {
  tier: number
  honor: number
  offers: HonorShopOfferView[]
  /** HonorExp.ini at your tier: pay `honor`, gain `exp` per unit. */
  exchange: { honor: number; exp: number }
}

export interface HonorShopResult {
  shop: HonorShopView
  character: Character
  /** Honor exchange only. */
  levelsGained?: number
}
