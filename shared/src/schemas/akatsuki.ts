// Akatsuki Invasion (Reborn scene 9400, main.js `tj` and the ambush overlay): GET /api/game/akatsuki
// and its actions. Four Akatsuki pairs hunt the ninja one after another: every won field fight
// may spring the hunting pair's ambush; beating a pair lets the ninja claim each member's red
// outfit. Zetsu (the informant) sells the ninja out as bait once a day.
import { z } from 'zod'
import type { Character } from './game.js'

/** Reborn's ten members in its scene order (`$w`); Zetsu and Obito never fight. */
export const AKATSUKI_MEMBERS = [
  'pain',
  'deidara',
  'konan',
  'itachi',
  'zetsu',
  'obito',
  'kisame',
  'kakuzu',
  'hidan',
  'sasori',
] as const
export type AkatsukiMember = (typeof AKATSUKI_MEMBERS)[number]

/** Reborn's client rules: 4 pairs, bait doubles the ambush chance for 1 hour, once a day. */
export const AKATSUKI_RULES = {
  pairCount: 4,
  baitMultiplier: 2,
  baitHours: 1,
} as const

/** The four pair keys (our pairing; Reborn sends its pairs from the server). */
export const AKATSUKI_PAIRS = ['clay', 'ritual', 'crows', 'paper'] as const
export type AkatsukiPairKey = (typeof AKATSUKI_PAIRS)[number]

/** Reborn's `data-status`: not met yet, hunting the ninja, or beaten. */
export type AkatsukiStatus = 'locked' | 'revealed' | 'defeated'

export interface AkatsukiPair {
  key: AkatsukiPairKey
  members: [AkatsukiMember, AkatsukiMember]
}

export interface AkatsukiView {
  /** False while the hunt is closed (Reborn: "The hunt is not active."). */
  enabled: boolean
  minLevel: number
  pairs: AkatsukiPair[]
  members: Partial<Record<AkatsukiMember, AkatsukiStatus>>
  pairsDefeated: number
  /** The pair hunting the ninja, null when none is (all beaten or under the level). */
  hunting: AkatsukiPairKey | null
  /** The pair whose ambush sprang and still waits to be fought ("Face them now"). */
  pendingAmbush: AkatsukiPairKey | null
  ambushChancePercent: number
  bait: { activeUntil: string | null; usedToday: boolean }
  /** Members whose red outfit was claimed. */
  claimed: AkatsukiMember[]
  /** Each fighting member's red outfit (our item id). */
  redOutfits: Partial<Record<AkatsukiMember, string>>
}

/** Sent with a won field fight when the hunting pair strikes (Reborn `fight.akatsukiAmbush`). */
export interface AkatsukiAmbush {
  pair: AkatsukiPairKey
  members: [AkatsukiMember, AkatsukiMember]
}

export const akatsukiRematchSchema = z.object({ pair: z.enum(AKATSUKI_PAIRS) }).strict()
export const akatsukiClaimSchema = z.object({ member: z.enum(AKATSUKI_MEMBERS) }).strict()

export interface AkatsukiFightResult<R = unknown> {
  replay: R
  won: boolean
  pair: AkatsukiPairKey
  /** How each member is drawn in the replay (their outfit). */
  looks: { clothing: number }[]
  akatsuki: AkatsukiView
  character: Character
}

export interface AkatsukiClaimResult {
  itemId: string
  akatsuki: AkatsukiView
  character: Character
}
