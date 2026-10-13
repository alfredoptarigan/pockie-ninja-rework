// Demon City instances (/api/game/gates/*): solo toll gates with the card flip, crystal exchange,
// Las Noches manual mode and the neutral-field pub fights.
import { z } from 'zod'
import type { Character } from './game.js'

const cardIndex = z.number().int().min(0).max(4)
const currency = z.enum(['gold', 'giftCoupon']).default('gold')

export const enterGateSchema = z.object({ gateId: z.number().int().positive() }).strict()
export const cardPaySchema = z.object({ currency }).strict()
export const cardPeekSchema = z.object({ index: cardIndex, currency }).strict()
export const cardTakeSchema = z.object({ index: cardIndex }).strict()
export const gateExchangeSchema = z.object({ exchangeId: z.number().int().positive() }).strict()
export const lasNochesStartSchema = z.object({ mode: z.enum(['first', 'half']) }).strict()

export type EnterGateInput = z.input<typeof enterGateSchema>
export type CardPayInput = z.input<typeof cardPaySchema>
export type CardPeekInput = z.input<typeof cardPeekSchema>
export type CardTakeInput = z.input<typeof cardTakeSchema>
export type GateExchangeInput = z.input<typeof gateExchangeSchema>
export type LasNochesStartInput = z.input<typeof lasNochesStartSchema>

export type GateTier = 'tutorial' | 'hard' | 'normal' | 'pass'

export interface GateSummary {
  id: number
  nameKey: string
  bossNameKey: string
  tier: GateTier
  minLevel: number
  maxLevel: number
  subGates: number
  /** Consumed on entry, null = none. */
  itemId: string | null
}

export interface GateItem {
  itemId: string
  count: number
  bound: boolean
}

/** 0 no cards, 1 dealt face down, 2 all shown, 3 shuffled face down. */
export type CardFlipState = 0 | 1 | 2 | 3

export interface CardsView {
  state: CardFlipState
  /** Face-down cards are null. */
  cards: (GateItem | null)[]
  peeks: number
  /** Gold or Gift Coupons for the next peek, null when no peek is left. */
  peekCost: number | null
  showAllCost: number
  redealCost: number
}

export interface GateRunView {
  gateId: number
  subGate: number
  point: number
  /** Points per sub gate, in order. */
  points: number[]
  passedPoint: number | null
  cleared: boolean
  /** The three NPCs of the next point, null once cleared. */
  nextNpcIds: string[] | null
  cards: CardsView | null
}

export interface GateExchange {
  id: number
  srcItemId: string
  srcCount: number
  commonItemId: string | null
  destItemId: string
  destCount: number
}

export interface GatesView {
  triesLeft: number
  maxTries: number
  gates: GateSummary[]
  run: GateRunView | null
  exchanges: GateExchange[]
}

export interface GateRewards {
  exp: number
  stone: number
  items: { itemId: string; bound: boolean }[]
  levelsGained: number
  /** Drops that did not fit in a full bag. */
  lost?: number
}

/** A fight result; `replay` is a game-core Replay. */
export interface GateFightResult<R = unknown> {
  replay: R
  won: boolean
  npcIds: string[]
  rewards: GateRewards
  character: Character
}

export interface TollGateFightResult<R = unknown> extends GateFightResult<R> {
  /** null once the run ended (lost). */
  run: GateRunView | null
}

export interface CardTakeResult {
  card: GateItem | null
  /** Every card face up, in slot order. */
  cards: GateItem[]
  character: Character
}

export interface LasNochesView {
  bestFloor: number
  runsLeft: number
  maxRuns: number
  options: {
    first: { floor: number; stone: number }
    half: { floor: number; stone: number } | null
  }
  run: {
    floor: number
    pot: number
    lives: number
    livesBought: number
    nextNpcId: string
    lifePrice: number
  } | null
}

export interface LasNochesFightResult<R = unknown> extends GateFightResult<R> {
  /** EXP paid when the run ended with this fight, else null. */
  potPaid: number | null
  lasNoches: LasNochesView
}

export interface PubView {
  sceneId: number
  lineup: string[]
  fightsToday: number
  maxFights: number
  /** When the next pull is allowed, null = now. */
  nextPullAt: string | null
}

export interface PubPullResult {
  pub: PubView
  /** The matched combo's reward items (empty without a combo). */
  combo: { ruleId: string; grade: number; items: { itemId: string; bound: boolean }[] } | null
  character: Character
}

export interface PubFightResult<R = unknown> extends GateFightResult<R> {
  combo: PubPullResult['combo']
  pub: PubView
}
