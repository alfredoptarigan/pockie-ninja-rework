// Sannin Test rules: the six dice, Change Luck, Perfect, the claim reward, the title path's HP and
// the promotion examiner. Every number comes from SANNIN_PLACEHOLDERS.
import type { Bonuses, FighterInput, Random } from '@pockie/game-core'
import { SANNIN_RULES, type SanninPending } from '../../../../shared/src/schemas/sannin-test.js'
import { sumBonuses } from '../../game/nonfight-buffs.js'
import { bossFighter, type Boss } from '../dungeons/bosses.js'
import { SANNIN_PLACEHOLDERS as P } from './config.js'

const FIRE = 0
const face = (random: Random) => 1 + random.int(6)

export const ninjaCount = (dice: readonly number[]) =>
  dice.filter((value) => value === SANNIN_RULES.ninjaFace).length

export const pendingOf = (dice: readonly number[]): SanninPending => ({
  dice: [...dice],
  ninjaCount: ninjaCount(dice),
})

export const rollDice = (random: Random) =>
  Array.from({ length: SANNIN_RULES.dice }, () => face(random))

/** Change Luck: the Ninja dice stay, the others roll again. */
export const changeLuck = (dice: readonly number[], random: Random) =>
  dice.map((value) => (value === SANNIN_RULES.ninjaFace ? value : face(random)))

/** Perfect: all six dice become Ninja dice. */
export const perfectDice = () => Array<number>(SANNIN_RULES.dice).fill(SANNIN_RULES.ninjaFace)

export const rewardOf = (dice: readonly number[], level: number) => {
  const count = ninjaCount(dice)
  return { experience: P.expPerLevel[count]! * level, growthPoints: P.growthPoints[count]! }
}

export function examinerOf(targetRank: number): Boss {
  const examiner = P.examiners[(targetRank - 1) % P.examiners.length]!
  return {
    index: targetRank,
    name: examiner.name,
    build: examiner.build,
    pose: examiner.clothing,
    clothing: examiner.clothing,
    nation: FIRE,
    drops: [],
  }
}

export function examinerBonuses(targetRank: number): Partial<Bonuses> {
  const mul = P.examinerMul.start + P.examinerMul.step * (targetRank - 1)
  return { hpMul: mul, attackMul: mul }
}

/** The examiner of the battle into `targetRank`, scaled on the challenger's level and gear. */
export function examinerFighter(
  targetRank: number,
  level: number,
  gear: Partial<Bonuses>,
): FighterInput {
  return bossFighter(
    examinerOf(targetRank),
    Math.max(SANNIN_RULES.minLevel, level),
    sumBonuses(gear, examinerBonuses(targetRank)),
  )
}
