// English labels for the arena (pvp-rankings.md 2.1 tier names, 2.7 log types).
import { plainText } from '../text'
import data from '../world-data.json'
import type { ArenaLogKind, ArenaSlotView } from '../../../../shared/src/schemas/arena'

/** competerank.ini tiers 0-21, under Reborn's names (rank__1-22, the Stats window's Rank). */
const TIER_NAMES = [
  'Prep I',
  'Prep II',
  'Prep III',
  'Prep IV',
  'Prep V',
  'Pre-Academy',
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
  'Jonin I',
  'Jonin II',
  'Jonin III',
  'Anbu',
  'Sannin',
  'Kage',
]

/** Duels need this tier on both sides (Prep III). */
export const DUEL_TIER = 2

export const tierName = (tier: number) => TIER_NAMES[tier] ?? `Rank ${tier + 1}`

/** Raw scores are shown divided by 100 ("935.00"). */
export const score = (raw: number) => (raw / 100).toFixed(2)
export const signedScore = (raw: number) => `${raw >= 0 ? '+' : ''}${score(raw)}`

// Arena fighter ids (n401001) differ from their name keys (name_n401001, name_n31017).
const arenaNpcNames = data.arenaNpcNames as Record<string, string>
export const npcName = (npcId: string) =>
  plainText(arenaNpcNames[npcId] ?? `lg_name_${npcId}`, 'Arena Fighter')

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
