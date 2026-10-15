// PLACEHOLDERS: Reborn keeps the Sannin Test's daily dice, free changes, rewards, title path and
// examiner on its server (its client only reads them: main.js @3503000-3511400). These are ours
// until the user confirms them. Reborn's own client rules are SANNIN_RULES
// (shared/src/schemas/sannin-test.ts).
import type { SanninRankBonus } from '../../../../shared/src/schemas/sannin-test.js'
import type { BuildName } from '../dungeons/bosses.js'

export const SANNIN_PLACEHOLDERS = {
  /** Dice rolls a day (reset at 00:00 UTC). */
  dicePerDay: 10,
  /** Free Change Luck uses a day. */
  freeChangesPerDay: 3,
  /** Gold to turn five Ninja dice into six (Reborn's client falls back to 100). */
  makeSixCost: 100,
  /** Growing Points by Ninja dice count 0-6. */
  growthPoints: [1, 2, 4, 7, 12, 20, 40],
  /** EXP per character level by Ninja dice count 0-6 (level 60: 1,200-60,000). */
  expPerLevel: [20, 40, 70, 120, 200, 400, 1000],
  /**
   * The title path: index = rank. Reborn shows "Rank r of N", the next rank's Growing Points and
   * its permanent HP; N and the numbers are server-side.
   */
  rankBonuses: [
    { requiredPoints: 0, hp: 0 },
    { requiredPoints: 30, hp: 200 },
    { requiredPoints: 60, hp: 400 },
    { requiredPoints: 100, hp: 650 },
    { requiredPoints: 150, hp: 900 },
    { requiredPoints: 220, hp: 1200 },
    { requiredPoints: 300, hp: 1500 },
    { requiredPoints: 400, hp: 1850 },
    { requiredPoints: 520, hp: 2200 },
    { requiredPoints: 660, hp: 2600 },
    { requiredPoints: 820, hp: 3000 },
  ] satisfies SanninRankBonus[],
  /**
   * The examiner of the battle into rank r: the three Sannin outfits in turn (our clothing 51
   * Orochimaru, 57 Jiraiya, 72 Tsunade) with a Scroll Dungeons build, at the challenger's level
   * (at least 60), with the challenger's gear (armed like a dungeon boss) and per mille hpMul /
   * attackMul of `start + step * (r - 1)`. Tuned by
   * simulation (rules.test.ts): an equally geared level-60 ninja with no learned skills wins the
   * first promotion about 9 in 10 times and the last about 1 in 5.
   */
  examiners: [
    { name: 'Orochimaru', clothing: 51, build: 'Bloodluster' },
    { name: 'Jiraiya', clothing: 57, build: 'Punisher' },
    { name: 'Tsunade', clothing: 72, build: 'Tank' },
  ] satisfies { name: string; clothing: number; build: BuildName }[],
  examinerMul: { start: -100, step: 20 },
} as const
