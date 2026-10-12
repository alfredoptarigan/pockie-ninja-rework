// Sheet and frame math for the exported motion sheets (see generated/game-assets.ts). Pure, so the
// Phaser scenes and the tests share it.
import {
  gameMotions,
  SKILL_MOTIONS_URL,
  type MotionSet,
  type MotionSheet,
  type SkillMotions,
} from '../../generated/game-assets'

export const STAND = '999'
export const RUN = '55'
export const DIE = '57'
export const VICTORY = '59'
export const HIT_LIGHT = '63'
export const HIT_HEAVY = '64'
export const DODGE = '68'
/** Skill id of the normal attack (skill.ini 1, secondid 1). */
export const NORMAL_ATTACK_SKILL = 1
const NORMAL_ATTACK_MOTION = '52'

export const tickMs = (fps: number) => 1000 / fps
export const sheetTicks = (sheet: MotionSheet) => sheet.durations.reduce((sum, d) => sum + d, 0)

/** Cell shown at `tick` (cell i lasts durations[i] ticks); loops or holds the last cell. */
export function frameAt(durations: number[], tick: number, loop: boolean) {
  const total = durations.reduce((sum, d) => sum + d, 0)
  if (total <= 0) return 0
  let t = loop
    ? ((Math.floor(tick) % total) + total) % total
    : Math.min(Math.floor(tick), total - 1)
  for (let i = 0; i < durations.length; i++) {
    t -= durations[i]!
    if (t < 0) return i
  }
  return durations.length - 1
}

/** Phaser origin that puts the sheet's registration point on the sprite position. */
export const originOf = (sheet: MotionSheet) => ({
  x: sheet.anchor.x / sheet.frameWidth,
  y: sheet.anchor.y / sheet.frameHeight,
})

/** A fighter's motions plus where its skill motions are listed in skill-motions.json. */
export interface FighterArt {
  set: MotionSet
  skills: { group: keyof SkillMotions; key: string }
}

export function outfitArt(clothing: number): FighterArt | undefined {
  const set = gameMotions.outfits[String(clothing)]
  return set && { set, skills: { group: 'outfits', key: String(clothing) } }
}

export function monsterArt(npcId: string): FighterArt | undefined {
  const key = gameMotions.monsters[npcId]
  const set = key ? gameMotions.mobs[key] : undefined
  return set && key ? { set, skills: { group: 'mobs', key } } : undefined
}

/** Sheet of a motion id, falling back to the stand motion. */
export const sheetOf = (art: FighterArt | undefined, motion: string) =>
  art ? (art.set.motions[motion] ?? art.set.motions[STAND]) : undefined

/** Motion played for a skill: skill-motions.json, else the normal attack, else stand. */
export function skillMotion(
  art: FighterArt | undefined,
  skillId: number | undefined,
  skillMotions: SkillMotions | null,
) {
  if (!art) return STAND
  const id = skillId ?? NORMAL_ATTACK_SKILL
  const listed = skillMotions?.[art.skills.group][art.skills.key]?.[String(id)]
  if (listed && art.set.motions[listed]) return listed
  return art.set.motions[NORMAL_ATTACK_MOTION] ? NORMAL_ATTACK_MOTION : STAND
}

let skillMotionsRequest: Promise<SkillMotions | null> | null = null
/** skill-motions.json (about 200 KB, fetched once when the first battle plays). */
export function loadSkillMotions() {
  skillMotionsRequest ??= fetch(SKILL_MOTIONS_URL)
    .then((res) => (res.ok ? (res.json() as Promise<SkillMotions>) : null))
    .catch(() => null)
    .then((data) => {
      if (!data) skillMotionsRequest = null // retry on the next battle
      return data
    })
  return skillMotionsRequest
}
