import { and, eq, inArray } from 'drizzle-orm'
import { characterBuffs } from '../../db/schema.js'
import { rebornEvents } from '../../game/data.js'
import { activeBuffs, useBuffItem } from '../../game/nonfight-buffs.js'
import type { Tx } from '../../game/progress.js'

export const DICE_BUFF_IDS = [80101, 80102, 80201, 80202]
export async function diceBuffs(tx: Tx, characterId: string, now: Date) {
  return (await activeBuffs(tx, characterId, now)).filter((row) =>
    DICE_BUFF_IDS.includes(row.buffId),
  )
}
/** Uses the same replacement and stat path as food; coordinator merges the Reborn definitions. */
export async function applyDiceBuff(tx: Tx, characterId: string, buffId: number | null, now: Date) {
  // A neutral result leaves the current effect intact. A blessing or curse replaces group 3.
  if (buffId === null) return
  const duration = rebornEvents().dice.durationSeconds[String(buffId)]!
  const definition = {
    JavaScript: 'item/FoodItem.js',
    BufferID: buffId,
    BufferLastTime: duration,
  } as unknown as NonNullable<Parameters<typeof useBuffItem>[3]>
  await useBuffItem(tx, characterId, `dice:${buffId}`, definition, now)
}
export async function removeDiceCurse(tx: Tx, characterId: string) {
  await tx
    .delete(characterBuffs)
    .where(
      and(
        eq(characterBuffs.characterId, characterId),
        inArray(characterBuffs.buffId, [80201, 80202]),
      ),
    )
}
