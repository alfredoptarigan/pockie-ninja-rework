// Dev-only skill showcase: one scripted replay in which every skill with Reborn art is cast once,
// so all ninjutsu effects and outfit ultimates can be checked by eye in the real battle player.
// Ninjutsu are cast by the player (attacker) on a dummy; an ultimate needs its own outfit, so each
// outfit with ultimates steps in as the next defender and casts them on the player.
import effectsJson from '../../generated/reborn-skill-effects.json'
import techniquesJson from '../../generated/reborn-secret-techniques.json'
import type { ArenaLook } from '../../../../shared/src/schemas/arena'
import { outfitName } from '../text'
import type { FightEvent, Replay } from '../types'

export interface ShowcaseSkill {
  id: number
  kind: 'ninjutsu' | 'ultimate'
  /** Outfit that casts an ultimate. */
  clothing?: number
  /** Whether the skill has its own effect atlas (ultimates always do). */
  hasArt: boolean
}

interface EffectEntry {
  atlas?: string
  onPet?: boolean
}

/** Normal attacks and the shared hand seal are not skills of their own; pet skills need a pet. */
const NOT_SHOWN = new Set([1, 2, 9999])
const DUMMY_OUTFIT = 1
const HP = 1_000_000
const DAMAGE = 100

const effects = effectsJson as unknown as Record<string, EffectEntry>
const techniques = techniquesJson as unknown as Record<string, { clothing: number }>

export const showcaseSkills: ShowcaseSkill[] = [
  ...Object.entries(effects)
    .filter(([id, effect]) => !NOT_SHOWN.has(Number(id)) && !effect.onPet)
    .map(([id, effect]) => ({ id: Number(id), kind: 'ninjutsu' as const, hasArt: !!effect.atlas })),
  ...Object.entries(techniques).map(([id, technique]) => ({
    id: Number(id),
    kind: 'ultimate' as const,
    clothing: technique.clothing,
    hasArt: true,
  })),
]

const fighter = (index: number, side: 'attackers' | 'defenders', name: string, level: number) => ({
  index,
  side,
  name,
  level,
  maxHp: HP,
  startHp: HP,
  hp: HP,
  maxMp: HP,
  startMp: HP,
  mp: HP,
})

const cast = (actor: number, target: number, skillId: number): FightEvent[] => [
  { actor, event: 1 },
  { actor, event: 14, target, skillId, damage: DAMAGE, hit: true },
  { actor, event: 2 },
]

/** The replay casting `skills` in order, with how each defender is drawn. */
export function showcaseReplay(
  skills: ShowcaseSkill[],
  player: { name: string; level: number },
): { replay: Replay; defenderLooks: ArenaLook[] } {
  const ninjutsu = skills.filter((s) => s.kind === 'ninjutsu')
  const outfits = [
    ...new Set(skills.flatMap((s) => (s.kind === 'ultimate' && s.clothing ? [s.clothing] : []))),
  ]
  const defenderOutfits = [...(ninjutsu.length || !outfits.length ? [DUMMY_OUTFIT] : []), ...outfits]
  const fighters = [
    fighter(0, 'attackers', player.name, player.level),
    ...defenderOutfits.map((clothing, i) => fighter(i + 1, 'defenders', outfitName(clothing), 1)),
  ]

  const events: FightEvent[] = ninjutsu.flatMap((s) => cast(0, 1, s.id))
  let onStage = 1
  for (const clothing of outfits) {
    const next = defenderOutfits.lastIndexOf(clothing) + 1
    if (next !== onStage) {
      events.push({ actor: onStage, event: 20 }, { actor: next, event: 21 })
      onStage = next
    }
    for (const s of skills) {
      if (s.kind === 'ultimate' && s.clothing === clothing) events.push(...cast(next, 0, s.id))
    }
  }
  return {
    replay: { seed: 0, fighters, events, winner: 'attackers' },
    defenderLooks: defenderOutfits.map((clothing) => ({ clothing })),
  }
}
