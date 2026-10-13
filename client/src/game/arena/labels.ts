// English labels for the arena (pvp-rankings.md 2.1 tier names, 2.7 log types).
import { plainText } from '../text'
import type { ArenaLogKind, ArenaSlotView } from '../../../../shared/src/schemas/arena'

/** competerank.ini tiers 0-21 (client TipRank_1-22). */
const TIER_NAMES = [
  'Beginner I',
  'Beginner II',
  'Beginner III',
  'Beginner IV',
  'Beginner V',
  'Transition',
  'Academy I',
  'Academy II',
  'Academy III',
  'Genin I',
  'Genin II',
  'Genin III',
  'Chunin I',
  'Chunin II',
  'Chunin III',
  'Chunin IV',
  'Jounin I',
  'Jounin II',
  'Jounin III',
  'ANBU',
  'Sannin',
  'Kage',
]

/** Duels need this tier on both sides (Beginner III). */
export const DUEL_TIER = 2

export const tierName = (tier: number) => TIER_NAMES[tier] ?? `Rank ${tier + 1}`

/** Raw scores are shown divided by 100 ("935.00"). */
export const score = (raw: number) => (raw / 100).toFixed(2)
export const signedScore = (raw: number) => `${raw >= 0 ? '+' : ''}${score(raw)}`

export const npcName = (npcId: string) => plainText(`lg_name_${npcId}`, 'Arena Fighter')

export function slotName(slot: ArenaSlotView) {
  if (slot.kind === 'player') return slot.name
  if (slot.kind === 'referee') return 'Referee'
  return npcName(slot.npcId)
}

export const LOG_KIND: Record<ArenaLogKind, string> = {
  attack: 'Attack',
  revenge: 'Revenge',
  boss: 'Boss',
  defense: 'Defense',
  duel: 'Duel',
  duel_defense: 'Duel defense',
}

export const RESULT = ['Loss', 'Win', 'Draw'] as const
