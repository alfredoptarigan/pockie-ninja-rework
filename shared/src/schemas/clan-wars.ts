// Reborn's Clan Wars (`Wu` @2767162, reborn-windows-A-L.md "Clan Wars"; the Info tab's rules
// @2776000): every member saves one equipment set as a Clan War fighter; the leader attacks a rival
// clan directly (once per rival per day, 5v5 to 20v20); the rosters' strongest fighters fight
// paired 1v1 duels (#1 vs #1, ...) and the clan with more duel wins takes the war. Async: the
// whole war is fought on the server when the leader confirms. Routes: /api/game/clan-events/wars.
import { z } from 'zod'
import type { Character } from './game.js'

export const CLAN_WAR_SIZES = [5, 10, 15, 20] as const
export type ClanWarSize = (typeof CLAN_WAR_SIZES)[number]

/** Reborn's Info tab numbers. */
export const CLAN_WAR_RULES = {
  /** Per knockout at a 100% rate: GC into clan storage and Clan EXP. */
  gcPerKnockout: 400,
  expPerKnockout: 500,
  /** The winning fighter, always (not scaled). */
  bankaiCoinsPerWin: 5_000,
  /** Within this BP difference the rate is 100%; it never leaves 35-150%. */
  evenBand: 10,
  minRate: 35,
  maxRate: 150,
  /** War winner only, at the matchup rate: 100,000 Stones and 1,000 GC into clan storage. */
  stoneBonus: 100_000,
  stoneBonusChance: 10,
  giftCertificateBonus: 1_000,
  giftCertificateBonusChance: 5,
  /** Weekly Top 3: Clan Boss Free Entries (our clan counter in Clan Missions). */
  weeklyFreeEntries: [3, 1, 1],
} as const

/**
 * PLACEHOLDERS: how fast the rate moves outside the even band ("smoothly" in Reborn's text):
 * percent of reward per percent of BP difference. The personal item package (Gold Equipment Gift
 * Box, Souls Chests) and the 2nd place's 20 Demon Boss Tickets are not paid: our mail has no
 * attachments and those items are not in our data.
 */
export const CLAN_WAR_PLACEHOLDERS = { slopeWeaker: 1, slopeStronger: 1 } as const

/**
 * The reward rate (percent) of a side with roster BP `own` against `rival`: 100 within +-10%,
 * then down to 35 against weaker rosters and up to 150 against stronger ones.
 */
export function clanWarRate(own: number, rival: number) {
  const { evenBand, minRate, maxRate } = CLAN_WAR_RULES
  const difference = differencePercent(own, rival)
  if (Math.abs(difference) <= evenBand) return 100
  if (difference < 0)
    return Math.max(
      minRate,
      Math.round(100 + (difference + evenBand) * CLAN_WAR_PLACEHOLDERS.slopeWeaker),
    )
  return Math.min(
    maxRate,
    Math.round(100 + (difference - evenBand) * CLAN_WAR_PLACEHOLDERS.slopeStronger),
  )
}

/** How much stronger (+) or weaker (-) the rival roster is, in whole percents. */
export const differencePercent = (own: number, rival: number) =>
  own <= 0 ? 0 : Math.round(((rival - own) * 100) / own)

export const clanWarAttackSchema = z
  .object({
    targetClanId: z.uuid(),
    size: z.literal(CLAN_WAR_SIZES),
  })
  .strict()
export type ClanWarAttackInput = z.input<typeof clanWarAttackSchema>

export const clanWarFighterSchema = z.object({ set: z.number().int().min(1).max(5) }).strict()
export type ClanWarFighterInput = z.input<typeof clanWarFighterSchema>

export interface ClanWarFighterView {
  characterId: string
  name: string
  level: number
  clothing: number
  power: number
  set: number
}

export interface ClanWarMatchup {
  available: boolean
  ownPower: number
  targetPower: number
  differencePercent: number
  rewardPercent: number
  defenderRewardPercent: number
  gcPerKnockout: number
  expPerKnockout: number
  stoneBonusChancePercent: number
  giftCertificateBonusChancePercent: number
}

export interface ClanWarTarget {
  clanId: string
  clanName: string
  level: number
  wins: number
  losses: number
  registeredFighters: number
  totalRegisteredPower: number
  attackedToday: boolean
  roster: ClanWarFighterView[]
  matchups: Record<ClanWarSize, ClanWarMatchup>
}

export interface ClanWarStanding {
  rank: number
  clanId: string
  clanName: string
  wins: number
  losses: number
  knockouts: number
  defeatedPower: number
}

export interface ClanWarSide {
  clanId: string
  clanName: string
  knockouts: number
  power: number
  rewardPercent: number
  gcReward: number
  expReward: number
  stoneBonus: number
  giftCertificateBonus: number
}

export interface ClanWarDuel {
  attacker: { name: string; power: number }
  defender: { name: string; power: number }
  /** 'none': both fell. */
  winner: 'attacker' | 'defender' | 'none'
}

export interface ClanWarHistoryView {
  warId: string
  size: number
  endedAt: string
  /** null: a draw. */
  winner: string | null
  myClan: ClanWarSide
  enemyClan: ClanWarSide
  duels: ClanWarDuel[]
}

export interface ClanWarStatus {
  myClan: {
    clanId: string
    clanName: string
    registeredFighters: number
    roster: ClanWarFighterView[]
  }
  fighter: ClanWarFighterView | null
  canStartWar: boolean
  /** Rivals this clan has not attacked today. */
  attacksRemaining: number
  nextDailyReset: string
  sizes: readonly ClanWarSize[]
  targets: ClanWarTarget[]
  weekly: { endsAt: string; standings: ClanWarStanding[] }
  monthly: { endsAt: string; standings: ClanWarStanding[] }
  history: ClanWarHistoryView[]
}

export interface ClanWarFighterResult {
  status: ClanWarStatus
  character: Character
}

export interface ClanWarAttackResult {
  war: ClanWarHistoryView
  status: ClanWarStatus
  character: Character
}
