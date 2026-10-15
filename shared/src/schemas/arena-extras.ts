// Arena extras (/api/game/arena/*): Buy Tickets, Arena / Squad Arena Weekly Rewards, Squad Arena
// 3v3 and the Championship (Reborn scenes 2, 6001 and 6002).
import { z } from 'zod'
import type { ArenaLook, ArenaReplay } from './arena.js'
import type { Character } from './game.js'

export const LADDERS = ['arena', 'squad'] as const
export type Ladder = (typeof LADDERS)[number]
export const ladderSchema = z.object({ kind: z.enum(LADDERS) }).strict()

export const buyTicketsSchema = z.object({ amount: z.number().int().min(1).max(20) }).strict()

/** Weekly Rewards tooltip lines (spec). */
export const WEEKLY_HOURLY_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2] as const

export interface WeeklyRewardView {
  /** 1-10, then 50 for ranks 11-50. */
  place: number
  /** Honor on the arena ladder, Team Coins on the squad ladder. */
  medals: number
  giftCoupons: number
  gold: number
  items: string[]
}

export interface WeeklyStanding {
  rank: number
  characterId: string
  name: string
  points: number
}

export interface WeeklyView {
  kind: Ladder
  /** Monday (UTC): the window shows last week's standings. */
  isMonday: boolean
  /** The UTC Monday of the standings shown, and of this week. */
  week: string
  currentWeek: string
  userRank: number | null
  userPoints: number
  leaderboard: WeeklyStanding[]
  rewards: WeeklyRewardView[]
  /** Next Monday 00:00 UTC. */
  resetAt: string
  /** Last week's reward: your rank, claimed or not, claimable until `closesAt`. */
  claim: { week: string; rank: number | null; claimed: boolean; closesAt: string }
  canClaim: boolean
}

export interface WeeklyClaimResult {
  weekly: WeeklyView
  reward: WeeklyRewardView
  character: Character
}

export interface CoinOfferView {
  id: string
  itemId: string
  amount: number
  price: number
}

export const coinShopBuySchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,32}$/) }).strict()

// Squad Arena 3v3

export const MAIN_STATS = ['STR', 'AGI', 'STA'] as const
export type MainStat = (typeof MAIN_STATS)[number]

export const squadLoadoutsSchema = z
  .object({ loadouts: z.array(z.number().int().min(1).max(5)).length(3) })
  .strict()
export const squadFightSchema = z.object({ index: z.number().int().min(0).max(17) }).strict()

export interface SquadLoadoutView {
  set: number
  /** The main stat of the set's outfit, null without an outfit. */
  mainStat: MainStat | null
  clothing: number | null
  /** Sets IV-V need VIP. */
  vipLocked: boolean
}

export interface SquadOpponentView {
  index: number
  characterId: string
  name: string
  level: number
  clothing: number
  score: number
  won: boolean
}

export interface SquadHistoryView {
  name: string
  scoreDelta: number
  challenged: boolean
  won: boolean
  at: string
}

export interface SquadLeaderView {
  rank: number
  characterId: string
  name: string
  score: number
}

export interface SquadView {
  minLevel: number
  level: number
  /** Raw score; shown divided by 100. */
  score: number
  /** 1-based place among valid squads, null without a squad. */
  rank: number | null
  fights: number
  wins: number
  freeTickets: number
  boughtTickets: number
  teamCoins: number
  loadouts: SquadLoadoutView[]
  /** The saved squad (sets, fight order), empty until confirmed. */
  selected: number[]
  squadValid: boolean
  opponents: SquadOpponentView[]
  history: SquadHistoryView[]
  leaderboard: SquadLeaderView[]
  shop: CoinOfferView[]
  rewards: {
    teamCoinsPerMatch: number
    giftCouponChance: number
    giftCoupons: number
    rankMultiplier: number
  }
}

export interface SquadActionResult {
  squad: SquadView
  character: Character
}

export interface SquadRound<R = unknown> extends ArenaReplay<R> {
  won: boolean
  /** Your set and the opponent's set. */
  sets: [number, number]
}

export interface SquadFightResult<R = unknown> extends SquadActionResult {
  rounds: SquadRound<R>[]
  won: boolean
  scoreDelta: number
  teamCoins: number
  giftCoupons: number
}

// Championship

export const CHAMPIONSHIP_PHASES = ['registration', 'battling', 'cooldown'] as const
export type ChampionshipPhase = (typeof CHAMPIONSHIP_PHASES)[number]

export const championshipEnterSchema = z.object({ slot: z.number().int().min(0).max(15) }).strict()
export const championshipMatchParamsSchema = z
  .object({
    round: z.coerce.number().int().min(1).max(4),
    match: z.coerce.number().int().min(0).max(7),
  })
  .strict()

export interface ChampionshipSlotView {
  slot: number
  characterId: string
  name: string
  level: number
  clothing: number
}

export interface ChampionshipMatchView {
  round: number
  matchIndex: number
  /** Slots fighting (-1 = not decided yet); an empty slot has no entry in `slots`. */
  slot1: number
  slot2: number
  /** The winning slot once fought (-1 when both sides were empty), null while pending. */
  winnerSlot: number | null
  scheduledAt: string
  hasReplay: boolean
}

export interface ChampionshipChallengeView {
  challengerName: string
  defenderName: string
  won: boolean
  createdAt: string
}

export interface ChampionshipView {
  phase: ChampionshipPhase
  registrationEndsAt: string
  battlingEndsAt: string
  cooldownEndsAt: string
  minLevel: number
  /** 16 entries, null for an empty slot. */
  slots: (ChampionshipSlotView | null)[]
  mySlot: number | null
  matches: ChampionshipMatchView[]
  challenges: ChampionshipChallengeView[]
  champion: string | null
  lastChampion: string | null
  heroCoins: number
  wins: number
  losses: number
  top3: number
  rewards: { round: number; heroCoins: number }[]
  shop: CoinOfferView[]
}

export interface ChampionshipActionResult {
  championship: ChampionshipView
  character: Character
}

export interface ChampionshipChallengeResult<R = unknown> extends ChampionshipActionResult {
  fight: ArenaReplay<R> & { won: boolean }
}

export type { ArenaLook }
