// The arena defence snapshot (decision 9): the fighter of live fights at full HP and MP, stored
// on arena_players and refreshed on every gear, level or skill change.
import { eq } from 'drizzle-orm'
import { arenaPlayers, characters, inventoryItems, type ArenaSnapshot } from '../../db/schema.js'
import { equippedGear, type Gear } from '../../game/equipment.js'
import { characterSkillInputs, scrollSkillExpiries } from '../../game/skill-bar.js'
import { talentFighterInput } from '../../game/talents.js'
import { bloodlineBonuses } from '../../game/bloodlines.js'
import { wingBonuses } from '../../game/wings.js'
import { collectionBonuses } from '../../game/collection.js'
import { sanninBonuses } from '../../game/sannin.js'
import { activePetFighterInput } from '../../game/pets.js'
import { activeBuffs, buffBonuses, sumBonuses } from '../../game/nonfight-buffs.js'
import { playerFighterFrom, wingLook, type PlayerFighter } from '../../game/combat.js'
import type { Tx } from '../../game/progress.js'

type CharacterRow = typeof characters.$inferSelect

export interface ArenaFighter {
  /** Rebuild the defence once its earliest timed effect expires. */
  buffExpiresAt?: string
  fighter: PlayerFighter
  /** How the ninja is drawn in a replay. */
  look: {
    clothing: number
    weaponItemId?: string
    wingSprite?: string
    aura?: string
    pet?: { species: string; avatar: number }
  }
  /** What it was built from; a stored snapshot with another source is stale (decision 9). */
  source: string
}

/** A ninja as an arena fighter: playerFighterFrom with the equipped rows, at full HP and MP. */
export async function arenaFighter(tx: Tx, character: CharacterRow): Promise<ArenaFighter> {
  // equippedGear returns the worn rows (the outfit with its recast ISV), so fights and the
  // defence count the same Recast stats.
  const equipped = (await equippedGear(tx, character.id)) as (typeof inventoryItems.$inferSelect &
    Pick<Gear, 'isv'>)[]
  const bloodlines = await bloodlineBonuses(tx, character.id)
  const wings = await wingBonuses(tx, character.id)
  const collection = await collectionBonuses(tx, character.id)
  const sannin = await sanninBonuses(tx, character.id)
  const pet = await activePetFighterInput(tx, character.id)
  const live = playerFighterFrom(
    character,
    equipped,
    sumBonuses(
      await buffBonuses(tx, character.id),
      bloodlines,
      wings,
      collection,
      sannin,
      pet?.bonuses ?? {},
    ),
    await characterSkillInputs(tx, character.id),
  )
  const expiries = [
    ...(await activeBuffs(tx, character.id)).flatMap((row) =>
      row.expiresAt ? [row.expiresAt.getTime()] : [],
    ),
    // A 7-day scroll skill leaving the fighter also invalidates the stored defence.
    ...(await scrollSkillExpiries(tx, character.id)),
  ]
  const talents = await talentFighterInput(tx, character.id)
  const weapon = equipped.find((row) => row.equippedSlot === 'Weapon')
  const { name, gender, level, avatarId, nation } = character
  // Drawn in the Visual Outfit when one is set; stats come from avatarId.
  const clothing = character.visualClothing ?? character.clothing
  const gear = [...equipped].sort((x, y) => x.id.localeCompare(y.id))
  return {
    ...(expiries.length > 0 && { buffExpiresAt: new Date(Math.min(...expiries)).toISOString() }),
    fighter: { ...live, hp: live.maxHp, mp: live.maxMp, talents, ...(pet && { pet: pet.pet }) },
    look: {
      clothing,
      ...(weapon && { weaponItemId: weapon.itemId }),
      ...wingLook(equipped),
      ...(pet && { pet: { species: pet.pet.species, avatar: pet.pet.avatar } }),
    },
    // Nation adds its element passive; it also marks snapshots from before passives as stale.
    source: JSON.stringify([
      name,
      gender,
      level,
      avatarId,
      character.clothing,
      clothing,
      nation,
      gear,
      talents,
      bloodlines,
      wings,
      pet,
      // Only when set, so snapshots without a collection keep their source.
      ...(Object.keys(collection).length > 0 ? [collection] : []),
      ...(Object.keys(sannin).length > 0 ? [sannin] : []),
    ]),
  }
}

export const toSnapshot = (fighter: ArenaFighter) => fighter as unknown as ArenaSnapshot
export const fromSnapshot = (snapshot: ArenaSnapshot) => snapshot as unknown as ArenaFighter

/**
 * Rebuilds the defence snapshot of a ninja who has joined the arena (no-op otherwise). Call it
 * inside the transaction that changed gear, level or skills, after the change, with the
 * character row already locked (it then locks the arena row: characters first, arena rows next).
 */
export async function refreshArenaSnapshot(tx: Tx, characterId: string) {
  const [joined] = await tx
    .select({ id: arenaPlayers.characterId })
    .from(arenaPlayers)
    .where(eq(arenaPlayers.characterId, characterId))
  if (!joined) return
  const [character] = await tx.select().from(characters).where(eq(characters.id, characterId))
  await tx
    .update(arenaPlayers)
    .set({ snapshot: toSnapshot(await arenaFighter(tx, character!)), snapshotAt: new Date() })
    .where(eq(arenaPlayers.characterId, characterId))
}
