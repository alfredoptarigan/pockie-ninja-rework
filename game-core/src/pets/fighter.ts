// The active pet on its master's fighter (decision 15): FighterInput.pet plus the bonuses that
// go into the master's deriveStats (props, ours 11b; Pass skills, skilladd 1:1).
import { petPassBonuses } from '../battle/scripts/pet-core.js'
import type { PetInput, SkillInput } from '../battle/types.js'
import type { Bonuses } from '../stats.js'
import type { PetProps } from './constants.js'
import { petBonuses, petTotals } from './stats.js'

export interface ActivePet {
  species: string
  avatar: number
  level: number
  growth: number
  bases: PetProps
  /** skill.ini rows of the slotted skills (with `ispet` and level); only Halo and Help ride along. */
  skills: readonly SkillInput[]
  /** pet-skills.json `skillAdd` of the slotted Pass skills. */
  passAdds: readonly Readonly<Record<string, number>>[]
}

/** `pet` goes on FighterInput.pet; `bonuses` join the master's sumBonuses before deriveStats. */
export function petFighterInput(active: ActivePet): { pet: PetInput; bonuses: Partial<Bonuses> } {
  const totals = petTotals(active.bases, active.level, active.growth)
  const bonuses: Partial<Bonuses> = { ...petBonuses(totals) }
  for (const [key, value] of Object.entries(petPassBonuses(active.passAdds))) {
    const term = key as keyof Bonuses
    bonuses[term] = (bonuses[term] ?? 0) + value
  }
  return {
    pet: {
      species: active.species,
      avatar: active.avatar,
      level: active.level,
      totals,
      skills: active.skills.filter((s) => s.ispet === 1 || s.ispet === 2),
    },
    bonuses,
  }
}
