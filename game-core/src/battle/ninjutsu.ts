import scrolls from '../../../server/data/game/reborn/scroll-skills.json'

// The ninjutsu players learn on level-up (RES/skill/UpSkilCfg.ini, RoleBaseSystem.java).
// Precursor=0 rows are the "secondary" skills: one random one per level gained, up to MaxLevel 1,
// without the UpSkillLimit.ini level gate. Precursor=1 rows are the "primary" skills: one random
// one every 10th level, gated by UpSkillLimit.ini (level 1, 11, 31, 51, 71, 91 per skill level).

/** 20 ids 18xx (12 active, 8 trigger) and 20 ids 38xx (trigger), all at skill level 1. */
export const LEARNABLE_NINJUTSU = [
  1802, 1803, 1805, 1807, 1808, 1810, 1813, 1814, 1815, 1816, 1822, 1823, 1825, 1826, 1827, 1828,
  1829, 1830, 1832, 1839, 3802, 3803, 3804, 3805, 3806, 3807, 3809, 3810, 3811, 3812, 3813, 3814,
  3815, 3819, 3820, 3821, 3822, 3825, 3826, 3827,
]

/** Passive element skills (type 3), learned every 10th level. */
export const ELEMENT_PASSIVES = [2801, 2802, 2803, 2804, 2805, 2806, 2807, 2808, 2809, 2810]

/**
 * NationUpSkill.ini, by nation (0 Fire ... 4 Lightning): RefreshPlayerSkill adds one level of
 * this passive, so every ninja has it at level 1 or more.
 */
export const NATION_PASSIVES = [2801, 2802, 2803, 2805, 2804]

/**
 * SkillSystem.GetSkillProbability: the chance plus SkillAddN % 100 of the skill's element tree.
 * The passives add 500-3000 (whole hundreds) or 3, so most of it comes out as 0, as in the original.
 */
export function skillChance(
  skill: { id?: number; javascript?: string; probability?: number; skilladdtype?: number },
  skillAdd: readonly number[],
) {
  const base = skill.probability ?? 0
  const tree = skill.skilladdtype ?? -1
  const chance = tree < 0 ? base : base + ((skillAdd[tree] ?? 0) % 100)
  const scroll = scrolls[String(skill.id) as keyof typeof scrolls]
  return scroll && skill.javascript === `skill/skill_scroll_${skill.id}.js`
    ? Math.max(0, Math.min(scroll.castChance[1]!, chance))
    : chance
}
