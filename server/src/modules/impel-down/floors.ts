// Impel Down floors: who guards each floor, its EXP and its crystal drops. Reborn sends these from
// its server (reborn-lazy-features.md "Impel Down": per-floor enemies, EXP and drop chances are
// UNKNOWN) and our 2011 data has no tower like it, so everything numeric here comes from
// IMPEL_DOWN_PLACEHOLDERS. Reborn's own rules: 6 gates x 25 floors, gate levels 61-111, and a
// guaranteed crystal every 5th floor. The enemies reuse the Scroll Dungeons boss pool and builds.
import type { Bonuses, FighterInput } from '@pockie/game-core'
import { IMPEL_DOWN_RULES } from '../../../../shared/src/schemas/impel-down.js'
import { sumBonuses } from '../../game/nonfight-buffs.js'
import { BOSSES, bossFighter, type Boss } from '../dungeons/bosses.js'

/**
 * PLACEHOLDER VALUES, NOT REBORN'S: confirm or replace. Tuned by simulation (impel-down
 * floors.test.ts): an equally geared level-61 ninja with no learned skills wins about 3 in 4 of
 * gate 1's first floors and about 1 in 4 of its last ones; each later gate starts at its own entry
 * level, so a ninja at that level meets the same curve.
 */
export const IMPEL_DOWN_PLACEHOLDERS = {
  /** Enemy level = the gate's entry level + floor(floor index * this) (gate 1: 61-70). */
  levelPerFloor: 0.4,
  /**
   * Per mille hpMul and attackMul on the enemy (on top of the challenger's own gear bonuses, like a
   * dungeon boss): `start` on floor 1, + `step` a floor.
   */
  statMul: { start: -200, step: 8 },
  /**
   * The enemy's least weapon attack per enemy level (about a same-level 2011 weapon: 143-170 at
   * 61), used when the challenger's own is lower, so taking the weapon off does not disarm it.
   */
  weaponPerLevel: { minAttack: 2.3, maxAttack: 2.8 },
  /** EXP for a won floor: this x enemy level x (1 + floor index / 5). */
  expPerLevel: 100,
  /** Chance in percent that a floor without a guaranteed crystal drops one. */
  crystalChance: 15,
  /**
   * Tier weights (Blue, Purple, Orange) of the dropped crystal: ordinary floors, guaranteed 5th
   * floors, and floor 25. The gate picks the crystal's numeral: gate N drops crystals N (I-VI),
   * whose weapon slot opens once gate N - 1 is cleared.
   */
  tiers: {
    floor: [100, 0, 0],
    fifth: [80, 20, 0],
    last: [0, 85, 15],
  } satisfies Record<string, [number, number, number]>,
} as const

const { floorsPerGate, gateLevels, guaranteedEvery } = IMPEL_DOWN_RULES
const P = IMPEL_DOWN_PLACEHOLDERS

export const gateLevel = (gate: number) => gateLevels[gate]!

export const enemyLevel = (gate: number, floor: number) =>
  gateLevel(gate) + Math.floor(floor * P.levelPerFloor)

/** The floor's enemy: the dungeon pool in turn, one per floor over all gates. */
export const floorBoss = (gate: number, floor: number): Boss =>
  BOSSES[(gate * floorsPerGate + floor) % BOSSES.length]!

/** The floor's extra hpMul / attackMul (per mille). */
export function floorBonuses(floor: number): Partial<Bonuses> {
  const mul = P.statMul.start + P.statMul.step * floor
  return { hpMul: mul, attackMul: mul }
}

/** The floor's enemy at full HP and MP, scaled on the challenger's gear bonuses. */
export function floorEnemy(gate: number, floor: number, gear: Partial<Bonuses>): FighterInput {
  const level = enemyLevel(gate, floor)
  const armed = {
    ...gear,
    minAttack: Math.max(gear.minAttack ?? 0, Math.round(P.weaponPerLevel.minAttack * level)),
    maxAttack: Math.max(gear.maxAttack ?? 0, Math.round(P.weaponPerLevel.maxAttack * level)),
  }
  return bossFighter(floorBoss(gate, floor), level, sumBonuses(armed, floorBonuses(floor)))
}

export const floorExp = (gate: number, floor: number) =>
  Math.round(P.expPerLevel * enemyLevel(gate, floor) * (1 + floor / 5))

/** Floor index 4, 9, ... 24 (floors 5, 10, ... 25) always drop a crystal. */
export const guaranteed = (floor: number) => (floor + 1) % guaranteedEvery === 0

const TAB_BASES = [480_000, 480_030, 480_060]

/** The floor's drop table: [crystal iid, chance in percent], Sharp, Blunt, Fist per tier. */
export function floorDrops(gate: number, floor: number): [number, number][] {
  const weights =
    floor === floorsPerGate - 1 ? P.tiers.last : guaranteed(floor) ? P.tiers.fifth : P.tiers.floor
  const total = guaranteed(floor) ? 100 : P.crystalChance
  const weightSum = weights.reduce((a, b) => a + b, 0)
  return weights.flatMap((weight, tier) =>
    weight === 0
      ? []
      : TAB_BASES.map((base): [number, number] => {
          const iid = base + 10 * tier + gate + 1
          const chance = (total * weight) / weightSum / TAB_BASES.length
          return [iid, Math.round(chance * 100) / 100]
        }),
  )
}
