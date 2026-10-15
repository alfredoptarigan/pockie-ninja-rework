// Pet facts shared by the Kennel and the item tooltip (kept apart so ItemTooltip does not import
// the Kennel window, which imports ItemTooltip for the pet slot).

/** Reborn's pet_nature__1..6. */
export const NATURES: Record<number, string> = {
  1: 'Plant',
  2: 'Beast',
  3: 'Artificial',
  4: 'Dragon',
  5: 'Tailed Beast',
  6: 'Spirits',
}

export const petSkillIcon = (id: number) => `/assets/reborn/icons/skills/${id}.webp`
