// Decision 17: a block stops team invites and applications, in either direction.
// ponytail: local stand-in for `isBlocked` from server/src/modules/social/ (task 5); swap the
// import once it lands.
import { and, eq, inArray, or } from 'drizzle-orm'
import { blocks } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'

/** True when `a` blocked any of `others` or any of them blocked `a`. */
export async function isBlocked(tx: Tx, a: string, others: string[]) {
  if (others.length === 0) return false
  const [row] = await tx
    .select({ ownerId: blocks.ownerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.ownerId, a), inArray(blocks.blockedId, others)),
        and(inArray(blocks.ownerId, others), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1)
  return Boolean(row)
}
