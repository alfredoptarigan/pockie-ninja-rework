// Hashirama vs Madara rules: the event phase, the payout when the battle is counted, the leaders as
// fighters and the Fortune Wheel (selection, slices and the spin roll).
import type { Bonuses, FighterInput, Random } from '@pockie/game-core'
import type {
  FortuneReward,
  FortuneSegment,
  HashiramaEventView,
  HashiramaSide,
  HashiramaWinner,
} from '../../../../shared/src/schemas/hashirama.js'
import { sumBonuses } from '../../game/nonfight-buffs.js'
import { bossFighter } from '../dungeons/bosses.js'
import { HASHIRAMA_PLACEHOLDERS as P, type Leader, type WheelReward } from './config.js'

export interface EventTimes {
  endsAt: Date
  closesAt: Date
  settled: boolean
  winner: HashiramaWinner | null
}

/** Running until endsAt; counting until settled; finished (spins spendable) until closesAt. */
export function phase(event: EventTimes, now: Date): HashiramaEventView['phase'] {
  if (now < event.endsAt) return 'running'
  if (!event.settled) return 'counting'
  return now < event.closesAt ? 'finished' : 'closed'
}

export function eventView(event: EventTimes, now: Date): HashiramaEventView {
  const current = phase(event, now)
  return {
    running: current === 'running',
    finished: event.settled,
    phase: current,
    endsAt: event.endsAt.toISOString(),
    closesAt: event.closesAt.toISOString(),
    winner: event.winner,
  }
}

export const opponentOf = (side: HashiramaSide): HashiramaSide =>
  side === 'madara' ? 'hashirama' : 'madara'

export function winnerOf(totals: Record<HashiramaSide, number>): HashiramaWinner {
  if (totals.madara === 0 && totals.hashirama === 0) return 'none'
  if (totals.madara === totals.hashirama) return 'tie'
  return totals.madara > totals.hashirama ? 'madara' : 'hashirama'
}

export interface Fighter {
  characterId: string
  side: HashiramaSide
  damage: number
}

/**
 * Spins per ninja: everyone with damage on a winning side (a tie: both) gets winnerSpins, and the
 * top 3 by damage of each side add topSpins[rank]. Ninjas who dealt no damage get nothing.
 */
export function payouts(fighters: Fighter[], winner: HashiramaWinner) {
  const { winnerSpins, topSpins } = P.rewards
  const spins = new Map<string, number>()
  const add = (id: string, amount: number) => spins.set(id, (spins.get(id) ?? 0) + amount)
  for (const side of ['madara', 'hashirama'] as const) {
    const ranked = fighters
      .filter((f) => f.side === side && f.damage > 0)
      .sort((a, b) => b.damage - a.damage)
    const won = winner === side || winner === 'tie'
    ranked.forEach((fighter, rank) => {
      if (won) add(fighter.characterId, winnerSpins)
      if (rank < topSpins.length) add(fighter.characterId, topSpins[rank]!)
    })
  }
  return spins
}

const leaderBonuses: Partial<Bonuses> = P.leaderStatMul

export const leaderOf = (side: HashiramaSide): Leader => P.leaders[side]

/** The leader `side` at the challenger's level and gear, made tough by leaderStatMul. */
export function leaderFighter(
  side: HashiramaSide,
  level: number,
  gear: Partial<Bonuses>,
): FighterInput {
  const leader = leaderOf(side)
  return bossFighter(
    {
      index: -1,
      name: leader.name,
      build: leader.build,
      pose: leader.pose,
      clothing: leader.clothing,
      nation: leader.nation,
      drops: leader.skills.map((skill) => ({ name: '', skill })),
    },
    level,
    sumBonuses(gear, leaderBonuses),
  )
}

// Fortune Wheel --------------------------------------------------------------------------------

const W = P.wheel
const POOL_REWARDS: WheelReward[] = W.pools.flatMap((pool) => [...pool.rewards])
const UNIQUE = new Set<string>(
  W.pools.filter((pool) => pool.unique).flatMap((pool) => pool.rewards.map((r) => r.id)),
)

export const grandReward = (side: HashiramaSide | null): WheelReward => W.grand[side ?? 'hashirama']

export const poolReward = (id: string) => POOL_REWARDS.find((reward) => reward.id === id)

const atLimit = (reward: WheelReward, won: Record<string, number>) =>
  reward.max !== null && (won[reward.id] ?? 0) >= reward.max

export function toFortuneReward(reward: WheelReward, won: Record<string, number>): FortuneReward {
  return {
    id: reward.id,
    ...(reward.itemId && { itemId: reward.itemId }),
    kind: reward.kind,
    amount: reward.amount,
    rarity: reward.rarity,
    limit: reward.max === null ? null : { won: won[reward.id] ?? 0, max: reward.max },
  }
}

/** Why a selection is refused, or null: known, distinct, not at its limit, one Unique at most. */
export function selectionError(selection: (string | null)[], won: Record<string, number>) {
  const ids = selection.filter((id): id is string => id !== null)
  if (new Set(ids).size !== ids.length) return 'Choose three different rewards before spinning.'
  for (const id of ids) {
    const reward = poolReward(id)
    if (!reward) return 'That reward is not on this wheel.'
    if (atLimit(reward, won)) return 'You already won that reward as often as allowed.'
  }
  if (ids.filter((id) => UNIQUE.has(id)).length > 1)
    return 'You can only put one Unique reward on the wheel at a time.'
  return null
}

/** Slice order: choice, mystery, choice, mystery, grand, mystery, choice, mystery. */
const LAYOUT = ['choice', 'mystery', 'choice', 'mystery', 'grand', 'mystery', 'choice', 'mystery']

/** The wheel's slices with their chances in percent (they add up to 100). */
export function segments(
  selection: (string | null)[],
  side: HashiramaSide | null,
  won: Record<string, number>,
): FortuneSegment[] {
  const grand = grandReward(side)
  const grandChance = atLimit(grand, won) ? 0 : W.grandChance
  const choices = selection.map((id) => (id ? poolReward(id) : undefined) ?? null)
  const choiceTotal = choices.reduce((sum, r) => sum + (r ? W.choiceChance[r.rarity] : 0), 0)
  const mysteryCount = LAYOUT.filter((kind) => kind === 'mystery').length
  const mysteryChance = (100 - grandChance - choiceTotal) / mysteryCount
  let next = 0
  return LAYOUT.map((kind) => {
    if (kind === 'grand')
      return { kind: 'grand', reward: toFortuneReward(grand, won), chance: grandChance }
    if (kind === 'mystery') return { kind: 'mystery', reward: null, chance: mysteryChance }
    const reward = choices[next++] ?? null
    return {
      kind: 'choice',
      reward: reward && toFortuneReward(reward, won),
      chance: reward ? W.choiceChance[reward.rarity] : 0,
    }
  })
}

/** The landing slice for a roll in [0, 1). */
export function landing(slices: FortuneSegment[], roll: number) {
  let left = roll * 100
  for (const [index, slice] of slices.entries()) {
    if (slice.chance <= 0) continue
    if (left < slice.chance) return index
    left -= slice.chance
  }
  return slices.findLastIndex((slice) => slice.chance > 0)
}

export const mysteryRewards = (): WheelReward[] => [...W.mystery]
export const mysteryReward = (id: string) => W.mystery.find((reward) => reward.id === id)

/** Spins the wheel: the landing slice and the reward it gives (a mystery slice picks evenly). */
export function spin(slices: FortuneSegment[], random: Random) {
  const winningIndex = landing(slices, random.next())
  const slice = slices[winningIndex]!
  const reward: WheelReward =
    slice.kind === 'mystery'
      ? W.mystery[random.int(W.mystery.length)]!
      : slice.kind === 'grand'
        ? Object.values(W.grand).find((r) => r.id === slice.reward!.id)!
        : poolReward(slice.reward!.id)!
  return { winningIndex, reward }
}

/** Every reward a spin could give with this selection (to check the bag first). */
export function possibleRewards(selection: (string | null)[], side: HashiramaSide | null) {
  return [
    grandReward(side),
    ...W.mystery,
    ...selection.flatMap((id) => (id ? [poolReward(id)!] : [])),
  ]
}
