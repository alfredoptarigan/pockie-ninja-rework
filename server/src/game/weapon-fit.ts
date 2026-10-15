// Reborn's Weapon Type: an outfit fights with Sharp, Blunt or Fists weapons, or Any. A worn weapon
// that its set's outfit cannot use is taken off into the bag (decided for the Reborn data, which
// changed many outfits' type). Nothing is lost: the bag row only leaves its slot and placeBag
// gives it a tile, on an overflow page when the usable pages are full (bag.ts).
import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { characters, inventoryItems } from '../db/schema.js'
import { bagItemsWhere, fitsOutfit, placeBag } from './bag.js'
import { item } from './data.js'
import { OUTFIT_SLOT, outfitOf } from './outfit.js'
import type { Tx } from './progress.js'

const WEAPON_SLOT = 'Weapon'
/** Set I's outfit stands in for a set that wears none (Reborn's fallback, see outfit.ts). */
const FALLBACK_SET = 1

/**
 * Takes off every worn weapon, in any equipment set, that the set's outfit (else set I's, else the
 * character's avatar) cannot use. Idempotent; returns how many came off. The caller holds the
 * character lock.
 */
export async function unequipMisfitWeapons(tx: Tx, characterId: string, avatarId: number) {
  const worn = await tx
    .select()
    .from(inventoryItems)
    .where(
      and(
        bagItemsWhere(characterId),
        inArray(inventoryItems.equippedSlot, [OUTFIT_SLOT, WEAPON_SLOT]),
      ),
    )
  const outfits = new Map(
    worn
      .filter((row) => row.equippedSlot === OUTFIT_SLOT)
      .map((row) => [row.equippedSet, outfitOf(row.itemId)?.avatarId]),
  )
  const misfits = worn.filter((row) => {
    const def = item(row.itemId)
    if (row.equippedSlot !== WEAPON_SLOT || !def) return false
    const wearer = outfits.get(row.equippedSet) ?? outfits.get(FALLBACK_SET) ?? avatarId
    return !fitsOutfit(def, wearer)
  })
  if (!misfits.length) return 0
  await tx
    .update(inventoryItems)
    .set({ equippedSlot: null })
    .where(
      inArray(
        inventoryItems.id,
        misfits.map((row) => row.id),
      ),
    )
  await placeBag(tx, characterId)
  return misfits.length
}

/**
 * The one-off repair for saves made before the Reborn Weapon Types: every character wearing a
 * weapon, each under its own row lock. Safe to run on every start. Returns the weapons taken off.
 * ponytail: one transaction per character with a worn weapon; batch it if that list grows large.
 */
export async function unequipMisfitWeaponsEverywhere(db: Db) {
  const wearers = await db
    .selectDistinct({ id: inventoryItems.characterId })
    .from(inventoryItems)
    .where(eq(inventoryItems.equippedSlot, WEAPON_SLOT))
  let taken = 0
  for (const { id } of wearers) {
    taken += await db.transaction(async (tx) => {
      const [character] = await tx
        .select({ avatarId: characters.avatarId })
        .from(characters)
        .where(eq(characters.id, id))
        .for('update')
      return character ? unequipMisfitWeapons(tx, id, character.avatarId) : 0
    })
  }
  return taken
}
