// Pub fights in the neutral fields (J/CloneSceneModule/PubMonsterFightSystem.java): a line-up of
// three NPCs per scene, an hourly pull with combo rewards. No energy (decision 1).
import type { Random } from '../random.js'

export const PULL_COOLDOWN_MS = 3600 * 1000
export const PUB_FIGHT_MAX_PER_DAY = 999
const LINEUP_SIZE = 3

export interface RewardRule {
  MonsterConfig1: string
  MonsterConfig2: string
  MonsterConfig3?: string
  RewardGrade: number
}

/** First visit: three different NPCs from the scene's library. */
export function firstLineup(pool: string[], random: Random) {
  const left = [...pool]
  return Array.from(
    { length: Math.min(LINEUP_SIZE, pool.length) },
    () => left.splice(random.int(left.length), 1)[0]!,
  )
}

/** A pull: three NPCs, repeats allowed. */
export const pullLineup = (pool: string[], random: Random) =>
  Array.from({ length: LINEUP_SIZE }, () => pool[random.int(pool.length)]!)

const key = (ids: string[]) => [...ids].sort().join('|')

/** The reward rule id of a sorted 3-combo match, else of a 2-combo inside the line-up. */
export function comboRule(lineup: string[], rules: Record<string, RewardRule>) {
  const entries = Object.entries(rules).map(([id, rule]) => ({
    id,
    ids: [rule.MonsterConfig1, rule.MonsterConfig2, rule.MonsterConfig3].filter(
      (npc): npc is string => Boolean(npc),
    ),
  }))
  const three = key(lineup)
  const triple = entries.find((rule) => rule.ids.length === 3 && key(rule.ids) === three)
  if (triple) return triple.id
  const pairs = [
    [lineup[0]!, lineup[1]!],
    [lineup[0]!, lineup[2]!],
    [lineup[1]!, lineup[2]!],
  ].map(key)
  return entries.find((rule) => rule.ids.length === 2 && pairs.includes(key(rule.ids)))?.id ?? null
}

export const canPull = (pulledAt: Date | null, now: Date) =>
  !pulledAt || now.getTime() - pulledAt.getTime() >= PULL_COOLDOWN_MS
