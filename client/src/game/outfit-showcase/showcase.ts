// Dev-only outfit showcase: every outfit with motion art, and a short scripted replay per outfit
// (normal attack, a hit taken, its own ultimates) to check its art by eye in the battle player.
import { gameMotions } from '../../generated/game-assets'
import techniquesJson from '../../generated/reborn-secret-techniques.json'
import type { ArenaLook } from '../../../../shared/src/schemas/arena'
import { NORMAL_ATTACK_SKILL } from '../phaser/motion'
import { outfitName } from '../text'
import type { FightEvent, Replay } from '../types'

export interface ShowcaseOutfit {
  clothing: number
  /** Motion ids with a sheet, in id order. */
  motions: string[]
  /** Ultimates whose art belongs to this outfit. */
  ultimates: number[]
}

const DUMMY_OUTFIT = 1
const HP = 1_000_000
const DAMAGE = 100

const techniques = techniquesJson as unknown as Record<string, { clothing: number }>
const byNumber = (a: number, b: number) => a - b

export const showcaseOutfits: ShowcaseOutfit[] = Object.entries(gameMotions.outfits)
  .map(([id, outfit]) => ({
    clothing: Number(id),
    motions: Object.keys(outfit.motions).sort((a, b) => byNumber(Number(a), Number(b))),
    ultimates: Object.entries(techniques)
      .filter(([, technique]) => technique.clothing === Number(id))
      .map(([skill]) => Number(skill))
      .sort(byNumber),
  }))
  .sort((a, b) => a.clothing - b.clothing)

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

/** The outfit (attacker, drawn as the player) against a dummy defender. */
export function outfitReplay(
  outfit: Pick<ShowcaseOutfit, 'clothing' | 'ultimates'>,
  player: { level: number },
): { replay: Replay; defenderLooks: ArenaLook[] } {
  const events: FightEvent[] = [
    ...cast(0, 1, NORMAL_ATTACK_SKILL),
    ...cast(1, 0, NORMAL_ATTACK_SKILL),
    ...outfit.ultimates.flatMap((id) => cast(0, 1, id)),
  ]
  return {
    replay: {
      seed: 0,
      fighters: [
        fighter(0, 'attackers', outfitName(outfit.clothing), player.level),
        fighter(1, 'defenders', 'Dummy', 1),
      ],
      events,
      winner: 'attackers',
    },
    defenderLooks: [{ clothing: DUMMY_OUTFIT }],
  }
}
