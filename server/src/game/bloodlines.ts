// Fight bonuses of a ninja's active limits (M5 decision 11), with socketed souls and prayer.
// Lives in game/ so combat.ts and snapshot.ts do not import the bloodlines routes.
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import type { Bonuses } from '@pockie/game-core'
import { limitBonuses } from '../../../game-core/src/reborn/bloodlines.js'
import type { Db } from '../db/client.js'
import { characterBloodlinePrayer, characterBloodlines, characterSouls } from '../db/schema.js'
import { rebornSouls } from './data.js'
import type { Tx } from './progress.js'

/** Ids of the active limits, in slot order. */
export async function activeLimitIds(tx: Tx | Db, characterId: string) {
  const rows = await tx
    .select({ limitId: characterBloodlines.limitId, slot: characterBloodlines.activeSlot })
    .from(characterBloodlines)
    .where(
      and(
        eq(characterBloodlines.characterId, characterId),
        isNotNull(characterBloodlines.activeSlot),
      ),
    )
  return rows.sort((a, b) => a.slot! - b.slot!).map((r) => r.limitId)
}

/** `Partial<Bonuses>` of the active limits; `{}` when none are active. */
export async function bloodlineBonuses(
  tx: Tx | Db,
  characterId: string,
): Promise<Partial<Bonuses>> {
  const active = await activeLimitIds(tx, characterId)
  if (active.length === 0) return {}
  const souls = await tx
    .select({
      type: characterSouls.type,
      level: characterSouls.level,
      limit: characterSouls.limitId,
    })
    .from(characterSouls)
    .where(
      and(eq(characterSouls.characterId, characterId), inArray(characterSouls.limitId, active)),
    )
  const prayers = await tx
    .select()
    .from(characterBloodlinePrayer)
    .where(
      and(
        eq(characterBloodlinePrayer.characterId, characterId),
        inArray(characterBloodlinePrayer.limitId, active),
      ),
    )
  const attributes = rebornSouls().prayer.attributes
  return limitBonuses(
    active,
    souls,
    prayers.map((p) => ({
      limit: p.limitId,
      attribute: attributes[p.attribute - 1]!,
      level: p.level,
    })),
  )
}
