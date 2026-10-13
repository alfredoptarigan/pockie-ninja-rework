// Arena rules (docs/original-data/pvp-rankings.md 2-3; CompeteSystem, CompeteServer): Elo, the
// arena order, promotion, Honor, streaks, daily tries and costs. Pure; the server applies them.
import { refuse } from '../gates/errors.js'
import type { Random } from '../random.js'

/** compete.ini values used by the rules (decision 10: ported 1:1). */
export const ARENA_COSTS = {
  /** competemaxcount: free arena fights per UTC day. */
  freeTries: 20,
  /** onemoney: Gold per bought try. */
  tryGold: 8,
  /** competemaxcountGold: tries that can be bought per day. */
  maxBought: 15,
  /** competefriendfightcount: free Ninjutsu Duels per day. */
  freeDuels: 10,
  /** friendonemoney: Gold per duel after the free ones (no cap). */
  duelGold: 2,
  /** backmoney: Gold x revenges already used on that target today. */
  revengeGold: 10,
  /** refurbishtime (s) and refurbishmoney. */
  refreshSeconds: 3600,
  refreshGold: 20,
} as const

const K = 2000
const SCALE = 100000

/** E = 1 / (1 + 10^((S_defender - S_attacker) / 100000)). */
export const expectedScore = (attacker: number, defender: number) =>
  1 / (1 + 10 ** ((defender - attacker) / SCALE))

/**
 * Score change of the attacker (`W` 1 win, 0 loss, 0.5 draw), truncated toward zero; the defender
 * takes `-delta` (zero-sum). An opponent with score 0 (bosses, Fortune Cats) moves nothing.
 */
export function eloDelta(attacker: number, defender: number, w: number) {
  if (defender <= 0) return 0
  return Math.trunc(K * (w - expectedScore(attacker, defender)))
}

export interface ArenaOrderRow {
  characterId: string
  tier: number
  score: number
  /** When the score last changed. */
  scoreAt: Date
}

/**
 * The arena order: tier desc, score desc, then the earlier holder of the score, then the id. One
 * tie rule both ways (decision 12): whoever moves into a tie, from above or below, ranks below the
 * existing holders (the original placed a ninja moving down above them).
 */
export function compareArenaOrder(a: ArenaOrderRow, b: ArenaOrderRow) {
  return (
    b.tier - a.tier ||
    b.score - a.score ||
    a.scoreAt.getTime() - b.scoreAt.getTime() ||
    (a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0)
  )
}

/**
 * Score after a boss win: capped at beginscore(new tier) x 1.1, the domain rule (decision 12: the
 * game server's endscore(old) x 1.1 cap is dropped).
 */
export const promotionScore = (score: number, newBeginScore: number) =>
  Math.min(score, Math.trunc(newBeginScore * 1.1))

/** Honor for an arena fight, win or loss: the attacker's tier Honor, +1 on a revenge. */
export const fightHonor = (tierHonor: number, revenge: boolean) => tierHonor + (revenge ? 1 : 0)

export interface FightRecord {
  streak: number
  fights: number
  wins: number
}

/** m_LastWin: the winner (attacker or defender) +1, the loser 0; fights and wins for the rate. */
export const recordResult = (stats: FightRecord, won: boolean): FightRecord => ({
  streak: won ? stats.streak + 1 : 0,
  fights: stats.fights + 1,
  wins: stats.wins + (won ? 1 : 0),
})

export const winRate = (wins: number, fights: number) =>
  fights > 0 ? Math.floor((wins * 100) / fights) : 0

export interface DailyCounters {
  day: string | null
  triesUsed: number
  triesBought: number
  duelsUsed: number
}

/** All daily counters reset together on a new UTC day (the original reset bought tries on login). */
export const dailyCounters = (row: DailyCounters, today: string): DailyCounters =>
  row.day === today ? { ...row } : { day: today, triesUsed: 0, triesBought: 0, duelsUsed: 0 }

/** Uses one arena try: free while free tries are left, then a bought one for 8 Gold. */
export function takeTry(counters: DailyCounters) {
  if (counters.triesUsed < ARENA_COSTS.freeTries)
    return { gold: 0, counters: { ...counters, triesUsed: counters.triesUsed + 1 } }
  if (counters.triesBought >= ARENA_COSTS.maxBought)
    refuse('no_tries', 'You have no arena challenges left today.')
  return {
    gold: ARENA_COSTS.tryGold,
    counters: { ...counters, triesBought: counters.triesBought + 1 },
  }
}

/** Gold for the next try, or null when none is left today. */
export function nextTryGold(counters: DailyCounters) {
  if (counters.triesUsed < ARENA_COSTS.freeTries) return 0
  return counters.triesBought < ARENA_COSTS.maxBought ? ARENA_COSTS.tryGold : null
}

export const duelCost = (duelsUsed: number) =>
  duelsUsed < ARENA_COSTS.freeDuels ? 0 : ARENA_COSTS.duelGold

/** Revenge on the same target: free the first time a day, then 10 Gold x times already used. */
export const revengeGold = (usedToday: number) => ARENA_COSTS.revengeGold * usedToday

export const freeRefreshReady = (lastFree: Date | null, now: Date) =>
  !lastFree || now.getTime() - lastFree.getTime() >= ARENA_COSTS.refreshSeconds * 1000

/** HonorExp.ini: `units` exchanges at the tier's rate. */
export const honorExchange = (rate: { honor: number; exp: number }, units: number) => ({
  honor: rate.honor * units,
  exp: rate.exp * units,
})

export interface HonorShopWeights {
  c1: number
  c2: number
  c3: number
  c4: number
}

/** Identified property count (1-4) of an Honor shop item, by the c1-c4 weights. */
export function pickIdentifyCount(offer: HonorShopWeights, random: Random) {
  const weights = [offer.c1, offer.c2, offer.c3, offer.c4]
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return 1
  let roll = random.int(total)
  for (const [i, weight] of weights.entries()) {
    if (roll < weight) return i + 1
    roll -= weight
  }
  return 1
}
