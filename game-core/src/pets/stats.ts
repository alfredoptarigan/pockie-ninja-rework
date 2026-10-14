// Pet props (decision 11): rolled bases, level totals (NewPetSystem.RefreshPetProp) and what the
// totals give the master in a fight (ours, decision 11b).
import type { Random } from '../random.js'
import type { Bonuses } from '../stats.js'
import {
  EVOLVED_PERCENT,
  LEVEL_BAND_PERCENT,
  NATURE_BASE_PROPS,
  PET_PROPS,
  PROP_POINTS_PER_BONUS,
  type PetProps,
} from './constants.js'

const f = Math.fround
const mapProps = (fn: (prop: keyof PetProps) => number) =>
  Object.fromEntries(PET_PROPS.map((prop) => [prop, fn(prop)])) as PetProps

/** RefreshPetProp: `(int)(base * (1 + (float)level * ((float)growth / 100f)) + add)`. */
export function petTotals(
  bases: PetProps,
  level: number,
  growth: number,
  add: Partial<PetProps> = {},
): PetProps {
  const scale = 1 + f(level * f(growth / 100))
  return mapProps((prop) => Math.trunc(bases[prop] * scale + (add[prop] ?? 0)))
}

/** OnPetItemCreate: each base `prop * RandInt(80, 120) / 100`, in prop order. */
export const rollBases = (species: PetProps, random: Random): PetProps =>
  mapProps((prop) => Math.trunc((species[prop] * random.between(80, 120)) / 100))

/** Ours (11b): the nature profile scaled by the Reborn required level and evolution. */
export function speciesBaseProps(nature: number, requiredLevel: number, evolved: boolean) {
  const profile = NATURE_BASE_PROPS[nature] ?? NATURE_BASE_PROPS[2]!
  const percent = (LEVEL_BAND_PERCENT[requiredLevel] ?? 100) * (evolved ? EVOLVED_PERCENT : 100)
  return mapProps((prop) => Math.trunc((profile[prop] * percent) / 10_000))
}

/** Ours (11b): master bonus points from the pet's prop totals. */
export function petBonuses(totals: PetProps): Partial<Bonuses> {
  const points = (prop: keyof PetProps) => Math.trunc(totals[prop] / PROP_POINTS_PER_BONUS[prop])
  const attack = points('attack')
  return {
    minAttack: attack,
    maxAttack: attack,
    defense: points('defence'),
    hit: points('disturb'),
    dodge: points('active'),
    crit: points('savvy'),
  }
}
