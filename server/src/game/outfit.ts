// Outfits as items (Reborn's Outfit slot): an AvatarItem worn in the 'Outfit' slot of an
// equipment set. characters.clothing / avatar_id always follow the active set's outfit, else set
// I's (Reborn's fallback); syncOutfit keeps them in step after an equip or a set switch.
import { and, eq } from 'drizzle-orm'
import { characters, inventoryItems } from '../db/schema.js'
import { item } from './data.js'
import type { Tx } from './progress.js'

export const OUTFIT_SLOT = 'Outfit'
/** Outfit levels run 1-32; the requirement grows over levels 2-32. */
const LEVEL_STEPS = 31

/**
 * Reborn's outfit level requirement: ceil((level - 1) * r / 31), r by the outfit value
 * (our JudgeValueScore: 27 -> 0, 35 -> 20, 60 -> 60, anything else -> 50).
 */
export function outfitRequiredLevel(level: number, value: number) {
  const max = value === 27 ? 0 : value === 35 ? 20 : value === 60 ? 60 : 50
  return Math.ceil(((level - 1) * max) / LEVEL_STEPS)
}

export interface OutfitFacts {
  clothing: number
  avatarId: number
  /** Reborn's "+N": the AvatarLevel (1-32). */
  plus: number
  /** Required character level. */
  level: number
}

/** The outfit facts of an AvatarItem id, or undefined for any other item. */
export function outfitOf(itemId: string): OutfitFacts | undefined {
  const def = item(itemId)
  if (def?.class !== 'AvatarItem') return undefined
  const plus = Number(def.AvatarLevel)
  return {
    clothing: Number(def.Clothing),
    avatarId: Number(def.AvatarID),
    plus,
    level: outfitRequiredLevel(plus, Number(def.JudgeValueScore ?? 0)),
  }
}

const outfitInSet = async (tx: Tx, characterId: string, set: number) => {
  const [row] = await tx
    .select({ itemId: inventoryItems.itemId })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.characterId, characterId),
        eq(inventoryItems.equippedSlot, OUTFIT_SLOT),
        eq(inventoryItems.equippedSet, set),
      ),
    )
  return row && outfitOf(row.itemId)
}

/**
 * Sets clothing / avatar_id from the active set's outfit, else set I's; leaves them as they are
 * when neither wears one. The caller holds the character lock.
 */
export async function syncOutfit(tx: Tx, characterId: string, activeSet: number) {
  const outfit =
    (await outfitInSet(tx, characterId, activeSet)) ?? (await outfitInSet(tx, characterId, 1))
  if (!outfit) return
  await tx
    .update(characters)
    .set({ clothing: outfit.clothing, avatarId: outfit.avatarId })
    .where(eq(characters.id, characterId))
}
