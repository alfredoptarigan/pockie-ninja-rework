import type { VisualReplay } from './companions'

/** Cast techniques only: replay buff events can carry status ids instead of skill ids. */
export function replayTechniques(replay: VisualReplay, fighter: number) {
  return [
    ...new Set(
      replay.events
        .filter(
          (e) =>
            e.actor === fighter &&
            !e.isPet &&
            [5, 7, 14].includes(e.event) &&
            e.skillId &&
            e.skillId !== 1,
        )
        .map((e) => e.skillId!),
    ),
  ].slice(0, 15)
}

/** Reborn's icon remap (main.js 79531) plus the element passives' shifted ids. */
const ICON_IDS: Record<number, number> = {
  3809: 1809,
  50087: 50034,
  50088: 50035,
  40180: 1808,
  40181: 40052,
}

export const techniqueIcon = (id: number) =>
  `/assets/reborn/icons/skills/${id >= 2801 && id <= 2810 ? id - 1 : (ICON_IDS[id] ?? id)}.webp`

/** Slots of Reborn's fight panel: 5 x 3 skills, 3 x 3 pet skills (its 11 scroll past row 3). */
export const SKILL_SLOTS = 15
export const PET_SKILL_SLOTS = 9

/**
 * The panel's skill grid: the fighter's skills without its pet's, in the replay's order (Reborn's
 * `role.skills` minus `petSkills`). Replays before the panel field show the cast techniques.
 */
export function panelSkills(replay: VisualReplay, fighter: number) {
  const panel = replay.fighters[fighter]?.panel
  if (!panel) return replayTechniques(replay, fighter)
  return panel.skills.filter((id) => !panel.petSkills.includes(id)).slice(0, SKILL_SLOTS)
}

export const panelPetSkills = (replay: VisualReplay, fighter: number) =>
  (replay.fighters[fighter]?.panel?.petSkills ?? []).slice(0, PET_SKILL_SLOTS)

type Fighter = VisualReplay['fighters'][number]

/**
 * Reborn's stat rows (fight__stat-row): Attack and Speed alone, then Break / Def, Pierce / Block,
 * Hit / Dodge and Crit / Con in two columns. Speed is the attack interval in seconds.
 */
export function panelStats(fighter: Fighter): [string, string][][] {
  const p = fighter.panel
  if (!p) return []
  const n = (value: number) => String(Math.round(value))
  return [
    [['Attack:', `${n(p.minAttack)} - ${n(p.maxAttack)}`]],
    [['Speed:', (p.atkTime / 1000).toFixed(2)]],
    [
      ['Break:', n(p.neglectDefense)],
      ['Def:', n(p.defense)],
    ],
    [
      ['Pierce:', n(p.pierce)],
      ['Block:', n(p.parry)],
    ],
    [
      ['Hit:', n(p.hit)],
      ['Dodge:', n(p.dodge)],
    ],
    [
      ['Crit:', n(p.crit)],
      ['Con:', n(p.tough)],
    ],
  ]
}
