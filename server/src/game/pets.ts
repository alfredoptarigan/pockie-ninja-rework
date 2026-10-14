// The active pet outside the Kennel routes (M6 decisions 9, 12, 15): fight input for live fights
// and arena snapshots, the fight EXP share and the explore pet grant. Lives in game/ so combat.ts
// and snapshot.ts do not import the pets routes.
import { and, eq, isNotNull } from 'drizzle-orm'
import type { PetProps } from '../../../game-core/src/pets/constants.js'
import { petExpShare, petLevelFromExp } from '../../../game-core/src/pets/exp.js'
import { petFighterInput } from '../../../game-core/src/pets/fighter.js'
import type { Db } from '../db/client.js'
import { characterPets, characterPetSkills, characters } from '../db/schema.js'
import { rebornPets, rebornPetSkills, skill, type RebornPet } from './data.js'
import type { Tx } from './progress.js'

type PetRow = typeof characterPets.$inferSelect
type PetSkillRow = typeof characterPetSkills.$inferSelect

let speciesById: Map<string, RebornPet> | undefined
/** The Reborn species of a pet item id (i3200xx / i340710). */
export function petSpecies(itemId: string) {
  speciesById ??= new Map(rebornPets().map((pet) => [pet.item, pet]))
  return speciesById.get(itemId)
}

export const petBases = (pet: PetRow): PetProps => ({
  attack: pet.baseAttack,
  defence: pet.baseDefence,
  disturb: pet.baseDisturb,
  active: pet.baseActive,
  savvy: pet.baseSavvy,
})

/** Battle art avatar: own art, else the family base pet's, else the icon (answer 5). */
export const petAvatar = (species: RebornPet) => species.artAvatar ?? species.avatar

/** Real skills in slots (skill ids <= 0 mark an unlocked empty slot). */
export const slottedSkills = (rows: readonly PetSkillRow[]) =>
  rows.filter((row) => row.skillId > 0 && row.slot !== null)

/**
 * `petFighterInput(...)` of the active pet, or null without one. `pet` goes on the master's
 * FighterInput; `bonuses` join its sumBonuses. Pass skills only feed `bonuses` (their rows are not
 * returned as skills, so they never reach `learned`/passiveBonuses twice).
 */
export async function activePetFighterInput(tx: Tx | Db, characterId: string) {
  const [pet] = await tx
    .select()
    .from(characterPets)
    .where(and(eq(characterPets.characterId, characterId), eq(characterPets.active, true)))
  const species = pet && petSpecies(pet.species)
  if (!pet || !species) return null
  const rows = slottedSkills(
    await tx
      .select()
      .from(characterPetSkills)
      .where(and(eq(characterPetSkills.petId, pet.id), isNotNull(characterPetSkills.slot))),
  )
  const data = rebornPetSkills().skills
  return petFighterInput({
    species: pet.species,
    avatar: petAvatar(species),
    level: pet.level,
    growth: pet.growth,
    bases: petBases(pet),
    skills: rows
      .filter((row) => row.kind !== 3)
      .flatMap((row) => {
        const def = skill(row.skillId)
        return def ? [{ ...def, id: row.skillId, level: row.level }] : []
      }),
    passAdds: rows
      .filter((row) => row.kind === 3)
      .flatMap((row) => {
        const add = data[String(row.skillId)]?.skillAdd
        return add ? [add] : []
      }),
  })
}

/**
 * Decision 12: the active pet gets 50% of the master's field, toll gate and Las Noches fight EXP,
 * never passing the master's level. Call after the master's EXP is saved, inside the fight's
 * transaction (character row already locked). Returns the levels the pet gained.
 */
export async function grantPetExp(tx: Tx, characterId: string, masterExp: number) {
  const share = petExpShare(masterExp)
  if (share <= 0) return 0
  const [pet] = await tx
    .select()
    .from(characterPets)
    .where(and(eq(characterPets.characterId, characterId), eq(characterPets.active, true)))
    .for('update')
  if (!pet) return 0
  const [master] = await tx
    .select({ level: characters.level })
    .from(characters)
    .where(eq(characters.id, characterId))
  return addPetExp(tx, pet, share, master!.level)
}

/** Adds EXP to a pet (level cap 50 and the master's level); refreshes the arena if it levels. */
export async function addPetExp(tx: Tx, pet: PetRow, gained: number, masterLevel: number) {
  const next = petLevelFromExp(pet.level, pet.exp, gained, masterLevel)
  await tx
    .update(characterPets)
    .set({ level: next.level, exp: next.exp })
    .where(eq(characterPets.id, pet.id))
  if (next.levelsGained > 0 && pet.active) {
    // Dynamic: snapshot.ts imports combat.ts, which imports this file.
    const { refreshArenaSnapshot } = await import('../modules/arena/snapshot.js')
    await refreshArenaSnapshot(tx, pet.characterId)
  }
  return next.levelsGained
}

/**
 * Decision 9: an explore pet bonus (2011 `PetBonusAppend` i2830NN) grants the linked Reborn pet
 * item instead; ids without a link are returned unchanged.
 */
export const explorePetItem = (itemId: string) =>
  rebornPets().find((pet) => pet.link === itemId)?.item ?? itemId
