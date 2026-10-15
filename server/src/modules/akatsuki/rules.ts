// Akatsuki hunt rules: who hunts the ninja, member statuses, the ambush roll with bait and the
// pair as fighters.
import type { Bonuses, FighterInput } from '@pockie/game-core'
import {
  AKATSUKI_MEMBERS,
  AKATSUKI_RULES,
  type AkatsukiMember,
  type AkatsukiPair,
  type AkatsukiPairKey,
  type AkatsukiStatus,
} from '../../../../shared/src/schemas/akatsuki.js'
import { sumBonuses } from '../../game/nonfight-buffs.js'
import { bossFighter, type Boss } from '../dungeons/bosses.js'
import { AKATSUKI_PLACEHOLDERS as P, pairBonuses, type MemberBuild } from './config.js'

export const PAIRS: AkatsukiPair[] = P.pairs.map((pair) => ({
  key: pair.key,
  members: [...pair.members],
}))
export const pairIndex = (key: AkatsukiPairKey) => PAIRS.findIndex((pair) => pair.key === key)

const MEMBERS: Partial<Record<AkatsukiMember, MemberBuild>> = P.members
export const memberBuild = (member: AkatsukiMember) => MEMBERS[member]

/** The pair hunting a ninja who beat `pairsDefeated` pairs, null when all are beaten. */
export const huntingPair = (pairsDefeated: number) => PAIRS[pairsDefeated] ?? null

/** Each member's status; Zetsu (informant) and Obito (watcher) have none. */
export function memberStatuses(pairsDefeated: number) {
  const statuses: Partial<Record<AkatsukiMember, AkatsukiStatus>> = {}
  for (const member of AKATSUKI_MEMBERS) {
    const index = PAIRS.findIndex((pair) => pair.members.includes(member))
    if (index < 0) continue
    statuses[member] =
      index < pairsDefeated ? 'defeated' : index === pairsDefeated ? 'revealed' : 'locked'
  }
  return statuses
}

export const baitActive = (until: Date | null, now: Date) => until !== null && until > now

/** Ambush chance per won field fight, in percent: doubled while the bait is active. */
export const ambushChance = (baitUntil: Date | null, now: Date) =>
  P.ambushChancePercent * (baitActive(baitUntil, now) ? AKATSUKI_RULES.baitMultiplier : 1)

/** Whether a won field fight springs the ambush (`roll` in [0, 1)). */
export const springs = (roll: number, chancePercent: number) => roll * 100 < chancePercent

/** A member as a dungeon-style boss: their outfit, build, village and scroll skills. */
export function memberBoss(member: AkatsukiMember): Boss {
  const build = memberBuild(member)
  if (!build) throw new Error(`${member} does not fight`)
  return {
    index: -1,
    name: build.name,
    build: build.build,
    pose: build.clothing,
    clothing: build.clothing,
    nation: build.nation,
    drops: build.skills.map((skill) => ({ name: '', skill })),
  }
}

/** The pair at `level`, scaled on the challenger's gear and the pair's own stat step. */
export function pairFighters(
  key: AkatsukiPairKey,
  level: number,
  gear: Partial<Bonuses>,
): FighterInput[] {
  const index = pairIndex(key)
  const bonuses = sumBonuses(gear, pairBonuses(index))
  return PAIRS[index]!.members.map((member) => bossFighter(memberBoss(member), level, bonuses))
}
