// The arena defence snapshot (decision 9): the fighter of live fights at full HP and MP, stored
// on arena_players and refreshed on every gear, level or skill change.
import { and, eq, isNotNull } from 'drizzle-orm'
import { arenaPlayers, characters, inventoryItems, type ArenaSnapshot } from '../../db/schema.js'
import { characterSkillInputs } from '../../game/skill-bar.js'
import { activeBuffs, buffBonuses } from '../../game/nonfight-buffs.js'
import { playerFighterFrom, type PlayerFighter } from '../../game/combat.js'
import type { Tx } from '../../game/progress.js'

type CharacterRow = typeof characters.$inferSelect

export interface ArenaFighter {
  /** Rebuild the defence once its earliest timed effect expires. */
  buffExpiresAt?: string
  fighter: PlayerFighter
  /** How the ninja is drawn in a replay. */
  look: { clothing: number; weaponItemId?: string }
}

/** A ninja as an arena fighter: playerFighterFrom with the equipped rows, at full HP and MP. */
export async function arenaFighter(tx: Tx, character: CharacterRow): Promise<ArenaFighter> {
  const equipped = await tx
    .select()
    .from(inventoryItems)
    .where(
      and(eq(inventoryItems.characterId, character.id), isNotNull(inventoryItems.equippedSlot)),
    )
  const live = playerFighterFrom(
    character,
    equipped,
    await buffBonuses(tx, character.id),
    await characterSkillInputs(tx, character.id),
  )
  const expiries = (await activeBuffs(tx, character.id)).flatMap((row) =>
    row.expiresAt ? [row.expiresAt.getTime()] : [],
  )
  const weapon = equipped.find((row) => row.equippedSlot === 'Weapon')
  return {
    ...(expiries.length > 0 && { buffExpiresAt: new Date(Math.min(...expiries)).toISOString() }),
    fighter: { ...live, hp: live.maxHp, mp: live.maxMp },
    look: { clothing: character.clothing, ...(weapon && { weaponItemId: weapon.itemId }) },
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
